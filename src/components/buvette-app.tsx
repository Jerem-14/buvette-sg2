'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Beer,
  CalendarDays,
  Check,
  CircleHelp,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  Wine,
  X,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import type { Command } from '@/lib/domain';
import type { BuvetteEvent, Movement, Product, Snapshot } from '@/lib/types';
import { lotValue, money, quantity, ratio } from '@/lib/money';
import { Amount, Badge, dateLabel, Empty, Modal, SectionHead, Stat } from './ui';
import { EditForm, type DialogState } from './forms';

const navigation = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { key: 'cagnotte', label: 'Cagnotte', icon: Wallet, path: '/cagnotte' },
  { key: 'stock', label: 'Stock', icon: Package, path: '/stock' },
  { key: 'produits', label: 'Produits', icon: ShoppingBag, path: '/produits' },
  { key: 'soirees', label: 'Soirées', icon: CalendarDays, path: '/soirees' },
  { key: 'participants', label: 'Participants', icon: Users, path: '/participants' },
  { key: 'historique', label: 'Historique', icon: History, path: '/historique' },
];
const headings: Record<string, [string, string]> = {
  dashboard: ['Un œil sur la buvette', 'Les comptes au clair, l’esprit d’équipe en plus.'],
  cagnotte: [
    'La cagnotte de l’équipe',
    'Chaque contribution compte. Retrouvez les fonds réellement reçus.',
  ],
  stock: [
    'Tout le stock, au même endroit',
    'Les marchandises disponibles et les entrées de votre buvette.',
  ],
  produits: ['Le catalogue de la buvette', 'Les petits essentiels qui font les bons après-matchs.'],
  soirees: [
    'Les soirées de l’équipe',
    'Sortez les produits, profitez du moment, faites le point ensuite.',
  ],
  participants: ['Une buvette, une équipe', 'Les personnes qui font vivre la cagnotte.'],
  historique: [
    'Le fil de la buvette',
    'Chaque mouvement et chaque correction, en toute transparence.',
  ],
};
const movementNames: Record<string, string> = {
  contribution: 'Contribution',
  entry: 'Entrée de stock',
  out: 'Sortie de stock',
  return: 'Retour au stock',
  consumed: 'Consommation',
  audit: 'Journal des modifications',
};
const auditNames: Record<string, string> = {
  'participant.save': 'Participant enregistré',
  'participant.delete': 'Participant supprimé / archivé',
  'participant.restore': 'Participant réactivé',
  'product.save': 'Produit enregistré',
  'product.delete': 'Produit supprimé / archivé',
  'product.restore': 'Produit réactivé',
  'contribution.save': 'Contribution enregistrée',
  'contribution.delete': 'Contribution supprimée',
  'entry.save': 'Entrée enregistrée',
  'entry.delete': 'Entrée supprimée',
  'event.save': 'Soirée enregistrée',
  'event.delete': 'Soirée annulée',
  'event.issue': 'Sortie enregistrée',
  'event.removeLine': 'Sortie annulée',
  'event.close': 'Clôture / retours enregistrés',
};
const initials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
function ProductIcon({ product }: { product: Product }) {
  const Icon = product.category.toLowerCase().includes('bière')
    ? Beer
    : product.category.toLowerCase().includes('boisson')
      ? Wine
      : ShoppingBag;
  return (
    <span
      className={`product-icon ${product.category.toLowerCase().includes('grignoter') ? 'snack' : ''}`}
    >
      <Icon size={21} strokeWidth={1.6} />
    </span>
  );
}

