import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'La Buvette · ESJ',
  description: 'La cagnotte, le stock et les soirées de votre équipe, au même endroit.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
