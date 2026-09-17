'use client';
import { useState, type FormEvent } from 'react';
import { Plus, Trash2, ArrowRight, Check } from 'lucide-react';
import type { Command } from '@/lib/domain';
import type { Snapshot } from '@/lib/types';
import { cents, decimal, quantity, units } from '@/lib/money';
import { today } from './ui';
export interface DialogState {
  kind: string;
  id?: string;
  eventId?: string;
}
export function EditForm({
  dialog,
  data,
  onSave,
  busy,
}: {
  dialog: DialogState;
  data: Snapshot;
  onSave: (command: Command) => Promise<void>;
  busy: boolean;
}) {
  const [error, setError] = useState('');
  const { kind, id, eventId } = dialog;
  const participant = data.participants.find((p) => p.id === id),
    contribution = data.contributions.find((c) => c.id === id),
    product = data.products.find((p) => p.id === id),
    entry = data.entries.find((e) => e.id === id),
    event = data.events.find((e) => e.id === (eventId || id));
  const line = event?.lines.find((l) => l.id === id);
  const [items, setItems] = useState(
    entry?.items.map((i) => ({
      productId: i.productId,
      quantity: decimal(i.quantity, 3),
      price: decimal(i.unitPriceCents),
    })) ?? [
      {
        productId: product?.id ?? data.products.find((p) => !p.archived)?.id ?? '',
        quantity: '1',
        price: decimal(
          product?.purchasePriceCents ??
            data.products.find((p) => !p.archived)?.purchasePriceCents ??
            0,
        ),
      },
    ],
  );
  const [returns, setReturns] = useState<Record<string, string>>(
    Object.fromEntries(event?.lines.map((l) => [l.id, decimal(l.quantityReturned, 3)]) ?? []),
  );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const f = new FormData(e.currentTarget);
    const v = (key: string) => String(f.get(key) ?? '');
    try {
      let command: Command;
      switch (kind) {
        case 'participant':
          command = { type: 'participant.save', id, name: v('name') };
          break;
        case 'contribution':
          command = {
            type: 'contribution.save',
            id,
            participantId: v('participantId'),
            amountCents: cents(v('amount')),
            date: v('date'),
            note: v('note'),
          };
          break;
        case 'product':
          command = {
            type: 'product.save',
            id,
            name: v('name'),
            category: v('category'),
            purchasePriceCents: cents(v('price')),
            lowStockThreshold: units(v('threshold')),
          };
          break;
        case 'entry':
          command = {
            type: 'entry.save',
            id,
            date: v('date'),
            note: v('note'),
            items: items.map((i) => ({
              productId: i.productId,
              quantity: units(i.quantity),
              unitPriceCents: cents(i.price),
            })),
          };
          break;
        case 'event':
          command = { type: 'event.save', id, name: v('name'), date: v('date'), note: v('note') };
          break;
        case 'issue':
          command = {
            type: 'event.issue',
            id,
            eventId: eventId!,
            productId: v('productId'),
            quantityOut: units(v('quantity')),
          };
          break;
        case 'close':
          command = {
            type: 'event.close',
            eventId: eventId!,
            returns: event!.lines.map((l) => ({
              id: l.id,
              quantityReturned: units(returns[l.id]),
            })),
          };
          break;
        default:
          throw new Error('Formulaire inconnu.');
      }
      await onSave(command);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer.');
    }
  };
  const dateField = (value?: string) => (
    <label>
      Date
      <input type="date" name="date" required defaultValue={value ?? today()} />
    </label>
  );
  const noteField = (value?: string) => (
    <label>
      Commentaire <span className="optional">(facultatif)</span>
      <textarea
        name="note"
        rows={2}
        maxLength={1000}
        placeholder="Une précision utile à l’équipe…"
        defaultValue={value}
      />
    </label>
  );
  return (
    <form className="edit-form" onSubmit={submit}>
      {kind === 'participant' && (
        <label>
          Nom du participant
          <input
            name="name"
            required
            maxLength={120}
            autoFocus
            defaultValue={participant?.name}
            placeholder="Ex. Paul Dubois"
          />
        </label>
      )}
      {kind === 'contribution' && (
        <>
          <label>
            Participant
            <select name="participantId" required defaultValue={contribution?.participantId ?? ''}>
              <option value="" disabled>
                Choisir un participant
              </option>
              {data.participants
                .filter((p) => !p.archived || p.id === contribution?.participantId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          {!data.participants.some((p) => !p.archived) && (
            <p className="info-box">Créez d’abord un participant depuis la page Participants.</p>
          )}
          <div className="form-grid">
            <label>
              Montant reçu (€)
              <input
                name="amount"
                inputMode="decimal"
                required
                defaultValue={contribution ? decimal(contribution.amountCents) : ''}
                placeholder="50,00"
              />
            </label>
            {dateField(contribution?.date)}
          </div>
          {noteField(contribution?.note)}
          <p className="info-box">Enregistrez uniquement l’argent réellement reçu par l’équipe.</p>
        </>
      )}
      {kind === 'product' && (
        <>
          <label>
            Nom du produit
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={product?.name}
              placeholder="Ex. Coca-Cola 33 cl"
            />
          </label>
          <label>
            Catégorie
            <input
              name="category"
              list="categories"
              required
              maxLength={120}
              defaultValue={product?.category}
              placeholder="Ex. Boissons sans alcool"
            />
            <datalist id="categories">
              {[
                ...new Set([
                  'Boissons sans alcool',
                  'Bières',
                  'À grignoter',
                  'Autres',
                  ...data.products.map((p) => p.category),
                ]),
              ].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <div className="form-grid">
            <label>
              Prix d’achat par unité (€)
              <input
                name="price"
                inputMode="decimal"
                required
                defaultValue={product ? decimal(product.purchasePriceCents) : ''}
                placeholder="1,20"
              />
            </label>
            <label>
              Seuil d’alerte (unités)
              <input
                name="threshold"
                inputMode="decimal"
                required
                defaultValue={product ? decimal(product.lowStockThreshold, 3) : '3'}
              />
            </label>
          </div>
          <p className="info-box">
            Le stock est calculé à partir des mouvements. Après création, ajoutez une entrée de
            stock. Modifier le prix du catalogue ne change pas les anciens achats.
          </p>
        </>
      )}
      {kind === 'entry' && (
        <>
          {dateField(entry?.date)}
          <div className="entry-lines">
            {items.map((item, i) => (
              <div className="entry-line" key={i}>
                <label>
                  Produit
                  <select
                    aria-label={`Produit ${i + 1}`}
                    value={item.productId}
                    required
                    onChange={(e) =>
                      setItems(
                        items.map((row, index) =>
                          index === i
                            ? {
                                ...row,
                                productId: e.target.value,
                                price: decimal(
                                  data.products.find((p) => p.id === e.target.value)!
                                    .purchasePriceCents,
                                ),
                              }
                            : row,
                        ),
                      )
                    }
                  >
                    <option value="" disabled>
                      Choisir un produit
                    </option>
                    {data.products
                      .filter((p) => !p.archived || entry?.items.some((e) => e.productId === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    Quantité
                    <input
                      aria-label={`Quantité ${i + 1}`}
                      inputMode="decimal"
                      required
                      value={item.quantity}
                      onChange={(e) =>
                        setItems(
                          items.map((row, index) =>
                            index === i ? { ...row, quantity: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Prix unitaire (€)
                    <input
                      aria-label={`Prix unitaire ${i + 1}`}
                      inputMode="decimal"
                      required
                      value={item.price}
                      onChange={(e) =>
                        setItems(
                          items.map((row, index) =>
                            index === i ? { ...row, price: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => setItems(items.filter((_, index) => index !== i))}
                  >
                    <Trash2 size={14} />
                    Retirer ce produit
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              setItems([
                ...items,
                {
                  productId: data.products.find((p) => !p.archived)?.id ?? '',
                  quantity: '1',
                  price: decimal(data.products.find((p) => !p.archived)?.purchasePriceCents ?? 0),
                },
              ])
            }
          >
            <Plus size={16} />
            Ajouter un produit
          </button>
          {noteField(entry?.note)}
          <p className="info-box">
            Les achats sont acceptés même si les fonds sont insuffisants. Le déficit sera visible
            sur le dashboard.
          </p>
        </>
      )}
      {kind === 'event' && (
        <>
          <label>
            Nom de la soirée
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={event?.name}
              placeholder="Ex. Après-match du samedi"
            />
          </label>
          {dateField(event?.date)}
          {noteField(event?.note)}
        </>
      )}
      {kind === 'issue' && (
        <>
          <label>
            Produit
            <select name="productId" required defaultValue={line?.productId ?? ''}>
              <option value="" disabled>
                Choisir un produit
              </option>
              {data.products
                .filter(
                  (p) =>
                    (data.projection.stock[p.id]?.quantity ?? 0) > 0 || p.id === line?.productId,
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {quantity(data.projection.stock[p.id]?.quantity ?? 0)} disponible(s)
                  </option>
                ))}
            </select>
          </label>
          <label>
            Quantité à sortir
            <input
              name="quantity"
              inputMode="decimal"
              required
              placeholder="1"
              defaultValue={line ? decimal(line.quantityOut, 3) : ''}
            />
          </label>
          <p className="info-box">
            Le stock disponible diminue dès l’enregistrement. Vous indiquerez les retours à la
            clôture. Les quantités acceptent jusqu’à 3 décimales.
          </p>
        </>
      )}
      {kind === 'close' && (
        <>
          <p className="info-box">
            Saisissez ce qui revient au stock. Le reste sera comptabilisé comme consommé. Une
            demi-bouteille peut être retournée avec la quantité 0,5.
          </p>
          <div className="return-list">
            {event?.lines.map((l) => {
              const p = data.products.find((p) => p.id === l.productId)!;
              let consumed = '—';
              try {
                const r = units(returns[l.id]);
                if (r <= l.quantityOut) consumed = quantity(l.quantityOut - r);
              } catch {}
              return (
                <div key={l.id} className="return-row">
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {quantity(l.quantityOut)} sorti(s) · {consumed} consommé(s)
                    </small>
                  </div>
                  <label>
                    Retour
                    <input
                      aria-label={`Retour ${p.name}`}
                      inputMode="decimal"
                      required
                      value={returns[l.id]}
                      onChange={(e) => setReturns({ ...returns, [l.id]: e.target.value })}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="form-footer">
        <button className="button primary" disabled={busy}>
          {busy
            ? 'Enregistrement…'
            : kind === 'close'
              ? event?.status === 'CLOSED'
                ? 'Enregistrer la correction'
                : 'Clôturer la soirée'
              : id
                ? 'Enregistrer les modifications'
                : 'Enregistrer'}
          {kind === 'close' ? <Check size={17} /> : <ArrowRight size={17} />}
        </button>
      </div>
    </form>
  );
}
