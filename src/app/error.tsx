'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <h1>La buvette est momentanément indisponible.</h1>
      <p>
        Vérifiez la connexion Redis et l’initialisation du registre. Les détails techniques sont
        disponibles dans les journaux du serveur.
      </p>
      <button className="button primary" onClick={reset}>
        Réessayer
      </button>
    </main>
  );
}
