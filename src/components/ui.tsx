'use client';
import { useEffect, useRef, useId, type ReactNode } from 'react';
import { X, Inbox, ArrowUpRight } from 'lucide-react';
import { money } from '@/lib/money';
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <strong>{title}</strong>
      <p>{children || 'Les prochaines opérations apparaîtront ici.'}</p>
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = before;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p className="muted">{description}</p>}
        </div>
        <button type="button" className="icon-button" aria-label="Fermer" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Stat({
  label,
  value,
  hint,
  icon,
  tone = '',
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <article className={`stat ${tone}`}>
      <div className="stat-label">
        {label}
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <span className="stat-hint">{hint}</span>
    </article>
  );
}
export function Amount({ value, signed = false }: { value: number; signed?: boolean }) {
  return (
    <span className={`amount ${signed ? (value < 0 ? 'negative' : 'positive') : ''}`}>
      {signed && value > 0 ? '+' : ''}
      {money(value)}
    </span>
  );
}
export function SectionHead({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
}
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));
export const today = () =>
  new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