export function BuvetteApp({ initial, section }: { initial: Snapshot; section: string }) {
  const [data, setData] = useState(initial),
    [menu, setMenu] = useState(false),
    [dialog, setDialog] = useState<DialogState | null>(null),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(''),
    [search, setSearch] = useState(''),
    [archived, setArchived] = useState(false),
    [tab, setTab] = useState('all');
  const [confirmation, setConfirmation] = useState<{ command: Command; message: string } | null>(
      null,
    ),
    [error, setError] = useState('');
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    productId: '',
    participantId: '',
    eventId: '',
    type: '',
  });
  const p = data.projection,
    admin = data.user.role === 'ADMIN';
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible')
        fetch('/api/register', { cache: 'no-store' })
          .then(async (r) => {
            if (r.status === 401) window.location.assign('/connexion');
            else if (r.ok) {
              const fresh: Snapshot = await r.json();
              setData((current) => (fresh.revision >= current.revision ? fresh : current));
            }
          })
          .catch(() => {});
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  const save = async (command: Command, close = true) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) window.location.assign('/connexion');
        throw new Error(result.error || 'Enregistrement impossible.');
      }
      setData((current) => (result.revision >= current.revision ? result : current));
      if (close) setDialog(null);
      setConfirmation(null);
      setToast('C’est enregistré. Les comptes sont à jour.');
    } finally {
      setBusy(false);
    }
  };
  const askDelete = (command: Command, message: string) => {
    setError('');
    setConfirmation({ command, message });
  };
  const matches = (value: string) =>
    value.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'));
  const editButtons = (kind: string, id: string, removeMessage: string) =>
    admin && (
      <div className="row-actions">
        <button
          className="icon-button"
          aria-label="Modifier"
          title="Modifier"
          onClick={() => setDialog({ kind, id })}
        >
          <Pencil size={15} />
        </button>
        <button
          className="icon-button danger"
          aria-label="Supprimer"
          title="Supprimer"
          onClick={() => askDelete({ type: `${kind}.delete`, id } as Command, removeMessage)}
        >
          <Trash2 size={15} />
        </button>
      </div>
    );
  const stockStatus = (product: Product) => {
    const amount = p.stock[product.id]?.quantity ?? 0;
    return amount === 0 ? (
      <Badge tone="red">Épuisé</Badge>
    ) : amount <= product.lowStockThreshold ? (
      <Badge tone="amber">Stock faible</Badge>
    ) : (
      <Badge tone="green">En stock</Badge>
    );
  };
  const activeProducts = data.products.filter(
    (product) => !product.archived || (p.stock[product.id]?.quantity ?? 0) > 0,
  );
  const alerts = activeProducts.filter(
    (product) => (p.stock[product.id]?.quantity ?? 0) <= product.lowStockThreshold,
  );
  const latestContributions = [...data.contributions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  const activeEvents = data.events.filter((e) => e.status === 'OPEN');
  const searchBox = (placeholder: string) => (
    <label className="search-input">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={placeholder}
      />
      {search && (
        <button
          type="button"
          className="icon-button"
          onClick={() => setSearch('')}
          aria-label="Effacer la recherche"
        >
          <X size={14} />
        </button>
      )}
    </label>
  );
  const contributionTable = (rows = latestContributions, compact = false) =>
    rows.length ? (
      <div className="table-scroll">
        <table className={`contribution-table ${compact ? 'compact' : ''}`}>
          <thead>
            <tr>
              <th>Participant</th>
              <th>Date</th>
              {!compact && <th>Commentaire</th>}
              <th className="align-right">Montant reçu</th>
              {!compact && admin && (
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const participant = data.participants.find((v) => v.id === c.participantId)!;
              return (
                <tr key={c.id}>
                  <td>
                    <button
                      className="person-link"
                      onClick={() => setDialog({ kind: 'participant-detail', id: participant.id })}
                    >
                      <span className="avatar">{initials(participant.name)}</span>
                      <span>
                        <strong>{participant.name}</strong>
                        {!compact && (
                          <small className="mobile-contribution-date">{dateLabel(c.date)}</small>
                        )}
                      </span>
                    </button>
                  </td>
                  <td className="muted nowrap">{dateLabel(c.date)}</td>
                  {!compact && <td className="muted">{c.note || '—'}</td>}
                  <td className="align-right">
                    <span className="contribution-amount">+{money(c.amountCents)}</span>
                  </td>
                  {!compact && admin && (
                    <td>
                      {editButtons(
                        'contribution',
                        c.id,
                        `Supprimer la contribution de ${money(c.amountCents)} de ${participant.name} ? Les fonds seront recalculés et la suppression restera dans l’historique.`,
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty title="La cagnotte attend sa première contribution" />
    );
  const eventCard = (event: BuvetteEvent) => {
    const cost = event.lines.reduce(
      (sum, l) =>
        sum +
        (event.status === 'CLOSED'
          ? (p.lines[l.id]?.consumedCents ?? 0)
          : (p.lines[l.id]?.outCents ?? 0)),
      0,
    );
    return (
      <button
        key={event.id}
        className="event-card"
        onClick={() => setDialog({ kind: 'event-detail', id: event.id })}
      >
        <div className="event-card-top">
          <span className="calendar-tile">
            <small>
              {new Date(event.date + 'T12:00:00')
                .toLocaleDateString('fr-FR', { month: 'short' })
                .replace('.', '')}
            </small>
            <strong>{event.date.slice(8)}</strong>
          </span>
          <Badge tone={event.status === 'OPEN' ? 'amber' : 'green'}>
            {event.status === 'OPEN' ? 'En cours' : 'Clôturée'}
          </Badge>
        </div>
        <h3>{event.name}</h3>
        <p>{event.lines.length} produit(s) sorti(s)</p>
        <div className="event-card-bottom">
          <div>
            <small>
              {event.status === 'OPEN' ? 'Valeur mise à disposition' : 'Consommation réelle'}
            </small>
            <strong>{money(cost)}</strong>
          </div>
          <ArrowUpRight size={20} />
        </div>
      </button>
    );
  };
  const headerAction =
    section === 'cagnotte'
      ? ['contribution', 'Ajouter une contribution']
      : section === 'produits'
        ? ['product', 'Nouveau produit']
        : section === 'stock'
          ? ['entry', 'Entrée de stock']
          : section === 'soirees'
            ? ['event', 'Créer une soirée']
            : section === 'participants'
              ? ['participant', 'Ajouter un participant']
              : null;
  const allMovements: Movement[] = [
    ...p.movements,
    ...data.audit.map((a) => ({
      id: a.id,
      date: a.date,
      type: 'audit',
      label: auditNames[a.type] || a.type,
      note: `${a.actorName}${a.note ? ` · ${a.note}` : ''}`,
      participantId: a.participantId,
      eventId: a.eventId,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const filteredMovements = allMovements.filter(
    (m) =>
      matches(`${m.label} ${m.note}`) &&
      (!filters.from || m.date.slice(0, 10) >= filters.from) &&
      (!filters.to || m.date.slice(0, 10) <= filters.to) &&
      (!filters.productId ||
        m.productId === filters.productId ||
        data.audit.find((a) => a.id === m.id)?.productIds.includes(filters.productId)) &&
      (!filters.participantId || m.participantId === filters.participantId) &&
      (!filters.eventId || m.eventId === filters.eventId) &&
      (!filters.type || m.type === filters.type),
  );
  const [historyLimit, setHistoryLimit] = useState(50);

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      {menu && (
        <button
          className="sidebar-overlay"
          aria-label="Fermer le menu"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Beer size={25} />
          </span>
          La Buvette<span className="brand-dot">.</span>
        </Link>
        <div className="team-selector">
          <span className="team-logo">ESJ</span>
          <div>
            <strong>ESJ · Seniors G2</strong>
            <small>La buvette de l’équipe</small>
          </div>
        </div>
        <span className="nav-label">ESPACE ÉQUIPE</span>
        <nav aria-label="Navigation principale">
          {navigation.map((item) => (
            <Link
              key={item.key}
              className={`nav-link ${section === item.key ? 'active' : ''}`}
              href={item.path}
              onClick={() => setMenu(false)}
              aria-current={section === item.key ? 'page' : undefined}
            >
              <item.icon size={19} strokeWidth={1.7} />
              {item.label}
              {item.key === 'soirees' && activeEvents.length > 0 && (
                <span className="nav-count">{activeEvents.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="club-note">
            <span className="club-note-icon">
              <ShieldCheck size={21} />
            </span>
            <strong>Une équipe, une cagnotte.</strong>
            <p>
              Chaque participation fait vivre
              <br />
              les bons moments du club.
            </p>
            <button className="text-button" onClick={() => setDialog({ kind: 'help' })}>
              Comment ça marche
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="user-card">
            <span className="avatar dark">{initials(data.user.name)}</span>
            <div>
              <strong>{data.user.name}</strong>
              <small>{admin ? 'Administrateur' : 'Membre'}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Se déconnecter"
              onClick={async () => {
                try {
                  const r = await fetch('/api/auth/logout', { method: 'POST' });
                  if (!r.ok) throw new Error();
                  window.location.assign('/connexion');
                } catch {
                  setToast('Déconnexion impossible. Réessayez.');
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Ouvrir le menu"
              onClick={() => setMenu(true)}
            >
              <Menu size={23} />
            </button>
            <span>Mon équipe</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{navigation.find((n) => n.key === section)?.label}</strong>
          </div>
          <div className="topbar-right">
            {data.demo && <span className="demo-pill">Démo locale</span>}
            <span className="today">
              <CalendarDays size={16} />
              {dateLabel(new Date().toISOString())}
            </span>
            <button
              className="icon-button help-button"
              aria-label="Comprendre les calculs"
              onClick={() => setDialog({ kind: 'help' })}
            >
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        <main id="main" className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {section === 'dashboard'
                  ? 'LA VIE DU CLUB, EN UN COUP D’ŒIL'
                  : 'LA BUVETTE · ESJ SENIORS G2'}
              </span>
              <h1>{headings[section][0]}</h1>
              <p>{headings[section][1]}</p>
            </div>
            {headerAction ? (
              <button
                className="button primary"
                onClick={() => setDialog({ kind: headerAction[0] })}
              >
                <Plus size={17} />
                {headerAction[1]}
              </button>
            ) : section === 'historique' && admin ? (
              <a className="button secondary" href="/api/export" download>
                <ArrowDownToLine size={17} />
                Exporter les données
              </a>
            ) : section === 'dashboard' ? (
              <div className="live-label">
                <span />
                Données à jour
              </div>
            ) : null}
          </div>

          {section === 'dashboard' && (
            <>
              <div className="stats-grid">
                <Stat
                  label="Fonds reçus"
                  value={money(p.fundsCents)}
                  hint={`${p.contributors} contributeurs dans l’équipe`}
                  icon={<Wallet size={20} />}
                />
                <Stat
                  label="Valeur du stock"
                  value={money(p.stockCents)}
                  hint={`${activeProducts.filter((v) => p.stock[v.id]?.quantity > 0).length} références disponibles`}
                  icon={<Package size={20} />}
                />
                <Stat
                  label="Consommation réelle"
                  value={money(p.consumedCents)}
                  hint={`${p.closedEvents} soirées clôturées`}
                  icon={<Beer size={20} />}
                />
                <Stat
                  label="Équilibre de la buvette"
                  value={`${p.balanceCents > 0 ? '+' : ''}${money(p.balanceCents)}`}
                  hint="Fonds reçus − consommation réelle"
                  icon={<TrendingUp size={20} />}
                  tone={p.balanceCents < 0 ? 'deficit' : 'highlight'}
                />
              </div>
              <div className="dashboard-main-grid">
                <section className="card finance-card">
                  <SectionHead
                    title="Où en est la cagnotte ?"
                    subtitle="Ce que l’équipe a reçu, et ce qu’elle a consommé."
                  />
                  <div className="finance-overview">
                    <div>
                      <span className="muted">Couverture de la consommation</span>
                      <div className="coverage-number">
                        {ratio(p.fundsCents, p.consumedCents)}
                        <Badge tone={p.balanceCents < 0 ? 'red' : 'green'}>
                          {p.consumedCents === 0
                            ? 'Aucune consommation'
                            : p.balanceCents < 0
                              ? 'Dans le rouge'
                              : 'À l’équilibre ou au-dessus'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="comparison-bars">
                    <div>
                      <span>
                        <i className="legend-dot received" />
                        Fonds reçus<strong>{money(p.fundsCents)}</strong>
                      </span>
                      <div className="bar-track">
                        <div
                          className="bar-fill received"
                          style={{
                            width: `${Math.max(p.fundsCents ? 1 : 0, (p.fundsCents / Math.max(p.fundsCents, p.consumedCents, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <span>
                        <i className="legend-dot consumed" />
                        Marchandises consommées<strong>{money(p.consumedCents)}</strong>
                      </span>
                      <div className="bar-track">
                        <div
                          className="bar-fill consumed"
                          style={{
                            width: `${Math.max(p.consumedCents ? 1 : 0, (p.consumedCents / Math.max(p.fundsCents, p.consumedCents, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className={`finance-note ${p.balanceCents < 0 ? 'red-note' : ''}`}>
                    <span>
                      {p.balanceCents < 0 ? <AlertTriangle size={19} /> : <ShieldCheck size={19} />}
                    </span>
                    <p>
                      {p.balanceCents < 0 ? (
                        <>
                          Il manque <strong>{money(-p.balanceCents)}</strong> pour couvrir la
                          consommation réelle.
                        </>
                      ) : (
                        <>
                          Les fonds couvrent la consommation, avec{' '}
                          <strong>{money(p.balanceCents)}</strong> d’avance.
                        </>
                      )}
                      <small>
                        Le stock restant et les soirées ouvertes ne sont pas comptés comme
                        consommés.
                      </small>
                    </p>
                  </div>
                </section>
                <section className="quick-card">
                  <span className="quick-icon">
                    <Plus size={22} />
                  </span>
                  <h2>On fait vivre la buvette ?</h2>
                  <p>
                    Les petites actions qui gardent
                    <br />
                    les comptes bien à jour.
                  </p>
                  <button onClick={() => setDialog({ kind: 'contribution' })}>
                    <span>
                      <Wallet size={19} />
                      Ajouter une contribution
                    </span>
                    <ArrowUpRight size={17} />
                  </button>
                  <button onClick={() => setDialog({ kind: 'entry' })}>
                    <span>
                      <Package size={19} />
                      Enregistrer une entrée
                    </span>
                    <ArrowUpRight size={17} />
                  </button>
                  <button onClick={() => setDialog({ kind: 'event' })}>
                    <span>
                      <CalendarDays size={19} />
                      Créer une soirée
                    </span>
                    <ArrowUpRight size={17} />
                  </button>
                  <div className="quick-decoration" aria-hidden="true">
                    à la vôtre.
                  </div>
                </section>
              </div>
              <div className="dashboard-bottom-grid">
                <section className="card">
                  <SectionHead
                    title="Les dernières contributions"
                    subtitle="Merci à celles et ceux qui font vivre le club."
                    action="Tout voir"
                    onAction={() => window.location.assign('/cagnotte')}
                  />
                  {contributionTable(latestContributions.slice(0, 4), true)}
                </section>
                <section className="card">
                  <SectionHead
                    title="À remettre dans le panier"
                    subtitle={`${alerts.length} produit(s) à surveiller`}
                    action="Voir le stock"
                    onAction={() => window.location.assign('/stock')}
                  />
                  <div className="alert-list">
                    {alerts.slice(0, 4).map((product) => (
                      <button
                        key={product.id}
                        onClick={() => setDialog({ kind: 'product-detail', id: product.id })}
                      >
                        <ProductIcon product={product} />
                        <span>
                          <strong>{product.name}</strong>
                          <small>
                            {quantity(p.stock[product.id]?.quantity ?? 0)} disponible(s)
                          </small>
                        </span>
                        {stockStatus(product)}
                      </button>
                    ))}
                    {!alerts.length && <Empty title="Les réserves sont au vert" />}
                  </div>
                </section>
              </div>
              <div className="purchase-strip">
                <div>
                  <ShoppingBag size={20} />
                  <span>
                    <strong>Et par rapport aux achats ?</strong>
                    <small>
                      {money(p.purchasesCents)} de marchandises enregistrées ·{' '}
                      {money(p.reservedCents)} en cours de soirée
                    </small>
                  </span>
                </div>
                <Badge tone={p.purchaseBalanceCents < 0 ? 'red' : 'green'}>
                  Fonds − achats : {p.purchaseBalanceCents > 0 ? '+' : ''}
                  {money(p.purchaseBalanceCents)}
                </Badge>
              </div>
              <section className="upcoming-section">
                <SectionHead
                  title="Les moments d’équipe"
                  subtitle={`Consommation moyenne : ${money(p.averageCents)} par soirée clôturée`}
                  action="Toutes les soirées"
                  onAction={() => window.location.assign('/soirees')}
                />
                <div className="event-grid">
                  {[...data.events]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 3)
                    .map(eventCard)}
                  {!data.events.length && <Empty title="La prochaine soirée commence ici" />}
                </div>
              </section>
            </>
          )}

          {section === 'cagnotte' && (
            <>
              <div className="stats-grid three">
                <Stat
                  label="Total réellement reçu"
                  value={money(p.fundsCents)}
                  hint={`${data.contributions.length} contributions enregistrées`}
                  icon={<Wallet size={20} />}
                />
                <Stat
                  label="Contributeurs"
                  value={String(p.contributors)}
                  hint="Participants ayant déjà contribué"
                  icon={<Users size={20} />}
                />
                <Stat
                  label="Écart avec la consommation"
                  value={`${p.balanceCents > 0 ? '+' : ''}${money(p.balanceCents)}`}
                  hint={`Couverture : ${ratio(p.fundsCents, p.consumedCents)}`}
                  icon={<TrendingUp size={20} />}
                  tone={p.balanceCents < 0 ? 'deficit' : 'highlight'}
                />
              </div>
              <section className="card">
                <div className="list-toolbar">
                  <h2>Historique des contributions</h2>
                  {searchBox('Rechercher un participant…')}
                </div>
                {contributionTable(
                  latestContributions.filter((c) =>
                    matches(
                      `${data.participants.find((v) => v.id === c.participantId)?.name} ${c.note}`,
                    ),
                  ),
                )}
              </section>
            </>
          )}

          {(section === 'produits' || section === 'stock') && (
            <>
              {section === 'stock' && (
                <div className="stats-grid three">
                  <Stat
                    label="Valeur disponible"
                    value={money(p.stockCents)}
                    hint={`${quantity(Object.values(p.stock).reduce((s, v) => s + v.quantity, 0))} unités disponibles, toutes références`}
                    icon={<Package size={20} />}
                  />
                  <Stat
                    label="En cours de soirée"
                    value={money(p.reservedCents)}
                    hint={`${activeEvents.length} soirée(s) ouverte(s)`}
                    icon={<CalendarDays size={20} />}
                  />
                  <Stat
                    label="Total des achats"
                    value={money(p.purchasesCents)}
                    hint={`Fonds − achats : ${money(p.purchaseBalanceCents)}`}
                    icon={<ShoppingBag size={20} />}
                  />
                </div>
              )}
              <section className="card">
                <div className="list-toolbar">
                  <div className="tabs">
                    {section === 'stock' ? (
                      <>
                        <button
                          className={tab !== 'entries' ? 'selected' : ''}
                          onClick={() => setTab('all')}
                        >
                          Stock disponible
                        </button>
                        <button
                          className={tab === 'entries' ? 'selected' : ''}
                          onClick={() => setTab('entries')}
                        >
                          Entrées de stock
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={!archived ? 'selected' : ''}
                          onClick={() => setArchived(false)}
                        >
                          Produits actifs
                        </button>
                        <button
                          className={archived ? 'selected' : ''}
                          onClick={() => setArchived(true)}
                        >
                          Archives
                        </button>
                      </>
                    )}
                  </div>
                  {searchBox(
                    tab === 'entries' ? 'Rechercher une entrée…' : 'Rechercher un produit…',
                  )}
                </div>
                {tab === 'entries' && section === 'stock' ? (
                  data.entries.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Marchandises</th>
                            <th>Commentaire</th>
                            <th className="align-right">Valeur d’achat</th>
                            {admin && <th>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {[...data.entries]
                            .sort((a, b) => b.sequence - a.sequence)
                            .filter((e) =>
                              matches(
                                `${e.note} ${e.items.map((i) => data.products.find((v) => v.id === i.productId)?.name).join(' ')}`,
                              ),
                            )
                            .map((entry) => (
                              <tr key={entry.id}>
                                <td className="nowrap">{dateLabel(entry.date)}</td>
                                <td>
                                  {entry.items.map((i) => (
                                    <div key={i.id}>
                                      {quantity(i.quantity)} ×{' '}
                                      {data.products.find((v) => v.id === i.productId)?.name}
                                      <small className="muted">
                                        {' '}
                                        · {money(i.unitPriceCents)} / unité
                                      </small>
                                    </div>
                                  ))}
                                </td>
                                <td className="muted">{entry.note || '—'}</td>
                                <td className="align-right">
                                  <Amount
                                    value={entry.items.reduce(
                                      (s, i) => s + lotValue(i.unitPriceCents, i.quantity),
                                      0,
                                    )}
                                  />
                                </td>
                                {admin && (
                                  <td>
                                    {editButtons(
                                      'entry',
                                      entry.id,
                                      'Supprimer cette entrée ? Si des sorties dépendent de ces marchandises, vous devrez d’abord les corriger. L’opération originale restera dans le journal.',
                                    )}
                                  </td>
                                )}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty title="Aucune entrée pour le moment" />
                  )
                ) : (
                  <>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Produit</th>
                            <th>Catégorie</th>
                            <th className="align-right">Coût unitaire</th>
                            <th className="align-right">Disponible</th>
                            <th className="align-right">Valeur FIFO</th>
                            <th>État</th>
                            {admin && <th>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {data.products
                            .filter(
                              (product) =>
                                (section === 'stock'
                                  ? !product.archived || p.stock[product.id]?.quantity > 0
                                  : product.archived === archived) &&
                                matches(`${product.name} ${product.category}`),
                            )
                            .map((product) => (
                              <tr key={product.id}>
                                <td>
                                  <button
                                    className="person-link"
                                    onClick={() =>
                                      setDialog({ kind: 'product-detail', id: product.id })
                                    }
                                  >
                                    <ProductIcon product={product} />
                                    <span>
                                      <strong>{product.name}</strong>
                                      {product.archived && <small className="muted">Archivé</small>}
                                    </span>
                                  </button>
                                </td>
                                <td className="muted">{product.category}</td>
                                <td className="align-right">
                                  <Amount value={product.purchasePriceCents} />
                                </td>
                                <td className="align-right">
                                  <strong className="stock-quantity">
                                    {quantity(p.stock[product.id]?.quantity ?? 0)}
                                  </strong>
                                  <small className="stock-threshold">
                                    Seuil : {quantity(product.lowStockThreshold)}
                                  </small>
                                </td>
                                <td className="align-right">
                                  <Amount value={p.stock[product.id]?.valueCents ?? 0} />
                                </td>
                                <td>{stockStatus(product)}</td>
                                {admin && (
                                  <td>
                                    {product.archived ? (
                                      <button
                                        className="text-button"
                                        onClick={() =>
                                          save({ type: 'product.restore', id: product.id }).catch(
                                            (e) => setToast(e.message),
                                          )
                                        }
                                      >
                                        <RotateCcw size={15} />
                                        Réactiver
                                      </button>
                                    ) : (
                                      editButtons(
                                        'product',
                                        product.id,
                                        `Supprimer « ${product.name} » ? Un produit déjà utilisé sera archivé pour conserver son historique et son stock. Un produit jamais utilisé sera supprimé définitivement.`,
                                      )
                                    )}
                                  </td>
                                )}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {!data.products.some(
                      (product) =>
                        (section === 'stock'
                          ? !product.archived || p.stock[product.id]?.quantity > 0
                          : product.archived === archived) &&
                        matches(`${product.name} ${product.category}`),
                    ) && <Empty title="Aucun produit à afficher" />}
                  </>
                )}
              </section>
              <p className="page-footnote">
                <CircleHelp size={15} />
                La valeur du stock utilise les prix réels des lots achetés. Le coût du catalogue
                sert de valeur proposée pour les prochains achats.
              </p>
            </>
          )}

          {section === 'participants' && (
            <section className="card">
              <div className="list-toolbar">
                <div className="tabs">
                  <button
                    className={!archived ? 'selected' : ''}
                    onClick={() => setArchived(false)}
                  >
                    Participants actifs
                  </button>
                  <button className={archived ? 'selected' : ''} onClick={() => setArchived(true)}>
                    Archives
                  </button>
                </div>
                {searchBox('Rechercher un participant…')}
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th>Contributions</th>
                      <th>Ajouté le</th>
                      <th className="align-right">Total reçu</th>
                      {admin && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.participants
                      .filter((v) => v.archived === archived && matches(v.name))
                      .map((participant) => {
                        const rows = data.contributions.filter(
                          (c) => c.participantId === participant.id,
                        );
                        return (
                          <tr key={participant.id}>
                            <td>
                              <button
                                className="person-link"
                                onClick={() =>
                                  setDialog({ kind: 'participant-detail', id: participant.id })
                                }
                              >
                                <span className="avatar">{initials(participant.name)}</span>
                                <strong>{participant.name}</strong>
                              </button>
                            </td>
                            <td>{rows.length} contribution(s)</td>
                            <td className="muted">{dateLabel(participant.createdAt)}</td>
                            <td className="align-right">
                              <Amount value={rows.reduce((s, c) => s + c.amountCents, 0)} />
                            </td>
                            {admin && (
                              <td>
                                {participant.archived ? (
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      save({
                                        type: 'participant.restore',
                                        id: participant.id,
                                      }).catch((e) => setToast(e.message))
                                    }
                                  >
                                    <RotateCcw size={15} />
                                    Réactiver
                                  </button>
                                ) : (
                                  editButtons(
                                    'participant',
                                    participant.id,
                                    `Supprimer ${participant.name} ? Un participant ayant déjà contribué sera archivé. Ses contributions resteront comptées dans les fonds reçus.`,
                                  )
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {!data.participants.some((v) => v.archived === archived && matches(v.name)) && (
                <Empty title="Aucun participant à afficher" />
              )}
            </section>
          )}

          {section === 'soirees' && (
            <>
              <div className="list-toolbar plain">
                <div className="tabs">
                  <button className={tab === 'all' ? 'selected' : ''} onClick={() => setTab('all')}>
                    Toutes ({data.events.length})
                  </button>
                  <button
                    className={tab === 'OPEN' ? 'selected' : ''}
                    onClick={() => setTab('OPEN')}
                  >
                    En cours ({activeEvents.length})
                  </button>
                  <button
                    className={tab === 'CLOSED' ? 'selected' : ''}
                    onClick={() => setTab('CLOSED')}
                  >
                    Clôturées ({p.closedEvents})
                  </button>
                </div>
                {searchBox('Rechercher une soirée…')}
              </div>
              <div className="event-grid">
                {[...data.events]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .filter((e) => (tab === 'all' || e.status === tab) && matches(e.name))
                  .map(eventCard)}
              </div>
              {!data.events.some((e) => (tab === 'all' || e.status === tab) && matches(e.name)) && (
                <Empty title="Aucune soirée à afficher" />
              )}
              <div className="workflow">
                <span>
                  <CalendarDays size={18} />
                  Créer une soirée
                </span>
                <ArrowRight size={16} />
                <span>
                  <Package size={18} />
                  Sortir les produits
                </span>
                <ArrowRight size={16} />
                <span>
                  <RotateCcw size={18} />
                  Saisir les retours
                </span>
                <ArrowRight size={16} />
                <span>
                  <Check size={18} />
                  Clôturer et compter
                </span>
              </div>
            </>
          )}

          {section === 'historique' && (
            <section className="card">
              <div className="list-toolbar">
                <h2>Tous les mouvements</h2>
                {searchBox('Rechercher une opération…')}
              </div>
              <div className="history-filters">
                <label>
                  Du
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                  />
                </label>
                <label>
                  Au
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                  />
                </label>
                <label>
                  Type
                  <select
                    value={filters.type}
                    onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                  >
                    <option value="">Tous les types</option>
                    {Object.entries(movementNames).map(([v, name]) => (
                      <option key={v} value={v}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Produit
                  <select
                    value={filters.productId}
                    onChange={(e) => setFilters({ ...filters, productId: e.target.value })}
                  >
                    <option value="">Tous les produits</option>
                    {data.products.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Participant
                  <select
                    value={filters.participantId}
                    onChange={(e) => setFilters({ ...filters, participantId: e.target.value })}
                  >
                    <option value="">Tous les participants</option>
                    {data.participants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Soirée
                  <select
                    value={filters.eventId}
                    onChange={(e) => setFilters({ ...filters, eventId: e.target.value })}
                  >
                    <option value="">Toutes les soirées</option>
                    {data.events.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="filter-summary">
                <span>{filteredMovements.length} opération(s)</span>
                <button
                  className="text-button"
                  onClick={() => {
                    setFilters({
                      from: '',
                      to: '',
                      productId: '',
                      participantId: '',
                      eventId: '',
                      type: '',
                    });
                    setSearch('');
                  }}
                >
                  Réinitialiser les filtres
                </button>
              </div>
              {filteredMovements.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Opération</th>
                        <th>Type</th>
                        <th className="align-right">Quantité</th>
                        <th className="align-right">Valeur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMovements.slice(0, historyLimit).map((m) => (
                        <tr key={m.id}>
                          <td className="muted nowrap">{dateLabel(m.date)}</td>
                          <td>
                            {m.type === 'audit' ? (
                              <button
                                className="text-button audit-link"
                                onClick={() => setDialog({ kind: 'audit-detail', id: m.id })}
                              >
                                {m.label}
                                <ArrowUpRight size={13} />
                              </button>
                            ) : (
                              <strong>{m.label}</strong>
                            )}
                            <small className="table-note">{m.note || '—'}</small>
                          </td>
                          <td>
                            <Badge
                              tone={
                                m.type === 'contribution' || m.type === 'return'
                                  ? 'green'
                                  : m.type === 'out'
                                    ? 'amber'
                                    : 'neutral'
                              }
                            >
                              {movementNames[m.type]}
                            </Badge>
                          </td>
                          <td className="align-right">
                            {m.quantity === undefined ? '—' : quantity(m.quantity)}
                          </td>
                          <td className="align-right">
                            {m.amountCents === undefined ? '—' : <Amount value={m.amountCents} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Aucun mouvement pour ces filtres" />
              )}
              {filteredMovements.length > historyLimit && (
                <div className="load-more">
                  <button
                    className="button secondary"
                    onClick={() => setHistoryLimit(historyLimit + 50)}
                  >
                    Afficher 50 opérations de plus
                  </button>
                </div>
              )}
            </section>
          )}
          <footer className="app-footer">
            <span>
              La Buvette<span className="brand-dot">.</span>{' '}
              <span className="footer-divider">/</span> Les bons moments se partagent.
            </span>
            <span>ESJ · Seniors G2</span>
          </footer>
        </main>
      </div>

      {dialog && (
        <Modal
          onClose={() => {
            if (!busy) setDialog(null);
          }}
          title={dialogTitle(dialog, data)}
          description={
            dialog.kind === 'close' ? 'Un dernier point pour garder les comptes justes.' : undefined
          }
        >
          {['participant', 'contribution', 'product', 'entry', 'event', 'issue', 'close'].includes(
            dialog.kind,
          ) && (
            <EditForm
              key={`${dialog.kind}-${dialog.id}-${dialog.eventId}`}
              dialog={dialog}
              data={data}
              onSave={save}
              busy={busy}
            />
          )}
          {dialog.kind === 'event-detail' &&
            (() => {
              const event = data.events.find((e) => e.id === dialog.id);
              if (!event) return <Empty title="Cette soirée a été annulée" />;
              return (
                <>
                  <div className="detail-heading">
                    <Badge tone={event.status === 'OPEN' ? 'amber' : 'green'}>
                      {event.status === 'OPEN' ? 'En cours' : 'Clôturée'}
                    </Badge>
                    <span>{dateLabel(event.date)}</span>
                  </div>
                  {event.note && <p className="detail-note">{event.note}</p>}
                  <div className="detail-actions">
                    {event.status === 'OPEN' && (
                      <button
                        className="button primary"
                        onClick={() => setDialog({ kind: 'issue', eventId: event.id })}
                      >
                        <Plus size={16} />
                        Sortir des produits
                      </button>
                    )}
                    {event.lines.length > 0 && (event.status === 'OPEN' || admin) && (
                      <button
                        className="button secondary"
                        onClick={() => setDialog({ kind: 'close', eventId: event.id })}
                      >
                        {event.status === 'OPEN'
                          ? 'Clôturer et saisir les retours'
                          : 'Corriger les retours'}
                      </button>
                    )}
                  </div>
                  {event.lines.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Produit</th>
                            <th>Sorti</th>
                            <th>Consommé</th>
                            <th>Retour</th>
                            <th>Valeur consommée</th>
                            {admin && <th>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {event.lines.map((line) => (
                            <tr key={line.id}>
                              <td>
                                <strong>
                                  {data.products.find((v) => v.id === line.productId)?.name}
                                </strong>
                              </td>
                              <td>{quantity(line.quantityOut)}</td>
                              <td>
                                {event.status === 'CLOSED'
                                  ? quantity(line.quantityOut - line.quantityReturned)
                                  : '—'}
                              </td>
                              <td>
                                {event.status === 'CLOSED' ? quantity(line.quantityReturned) : '—'}
                              </td>
                              <td>
                                {event.status === 'CLOSED'
                                  ? money(p.lines[line.id]?.consumedCents ?? 0)
                                  : 'À clôturer'}
                              </td>
                              {admin && (
                                <td>
                                  <div className="row-actions">
                                    <button
                                      className="icon-button"
                                      aria-label="Modifier la sortie"
                                      onClick={() =>
                                        setDialog({ kind: 'issue', eventId: event.id, id: line.id })
                                      }
                                    >
                                      <Pencil size={15} />
                                    </button>
                                    <button
                                      className="icon-button danger"
                                      aria-label="Annuler la sortie"
                                      onClick={() =>
                                        askDelete(
                                          {
                                            type: 'event.removeLine',
                                            eventId: event.id,
                                            id: line.id,
                                          },
                                          'Annuler cette sortie ? Le stock et la consommation seront recalculés.',
                                        )
                                      }
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty title="Les produits attendent leur sortie" />
                  )}
                  {event.status === 'OPEN' && (
                    <p className="info-box">
                      Les marchandises sorties sont réservées. Elles compteront dans la consommation
                      réelle après clôture.
                    </p>
                  )}
                  {admin && (
                    <div className="detail-admin">
                      <button
                        className="text-button"
                        onClick={() => setDialog({ kind: 'event', id: event.id })}
                      >
                        <Pencil size={15} />
                        Modifier la soirée
                      </button>
                      <button
                        className="text-button danger"
                        onClick={() =>
                          askDelete(
                            { type: 'event.delete', id: event.id },
                            'Annuler cette soirée et toutes ses sorties ? Le stock, les retours et la consommation seront recalculés. L’historique de l’opération sera conservé.',
                          )
                        }
                      >
                        <Trash2 size={15} />
                        Annuler la soirée
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          {dialog.kind === 'participant-detail' &&
            (() => {
              const participant = data.participants.find((v) => v.id === dialog.id);
              if (!participant) return <Empty title="Ce participant a été supprimé" />;
              const rows = latestContributions.filter((c) => c.participantId === participant.id);
              return (
                <>
                  <div className="detail-stat">
                    <span>Total réellement reçu</span>
                    <strong>{money(rows.reduce((s, c) => s + c.amountCents, 0))}</strong>
                    <small>
                      {rows.length} contribution(s) · Ajouté le {dateLabel(participant.createdAt)}
                    </small>
                  </div>
                  {contributionTable(rows, true)}
                  {admin && (
                    <div className="detail-admin">
                      <button
                        className="text-button"
                        onClick={() => setDialog({ kind: 'participant', id: participant.id })}
                      >
                        <Pencil size={15} />
                        Modifier le participant
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          {dialog.kind === 'product-detail' &&
            (() => {
              const product = data.products.find((v) => v.id === dialog.id);
              if (!product) return <Empty title="Ce produit a été supprimé" />;
              return (
                <>
                  <div className="detail-heading">
                    <ProductIcon product={product} />
                    <span>{product.category}</span>
                    {stockStatus(product)}
                  </div>
                  <div className="detail-stat">
                    <span>Stock disponible</span>
                    <strong>{quantity(p.stock[product.id]?.quantity ?? 0)} unité(s)</strong>
                    <small>Valeur FIFO : {money(p.stock[product.id]?.valueCents ?? 0)}</small>
                  </div>
                  <dl className="detail-dl">
                    <dt>Prix d’achat proposé</dt>
                    <dd>{money(product.purchasePriceCents)}</dd>
                    <dt>Seuil d’alerte</dt>
                    <dd>{quantity(product.lowStockThreshold)}</dd>
                    <dt>Création</dt>
                    <dd>{dateLabel(product.createdAt)}</dd>
                    <dt>Dernière modification</dt>
                    <dd>{dateLabel(product.updatedAt)}</dd>
                  </dl>
                  <h3>Derniers mouvements</h3>
                  <div className="mini-movements">
                    {p.movements
                      .filter((m) => m.productId === product.id)
                      .slice(0, 8)
                      .map((m) => (
                        <div key={m.id}>
                          <span>
                            {movementNames[m.type]}
                            <small>{dateLabel(m.date)}</small>
                          </span>
                          <strong>{quantity(m.quantity ?? 0)}</strong>
                          <span>{money(m.amountCents ?? 0)}</span>
                        </div>
                      ))}
                  </div>
                  {!product.archived && (
                    <div className="detail-actions">
                      <button
                        className="button primary"
                        onClick={() => setDialog({ kind: 'entry' })}
                      >
                        <Plus size={16} />
                        Entrée de stock
                      </button>
                      {admin && (
                        <button
                          className="button secondary"
                          onClick={() => setDialog({ kind: 'product', id: product.id })}
                        >
                          <Pencil size={15} />
                          Modifier
                        </button>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          {dialog.kind === 'audit-detail' &&
            (() => {
              const audit = data.audit.find((a) => a.id === dialog.id);
              if (!audit) return <Empty title="Opération introuvable" />;
              return (
                <>
                  <p>
                    {dateLabel(audit.date)} · {audit.actorName}
                  </p>
                  <p className="info-box">
                    L’état avant et après permet de retrouver les informations originales, même
                    après une correction ou une suppression. Montants en centimes et quantités en
                    milli-unités.
                  </p>
                  <h3>Avant l’opération</h3>
                  <pre className="audit-json">
                    {JSON.stringify(audit.before, null, 2) || 'Aucun'}
                  </pre>
                  <h3>Après l’opération</h3>
                  <pre className="audit-json">
                    {JSON.stringify(audit.after, null, 2) || 'Aucun'}
                  </pre>
                </>
              );
            })()}
          {dialog.kind === 'help' && (
            <div className="help-content">
              <p>
                La buvette suit l’argent reçu et le coût des marchandises partagées par l’équipe.
              </p>
              <h3>Deux équilibres à surveiller</h3>
              <p>
                <strong>Fonds − consommation :</strong> les contributions couvrent-elles ce qui a
                réellement été consommé ? Le ratio mesure cette couverture. Sans consommation, il
                est affiché « — ».
              </p>
              <p>
                <strong>Fonds − achats :</strong> les contributions couvrent-elles toutes les
                marchandises enregistrées ? Un déficit est accepté et signalé.
              </p>
              <h3>Une soirée en trois temps</h3>
              <p>
                Créez une soirée, sortez les produits disponibles, puis clôturez en indiquant les
                retours. Consommé = sorti − retourné. Avant clôture, les sorties sont réservées et
                ne comptent pas dans la consommation.
              </p>
              <h3>Le juste coût, même quand les prix changent</h3>
              <p>
                Les lots les plus anciens sont prélevés d’abord (FIFO). Une demi-unité peut être
                retournée. Les calculs conservent chaque centime entre le stock, les réservations et
                la consommation.
              </p>
              <h3>Corriger sans perdre l’historique</h3>
              <p>
                L’administrateur peut corriger ou annuler les opérations. Une correction qui
                rendrait le stock négatif dans le passé est refusée : corrigez d’abord les sorties
                concernées. Les produits et participants déjà utilisés sont archivés à la
                suppression.
              </p>
            </div>
          )}
        </Modal>
      )}
      {confirmation && (
        <Modal
          title="Confirmer la suppression"
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
        >
          <p className="confirmation-text">{confirmation.message}</p>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <div className="detail-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Conserver
            </button>
            <button
              className="button destructive"
              disabled={busy}
              onClick={() => save(confirmation.command).catch((e) => setError(e.message))}
            >
              {busy ? 'Enregistrement…' : 'Confirmer la suppression'}
              <Trash2 size={16} />
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Masquer le message"
            onClick={() => setToast('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function dialogTitle(dialog: DialogState, data: Snapshot) {
  if (dialog.kind === 'event-detail')
    return data.events.find((e) => e.id === dialog.id)?.name || 'Soirée';
  if (dialog.kind === 'participant-detail')
    return data.participants.find((e) => e.id === dialog.id)?.name || 'Participant';
  if (dialog.kind === 'product-detail')
    return data.products.find((e) => e.id === dialog.id)?.name || 'Produit';
  const names: Record<string, string> = {
    participant: 'un participant',
    contribution: 'une contribution',
    product: 'un produit',
    entry: 'une entrée de stock',
    event: 'une soirée',
    issue: 'une sortie de stock',
  };
  if (names[dialog.kind]) return `${dialog.id ? 'Modifier' : 'Ajouter'} ${names[dialog.kind]}`;
  return dialog.kind === 'close'
    ? 'Consommation & retours'
    : dialog.kind === 'help'
      ? 'Les comptes, tout simplement'
      : 'Détail de l’opération';
}
