import { z } from 'zod';
import { BusinessError } from './errors';
import { lotValue, safe } from './money';
import type { Allocation, BuvetteEvent, Movement, Projection, Register, User } from './types';

const integer = z.number().int().min(0).max(1_000_000_000);
const positive = integer.min(1);
const text = z.string().trim().min(1).max(120);
const note = z.string().trim().max(1000).default('');
const id = z.string().min(1).max(100);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Date invalide',
  );
const item = z.object({ productId: id, quantity: positive, unitPriceCents: integer });
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('participant.save'), id: id.optional(), name: text }),
  z.object({ type: z.literal('participant.delete'), id }),
  z.object({ type: z.literal('participant.restore'), id }),
  z.object({
    type: z.literal('contribution.save'),
    id: id.optional(),
    participantId: id,
    amountCents: positive,
    date,
    note,
  }),
  z.object({ type: z.literal('contribution.delete'), id }),
  z.object({
    type: z.literal('product.save'),
    id: id.optional(),
    name: text,
    category: text,
    purchasePriceCents: integer,
    lowStockThreshold: integer,
  }),
  z.object({ type: z.literal('product.delete'), id }),
  z.object({ type: z.literal('product.restore'), id }),
  z.object({
    type: z.literal('entry.save'),
    id: id.optional(),
    date,
    note,
    items: z.array(item).min(1).max(100),
  }),
  z.object({ type: z.literal('entry.delete'), id }),
  z.object({ type: z.literal('event.save'), id: id.optional(), name: text, date, note }),
  z.object({ type: z.literal('event.delete'), id }),
  z.object({
    type: z.literal('event.issue'),
    eventId: id,
    id: id.optional(),
    productId: id,
    quantityOut: positive,
  }),
  z.object({ type: z.literal('event.removeLine'), eventId: id, id }),
  z.object({
    type: z.literal('event.close'),
    eventId: id,
    returns: z
      .array(z.object({ id, quantityReturned: integer }))
      .min(1)
      .max(500),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export function emptyRegister(): Register {
  return {
    schemaVersion: 1,
    revision: 0,
    nextSequence: 1,
    users: [],
    participants: [],
    contributions: [],
    products: [],
    entries: [],
    events: [],
    audit: [],
  };
}
function sum(values: number[]): number {
  return safe(values.reduce((s, n) => s + BigInt(n), 0n));
}
function need<T extends { id: string }>(rows: T[], key: string): T {
  const row = rows.find((r) => r.id === key);
  if (!row) throw new BusinessError('Élément introuvable. Actualisez la page.');
  return row;
}

// Splitting a lot keeps the remaining cents with its remaining quantity.
function split(lot: Allocation, requested: number): Allocation {
  const valueCents =
    requested === lot.quantity
      ? lot.valueCents
      : safe((BigInt(lot.valueCents) * BigInt(requested)) / BigInt(lot.quantity));
  const part = { ...lot, quantity: requested, valueCents };
  lot.quantity -= requested;
  lot.valueCents -= valueCents;
  return part;
}
export function project(state: Register): Projection {
  const lots: Allocation[] = [],
    held = new Map<string, Allocation[]>();
  const lines: Projection['lines'] = {},
    movements: Movement[] = [];
  let purchasesCents = 0,
    consumedCents = 0;
  const operations: { seq: number; run: () => void }[] = [];
  for (const entry of state.entries)
    operations.push({
      seq: entry.sequence,
      run: () => {
        for (const item of entry.items) {
          const product = need(state.products, item.productId);
          const valueCents = lotValue(item.unitPriceCents, item.quantity);
          purchasesCents = sum([purchasesCents, valueCents]);
          lots.push({
            lotId: item.id,
            productId: item.productId,
            sequence: entry.sequence,
            quantity: item.quantity,
            valueCents,
          });
          movements.push({
            id: item.id,
            date: entry.date,
            type: 'entry',
            label: product.name,
            productId: product.id,
            quantity: item.quantity,
            amountCents: valueCents,
            note: entry.note,
          });
        }
      },
    });
  for (const event of state.events) {
    for (const line of event.lines)
      operations.push({
        seq: line.sequence,
        run: () => {
          const product = need(state.products, line.productId);
          let remaining = line.quantityOut;
          const allocations: Allocation[] = [];
          for (const lot of lots
            .filter((l) => l.productId === product.id && l.quantity > 0)
            .sort((a, b) => a.sequence - b.sequence)) {
            if (!remaining) break;
            const take = Math.min(remaining, lot.quantity);
            allocations.push(split(lot, take));
            remaining -= take;
          }
          if (remaining)
            throw new BusinessError(
              `Stock insuffisant pour « ${product.name} » lors de « ${event.name} ». Corrigez d’abord les sorties concernées.`,
            );
          held.set(line.id, allocations);
          lines[line.id] = {
            outCents: sum(allocations.map((a) => a.valueCents)),
            consumedCents: 0,
            returnedCents: 0,
          };
          movements.push({
            id: `${line.id}:out`,
            date: event.date,
            type: 'out',
            label: product.name,
            productId: product.id,
            eventId: event.id,
            quantity: line.quantityOut,
            amountCents: lines[line.id].outCents,
            note: event.name,
          });
        },
      });
    if (event.status === 'CLOSED') {
      if (event.closeSequence === null) throw new BusinessError('Clôture incohérente.');
      operations.push({
        seq: event.closeSequence,
        run: () => {
          for (const line of event.lines) {
            if (line.quantityReturned > line.quantityOut)
              throw new BusinessError('Le retour ne peut pas dépasser la quantité sortie.');
            const allocations = held.get(line.id);
            if (!allocations) throw new BusinessError('Ordre des mouvements incohérent.');
            let toConsume = line.quantityOut - line.quantityReturned,
              cost = 0;
            for (const allocation of allocations) {
              const taken = split(allocation, Math.min(toConsume, allocation.quantity));
              cost = sum([cost, taken.valueCents]);
              toConsume -= taken.quantity;
              if (allocation.quantity) lots.push({ ...allocation });
            }
            const returnedCents = sum(allocations.map((a) => a.valueCents));
            lines[line.id].consumedCents = cost;
            lines[line.id].returnedCents = returnedCents;
            consumedCents = sum([consumedCents, cost]);
            held.delete(line.id);
            const common = {
              date: event.date,
              label: need(state.products, line.productId).name,
              productId: line.productId,
              eventId: event.id,
              note: event.name,
            };
            movements.push({
              ...common,
              id: `${line.id}:consumed`,
              type: 'consumed',
              quantity: line.quantityOut - line.quantityReturned,
              amountCents: cost,
            });
            if (line.quantityReturned)
              movements.push({
                ...common,
                id: `${line.id}:return`,
                type: 'return',
                quantity: line.quantityReturned,
                amountCents: returnedCents,
              });
          }
        },
      });
    }
  }
  const sequences = operations.map((o) => o.seq);
  if (new Set(sequences).size !== sequences.length)
    throw new BusinessError('Séquences du registre dupliquées.');
  operations.sort((a, b) => a.seq - b.seq).forEach((o) => o.run());
  const stock: Projection['stock'] = {};
  for (const product of state.products) {
    const available = lots.filter((l) => l.productId === product.id);
    stock[product.id] = {
      quantity: sum(available.map((l) => l.quantity)),
      valueCents: sum(available.map((l) => l.valueCents)),
    };
  }
  for (const c of state.contributions)
    movements.push({
      id: c.id,
      date: c.date,
      type: 'contribution',
      label: need(state.participants, c.participantId).name,
      participantId: c.participantId,
      amountCents: c.amountCents,
      note: c.note,
    });
  const fundsCents = sum(state.contributions.map((c) => c.amountCents));
  const reservedCents = sum([...held.values()].flat().map((a) => a.valueCents));
  const stockCents = sum(Object.values(stock).map((s) => s.valueCents));
  if (sum([stockCents, reservedCents, consumedCents]) !== purchasesCents)
    throw new BusinessError('La valorisation du registre est incohérente.');
  const closedEvents = state.events.filter((e) => e.status === 'CLOSED').length;
  return {
    stock,
    lines,
    fundsCents,
    purchasesCents,
    consumedCents,
    reservedCents,
    stockCents,
    balanceCents: fundsCents - consumedCents,
    purchaseBalanceCents: fundsCents - purchasesCents,
    contributors: new Set(state.contributions.map((c) => c.participantId)).size,
    closedEvents,
    averageCents: closedEvents
      ? safe((BigInt(consumedCents) + BigInt(closedEvents) / 2n) / BigInt(closedEvents))
      : 0,
    movements: movements.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export function applyCommand(original: Register, input: unknown, actor: User): Register {
  const command = commandSchema.parse(input);
  const state = structuredClone(original),
    now = new Date().toISOString();
  const meta = () => ({ id: crypto.randomUUID(), createdAt: now, updatedAt: now });
  const isCorrection =
    ('id' in command && !!command.id) ||
    command.type.endsWith('.delete') ||
    command.type.endsWith('.restore') ||
    (command.type === 'event.close' && need(state.events, command.eventId).status === 'CLOSED');
  if (isCorrection && actor.role !== 'ADMIN')
    throw new BusinessError('Cette correction ou suppression est réservée à l’administrateur.');
  let before: unknown = null,
    after: unknown = null,
    entityId = '',
    eventId: string | undefined,
    participantId: string | undefined;
  let productIds: string[] = [];
  const update = <T extends { id: string; updatedAt: string }>(
    rows: T[],
    key: string | undefined,
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>,
  ): T => {
    if (key) {
      const row = need(rows, key);
      before = structuredClone(row);
      Object.assign(row, data, { updatedAt: now });
      after = row;
      entityId = row.id;
      return row;
    }
    const row = { ...meta(), ...data } as unknown as T;
    rows.push(row);
    after = row;
    entityId = row.id;
    return row;
  };
  const remove = <T extends { id: string }>(rows: T[], key: string) => {
    const row = need(rows, key);
    before = structuredClone(row);
    entityId = row.id;
    rows.splice(rows.indexOf(row), 1);
  };
  switch (command.type) {
    case 'participant.save': {
      const old = command.id ? need(state.participants, command.id) : undefined;
      const row = update(state.participants, command.id, {
        name: command.name,
        archived: old?.archived ?? false,
      });
      participantId = row.id;
      break;
    }
    case 'participant.delete':
    case 'participant.restore': {
      const row = need(state.participants, command.id);
      before = structuredClone(row);
      entityId = participantId = row.id;
      if (command.type.endsWith('restore')) {
        row.archived = false;
        row.updatedAt = now;
        after = row;
      } else if (
        state.contributions.some((c) => c.participantId === row.id) ||
        state.audit.some((a) => a.participantId === row.id && a.type.startsWith('contribution.'))
      ) {
        row.archived = true;
        row.updatedAt = now;
        after = row;
      } else remove(state.participants, row.id);
      break;
    }
    case 'contribution.save': {
      const participant = need(state.participants, command.participantId);
      if (
        participant.archived &&
        (!command.id || need(state.contributions, command.id).participantId !== participant.id)
      )
        throw new BusinessError('Ce participant est archivé.');
      update(state.contributions, command.id, {
        participantId: command.participantId,
        amountCents: command.amountCents,
        date: command.date,
        note: command.note,
      });
      participantId = command.participantId;
      break;
    }
    case 'contribution.delete':
      participantId = need(state.contributions, command.id).participantId;
      remove(state.contributions, command.id);
      break;
    case 'product.save': {
      const old = command.id ? need(state.products, command.id) : undefined;
      const row = update(state.products, command.id, {
        name: command.name,
        category: command.category,
        purchasePriceCents: command.purchasePriceCents,
        lowStockThreshold: command.lowStockThreshold,
        archived: old?.archived ?? false,
      });
      productIds = [row.id];
      break;
    }
    case 'product.delete':
    case 'product.restore': {
      const row = need(state.products, command.id);
      before = structuredClone(row);
      entityId = row.id;
      productIds = [row.id];
      if (command.type.endsWith('restore')) {
        row.archived = false;
        row.updatedAt = now;
        after = row;
      } else if (
        state.entries.some((e) => e.items.some((i) => i.productId === row.id)) ||
        state.events.some((e) => e.lines.some((l) => l.productId === row.id)) ||
        state.audit.some(
          (a) =>
            a.productIds.includes(row.id) &&
            (a.type.startsWith('entry.') || a.type.startsWith('event.')),
        )
      ) {
        row.archived = true;
        row.updatedAt = now;
        after = row;
      } else remove(state.products, row.id);
      break;
    }
    case 'entry.save': {
      const old = command.id ? need(state.entries, command.id) : undefined;
      for (const item of command.items) {
        const p = need(state.products, item.productId);
        if (p.archived && !old?.items.some((i) => i.productId === p.id))
          throw new BusinessError('Un produit archivé ne peut plus être acheté.');
      }
      update(state.entries, command.id, {
        date: command.date,
        note: command.note,
        sequence: old?.sequence ?? state.nextSequence++,
        items: command.items.map((i, index) => ({
          ...i,
          id: old?.items[index]?.id ?? crypto.randomUUID(),
        })),
      });
      productIds = command.items.map((i) => i.productId);
      break;
    }
    case 'entry.delete':
      productIds = need(state.entries, command.id).items.map((i) => i.productId);
      remove(state.entries, command.id);
      break;
    case 'event.save': {
      const old = command.id ? need(state.events, command.id) : undefined;
      const row = update(state.events, command.id, {
        name: command.name,
        date: command.date,
        note: command.note,
        status: old?.status ?? 'OPEN',
        closeSequence: old?.closeSequence ?? null,
        lines: old?.lines ?? [],
      });
      eventId = row.id;
      break;
    }
    case 'event.delete': {
      const event = need(state.events, command.id);
      eventId = event.id;
      productIds = event.lines.map((l) => l.productId);
      remove(state.events, command.id);
      break;
    }
    case 'event.issue':
    case 'event.removeLine':
    case 'event.close': {
      const event: BuvetteEvent = need(state.events, command.eventId);
      before = structuredClone(event);
      entityId = eventId = event.id;
      if (command.type === 'event.close') {
        if (!event.lines.length)
          throw new BusinessError('Ajoutez au moins une sortie avant de clôturer.');
        if (
          command.returns.length !== event.lines.length ||
          new Set(command.returns.map((r) => r.id)).size !== event.lines.length
        )
          throw new BusinessError('Renseignez le retour de chaque ligne exactement une fois.');
        for (const line of event.lines) {
          const result = need(command.returns, line.id);
          if (result.quantityReturned > line.quantityOut)
            throw new BusinessError('Le retour dépasse la sortie.');
          line.quantityReturned = result.quantityReturned;
          line.updatedAt = now;
        }
        event.status = 'CLOSED';
        event.closeSequence ??= state.nextSequence++;
      } else {
        if (event.status !== 'OPEN' && command.type === 'event.issue' && !command.id)
          throw new BusinessError(
            'Cette soirée est clôturée. Corrigez ses sorties existantes ou annulez-la.',
          );
        if (command.type === 'event.removeLine') {
          const line = need(event.lines, command.id);
          event.lines.splice(event.lines.indexOf(line), 1);
        } else {
          need(state.products, command.productId);
          if (command.id)
            Object.assign(need(event.lines, command.id), {
              productId: command.productId,
              quantityOut: command.quantityOut,
              updatedAt: now,
            });
          else
            event.lines.push({
              ...meta(),
              productId: command.productId,
              quantityOut: command.quantityOut,
              quantityReturned: 0,
              sequence: state.nextSequence++,
            });
        }
      }
      event.updatedAt = now;
      after = event;
      productIds = [
        ...new Set([
          ...(before as BuvetteEvent).lines.map((l) => l.productId),
          ...event.lines.map((l) => l.productId),
        ]),
      ];
      break;
    }
  }
  project(state);
  state.revision++;
  state.audit.push({
    id: crypto.randomUUID(),
    date: now,
    actorId: actor.id,
    actorName: actor.name,
    type: command.type,
    entityId,
    note: 'note' in command ? command.note : '',
    before,
    after: structuredClone(after),
    productIds,
    participantId,
    eventId,
  });
  return state;
}
