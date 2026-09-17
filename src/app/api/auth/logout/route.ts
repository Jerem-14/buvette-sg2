import { NextResponse } from 'next/server';
import { checkOrigin, logout } from '@/lib/auth';
export async function POST(request: Request) {
  if (!checkOrigin(request))
    return NextResponse.json({ error: 'Origine refusée.' }, { status: 403 });
  await logout();
  return NextResponse.json({ ok: true });
}
