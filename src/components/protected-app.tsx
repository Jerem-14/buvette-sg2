import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { readRegister, snapshot } from '@/lib/store';
import { BuvetteApp } from './buvette-app';
export async function ProtectedApp({ section }: { section: string }) {
  const user = await currentUser();
  if (!user) redirect('/connexion');
  const state = await readRegister();
  return <BuvetteApp key={section} initial={snapshot(state, user)} section={section} />;
}
