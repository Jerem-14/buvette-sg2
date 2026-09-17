import { notFound } from 'next/navigation';
import { ProtectedApp } from '@/components/protected-app';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!['cagnotte', 'stock', 'produits', 'soirees', 'participants', 'historique'].includes(section))
    notFound();
  return <ProtectedApp section={section} />;
}
