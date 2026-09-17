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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Login failed:', message);
    const configurationError = message.startsWith('Configurez les deux variables Redis');
    const uninitializedRegister = message.startsWith('Base non initialisée');
    return NextResponse.json(
      {
        error:
          message.startsWith('Trop de tentatives')
            ? message
            : configurationError
              ? 'Redis Upstash n’est pas disponible dans ce déploiement. Vérifiez les variables Production puis redéployez.'
              : uninitializedRegister
                ? 'Le registre Redis n’est pas initialisé. Exécutez npm run db:seed avec les variables Production.'
                : 'Connexion impossible. Vérifiez la configuration et réessayez.',
      },
      { status: 400 },
    );
  }
}
