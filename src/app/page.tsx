import { ProtectedApp } from '@/components/protected-app';
export const dynamic = 'force-dynamic';
export default function Page() {
  return <ProtectedApp section="dashboard" />;
}
