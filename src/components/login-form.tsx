'use client';
import { useState } from 'react';
import { ArrowRight, Beer, ShieldCheck } from 'lucide-react';
export function LoginForm({ demo }: { demo: boolean }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <div className="login-story">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Beer size={26} />
          </span>
          La Buvette<span className="brand-dot">.</span>
        </a>
        <div>
          <span className="eyebrow">LE CLUB-HOUSE, BIEN GÉRÉ.</span>
          <h1>
            L’esprit d’équipe.
            <br />
            Les comptes au clair.
          </h1>
          <p>
            Une cagnotte commune, des soirées partagées.
            <br />
            Gardez simplement un œil sur votre buvette.
          </p>
          <div className="login-illustration" aria-hidden="true">
            <Beer size={110} strokeWidth={1} />
            <span>
              On partage bien plus
              <br />
              qu’un après-match.
            </span>
          </div>
        </div>
        <small>ESJ · La vie du club, ensemble.</small>
      </div>
      <div className="login-panel">
        <div className="login-card">
          <span className="eyebrow">BIENVENUE AU CLUB</span>
          <h2>Heureux de vous retrouver.</h2>
          <p className="muted">Connectez-vous pour retrouver votre équipe.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const f = new FormData(e.currentTarget);
              try {
                const r = await fetch('/api/auth/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                window.location.assign('/');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Connexion impossible.');
                setBusy(false);
              }
            }}
          >
            <label>
              Adresse email
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                defaultValue={demo ? 'demo@buvette.local' : ''}
              />
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                defaultValue={demo ? 'Buvette-demo-2026!' : ''}
              />
            </label>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? 'Connexion…' : 'Se connecter'}
              <ArrowRight size={18} />
            </button>
          </form>
          {demo && (
            <div className="demo-note">
              <ShieldCheck size={20} />
              <div>
                <strong>Démonstration locale</strong>
                <p>
                  Les identifiants sont préremplis. Vos modifications sont enregistrées sur cet
                  ordinateur.
                </p>
              </div>
            </div>
          )}
          <p className="login-footer">
            Un accès partagé aux responsables.
            <br />
            Aucun paiement en ligne.
          </p>
        </div>
      </div>
    </main>
  );
}
