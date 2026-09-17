import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { isDemo } from '@/lib/store';
import { LoginForm } from '@/components/login-form';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (await currentUser()) redirect('/');
  return <LoginForm demo={isDemo()} />;
}
