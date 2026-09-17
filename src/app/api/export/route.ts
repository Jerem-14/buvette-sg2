import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { readRegister } from '@/lib/store';
export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 403 });
  const state = await readRegister();
  const { users: _, ...business } = state;
  return NextResponse.json(business, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="buvette-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
