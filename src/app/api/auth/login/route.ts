import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate, checkOrigin, createSession } from '@/lib/auth';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!checkOrigin(request))
    return NextResponse.json({ error: 'Origine de la requête refusée.' }, { status: 403 });
  try {
    const raw = await request.text();
    if (raw.length > 2000)
      return NextResponse.json({ error: 'Requête trop volumineuse.' }, { status: 413 });
    const { email, password } = z
      .object({ email: z.string().email().max(254), password: z.string().min(1).max(256) })
      .parse(JSON.parse(raw));
    const user = await authenticate(email.trim(), password);
    if (!user)
      return NextResponse.json({ error: 'Email ou mot de passe incorrect.' }, { status: 401 });
    await createSession(user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Login failed', error instanceof Error ? error.name : 'Error');
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.startsWith('Trop de tentatives')
            ? error.message
            : 'Connexion impossible. Vérifiez la configuration et réessayez.',
      },
      { status: 400 },
    );
  }
}
