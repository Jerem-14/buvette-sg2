import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="standalone">
      <h1>Cette page est introuvable.</h1>
      <Link className="button primary" href="/">
        Revenir au dashboard
      </Link>
    </main>
  );
}
