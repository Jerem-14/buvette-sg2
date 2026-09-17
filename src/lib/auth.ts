import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { isDemo, prefix, readRegister, redis } from './store';
import { verifyPassword } from './password';
import type { User } from './types';
const COOKIE = 'buvette_session',
  TTL = 60 * 60 * 24 * 7;
const globals = globalThis as typeof globalThis & {
  buvetteSessions?: Map<string, { userId: string; expires: number }>;
  buvetteLimits?: Map<string, { count: number; expires: number }>;
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length !== 64) return null;
  let userId: string | null = null;
  if (isDemo()) {
    const session = globals.buvetteSessions?.get(digest(token));
    if (session && session.expires > Date.now()) userId = session.userId;
  } else userId = await redis().get<string>(`${prefix()}:session:${digest(token)}`);
  if (!userId) return null;
  return (await readRegister()).users.find((u) => u.id === userId) ?? null;
}
export async function createSession(user: User): Promise<void> {
  const token = randomBytes(32).toString('hex');
  if (isDemo())
    (globals.buvetteSessions ??= new Map()).set(digest(token), {
      userId: user.id,
      expires: Date.now() + TTL * 1000,
    });
  else await redis().set(`${prefix()}:session:${digest(token)}`, user.id, { ex: TTL });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL,
  });
}
export async function logout(): Promise<void> {
  const jar = await cookies(),
    token = jar.get(COOKIE)?.value;
  if (token) {
    if (isDemo()) globals.buvetteSessions?.delete(digest(token));
    else await redis().del(`${prefix()}:session:${digest(token)}`);
  }
  jar.delete(COOKIE);
}
async function rateLimit(key: string, max: number) {
  if (isDemo()) {
    const limits = (globals.buvetteLimits ??= new Map());
    for (const [k, v] of limits) if (v.expires <= Date.now()) limits.delete(k);
    const entry = limits.get(key) ?? { count: 0, expires: Date.now() + 900_000 };
    entry.count++;
    limits.set(key, entry);
    return entry.count <= max;
  }
  const count = await redis().eval<[], number>(
    `local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 900) end; return n`,
    [`${prefix()}:login:${digest(key)}`],
    [],
  );
  return count <= max;
}
export async function authenticate(email: string, password: string): Promise<User | null> {
  const allowed = await Promise.all([rateLimit('global', 100), rateLimit(email.toLowerCase(), 10)]);
  if (!allowed.every(Boolean)) throw new Error('Trop de tentatives. Réessayez dans 15 minutes.');
  const state = await readRegister(),
    user = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  // Perform scrypt even for an unknown account to avoid trivial timing enumeration.
  const valid = await verifyPassword(
    password,
    user?.passwordHash ?? '00000000000000000000000000000000:' + '00'.repeat(64),
  );
  return user && valid ? user : null;
}
export function checkOrigin(request: Request): boolean {
  const expected =
    process.env.APP_URL ||
    (process.env.NODE_ENV !== 'production' ? new URL(request.url).origin : '');
  if (!expected) return false;
  return request.headers.get('origin') === new URL(expected).origin;
}
