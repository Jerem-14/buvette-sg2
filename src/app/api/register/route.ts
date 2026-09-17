import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { BusinessError } from '@/lib/errors';
import { checkOrigin, currentUser } from '@/lib/auth';
import { mutate, readRegister, snapshot } from '@/lib/store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous pour continuer.' }, { status: 401 });
  return NextResponse.json(snapshot(await readRegister(), user), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
export async function POST(request: Request) {
  if (!checkOrigin(request))
    return NextResponse.json({ error: 'Origine refusée.' }, { status: 403 });
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: 'Session expirée. Reconnectez-vous.' }, { status: 401 });
  try {
    const raw = await request.text();
    if (raw.length > 100_000)
      return NextResponse.json({ error: 'Requête trop volumineuse.' }, { status: 413 });
    const state = await mutate(JSON.parse(raw), user.id);
    return NextResponse.json(snapshot(state, user), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? 'Vérifiez les champs : noms, dates, montants et quantités.'
        : error instanceof SyntaxError
          ? 'Requête invalide.'
          : error instanceof BusinessError
            ? error.message
            : 'Impossible d’enregistrer. Réessayez.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
