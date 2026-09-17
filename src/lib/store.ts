import { Redis } from '@upstash/redis';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyCommand, project } from './domain';
import { BusinessError } from './errors';
import { createRegister } from './demo';
import type { Register, User } from './types';

const local = globalThis as typeof globalThis & {
  buvetteQueue?: Promise<unknown>;
  buvetteRedis?: Redis;
};
export const prefix = () => process.env.REDIS_KEY_PREFIX || 'buvette';
export const isDemo = () =>
  process.env.NODE_ENV !== 'production' &&
  !process.env.UPSTASH_REDIS_REST_URL &&
  !process.env.UPSTASH_REDIS_REST_TOKEN;
export function redis(): Redis {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)
    throw new Error(
      'Configurez les deux variables Redis Upstash avant de lancer l’application en production.',
    );
  return (local.buvetteRedis ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    automaticDeserialization: false,
  }));
}
export function decodeRegister(raw: string): Register {
  const state = JSON.parse(raw) as Register;
  if (state.schemaVersion !== 1)
    throw new Error('Version de données incompatible. Exécutez la migration.');
  return state;
}
const location = () =>
  path.join(process.cwd(), process.env.BUVETTE_DEMO_DATA_DIR || '.data', 'register.json');
async function saveFile(state: Register) {
  await mkdir(path.dirname(location()), { recursive: true });
  const temp = `${location()}.${crypto.randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(state), 'utf8');
  await rename(temp, location());
}
async function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = (local.buvetteQueue ?? Promise.resolve()).then(work);
  local.buvetteQueue = next.catch(() => undefined);
  return next;
}
async function readLocal(): Promise<Register> {
  try {
    return decodeRegister(await readFile(location(), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const state = await createRegister();
    await saveFile(state);
    return state;
  }
}
export async function readRegister(): Promise<Register> {
  if (isDemo()) return serial(readLocal);
  const raw = await redis().get<string>(`${prefix()}:registre`);
  if (!raw) throw new Error('Base non initialisée. Exécutez npm run db:seed.');
  return decodeRegister(raw);
}
// A single Redis key makes the register + audit commit indivisible.
export const CAS_SCRIPT = `local current = redis.call('GET', KEYS[1]); if not current then return -1 end; if cjson.decode(current).revision ~= tonumber(ARGV[1]) then return 0 end; redis.call('SET', KEYS[1], ARGV[2]); return 1`;
export async function mutate(input: unknown, actorId: string): Promise<Register> {
  const execute = (state: Register) => {
    const actor = state.users.find((u) => u.id === actorId);
    if (!actor) throw new Error('Session invalide.');
    return applyCommand(state, input, actor);
  };
  if (isDemo())
    return serial(async () => {
      const state = execute(await readLocal());
      await saveFile(state);
      return state;
    });
  for (let attempt = 0; attempt < 8; attempt++) {
    const previous = await readRegister(),
      next = execute(previous),
      data = JSON.stringify(next);
    if (Buffer.byteLength(data, 'utf8') > 4_000_000)
      throw new BusinessError(
        'Le registre atteint la limite de 4 Mo. Exportez les données et faites évoluer le stockage. Aucune donnée n’a été supprimée.',
      );
    const result = await redis().eval<[number, string], number>(
      CAS_SCRIPT,
      [`${prefix()}:registre`],
      [previous.revision, data],
    );
    if (result === 1) return next;
    if (result === -1) throw new Error('Registre introuvable.');
  }
  throw new BusinessError('Plusieurs modifications simultanées. Réessayez dans un instant.');
}
export function snapshot(state: Register, user: User) {
  const { passwordHash: _, ...publicUser } = user;
  return {
    revision: state.revision,
    participants: state.participants,
    contributions: state.contributions,
    products: state.products,
    entries: state.entries,
    events: state.events,
    audit: state.audit,
    projection: project(state),
    user: publicUser,
    demo: isDemo(),
  };
}
