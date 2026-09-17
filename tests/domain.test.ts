import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, emptyRegister, project } from '../src/lib/domain';
import { cents, decimal, lotValue, money, quantity, ratio, units } from '../src/lib/money';
import type { User } from '../src/lib/types';
const admin: User = {
  id: 'admin',
  name: 'Admin',
  email: 'admin@test.fr',
  passwordHash: '',
  role: 'ADMIN',
};
function fixture() {
  let s = emptyRegister();
  s.users.push(admin);
  const run = (cmd: unknown, user = admin) => {
    s = applyCommand(s, cmd, user);
    return s;
  };
  run({ type: 'participant.save', name: 'Paul' });
  run({
    type: 'product.save',
    name: 'Coca',
    category: 'Boissons',
    purchasePriceCents: 120,
    lowStockThreshold: 1000,
  });
  const productId = s.products[0].id,
    participantId = s.participants[0].id;
  return {
    run,
    state: () => s,
    productId,
    participantId,
    entry: (q: number, price = 120) => {
      run({
        type: 'entry.save',
        date: '2026-09-17',
        note: '',
        items: [{ productId, quantity: q, unitPriceCents: price }],
      });
      return s.entries.at(-1)!;
    },
    contribution: (amount: number) => {
      run({
        type: 'contribution.save',
        participantId,
        amountCents: amount,
        date: '2026-09-17',
        note: '',
      });
      return s.contributions.at(-1)!;
    },
    event: () => {
      run({ type: 'event.save', name: 'Match', date: '2026-09-17', note: '' });
      return s.events.at(-1)!.id;
    },
    issue: (eventId: string, q: number) => {
      run({ type: 'event.issue', eventId, productId, quantityOut: q });
      return s.events.find((e) => e.id === eventId)!.lines.at(-1)!;
    },
    close: (eventId: string, q = 0) =>
      run({
        type: 'event.close',
        eventId,
        returns: s.events
          .find((e) => e.id === eventId)!
          .lines.map((l) => ({ id: l.id, quantityReturned: q })),
      }),
  };
}
test('montants exacts, virgules, quantités fractionnées et ratio nul', () => {
  assert.equal(cents('1,20'), 120);
  assert.equal(cents('0.01'), 1);
  assert.equal(cents('100000.99'), 10000099);
  assert.equal(units('0,125'), 125);
  assert.equal(quantity(10000), '10');
  assert.equal(quantity(10500), '10,5');
  assert.equal(quantity(0), '0');
  assert.equal(decimal(120), '1.20');
  assert.equal(money(-150), '−1,50 €');
  assert.equal(ratio(50000, 40000), '125,0 %');
  assert.equal(ratio(0, 0), '—');
  assert.equal(lotValue(121, 500), 61);
  for (const value of ['1.001', '-1', '1e3', 'NaN', 'Infinity', '', '1,2,3', '9007199254740992'])
    assert.throws(() => cents(value));
});
test('un achat déficitaire est accepté sans contribution', () => {
  const f = fixture();
  f.entry(10000, 1000);
  const p = project(f.state());
  assert.equal(p.fundsCents, 0);
  assert.equal(p.purchasesCents, 10000);
  assert.equal(p.purchaseBalanceCents, -10000);
  assert.equal(p.balanceCents, 0);
});
test('500 € reçus, 600 € achetés, 400 € consommés, 200 € en stock', () => {
  const f = fixture();
  f.contribution(50000);
  f.entry(60000, 1000);
  const event = f.event();
  f.issue(event, 40000);
  let p = project(f.state());
  assert.equal(p.consumedCents, 0);
  assert.equal(p.reservedCents, 40000);
  assert.equal(p.stockCents, 20000);
  f.close(event);
  p = project(f.state());
  assert.equal(p.consumedCents, 40000);
  assert.equal(p.balanceCents, 10000);
  assert.equal(p.purchaseBalanceCents, -10000);
  assert.equal(ratio(p.fundsCents, p.consumedCents), '125,0 %');
});
test('sorties, retours et clôture ne déduisent pas deux fois le stock', () => {
  const f = fixture();
  f.entry(3000);
  const e = f.event();
  f.issue(e, 2000);
  assert.equal(project(f.state()).stock[f.productId].quantity, 1000);
  f.close(e, 1000);
  const p = project(f.state());
  assert.equal(p.stock[f.productId].quantity, 2000);
  assert.equal(p.consumedCents, 120);
  assert.equal(p.reservedCents, 0);
  f.close(e, 1000);
  assert.equal(project(f.state()).stock[f.productId].quantity, 2000);
});
test('FIFO conserve les prix des lots malgré une modification du catalogue', () => {
  const f = fixture();
  f.entry(2000, 120);
  f.entry(3000, 200);
  f.run({
    type: 'product.save',
    id: f.productId,
    name: 'Coca',
    category: 'Boissons',
    purchasePriceCents: 999,
    lowStockThreshold: 1000,
  });
  const e = f.event();
  f.issue(e, 4000);
  f.close(e, 1000);
  const p = project(f.state());
  assert.equal(p.consumedCents, 440);
  assert.equal(p.stockCents, 400);
  assert.equal(p.purchasesCents, 840);
});
test('un retour fractionné conserve chaque centime des lots', () => {
  const f = fixture();
  f.entry(1000, 1);
  const e = f.event();
  f.issue(e, 1000);
  f.close(e, 500);
  const e2 = f.event();
  f.issue(e2, 250);
  f.close(e2, 125);
  const p = project(f.state());
  assert.equal(p.stock[f.productId].quantity, 375);
  assert.equal(p.consumedCents + p.stockCents + p.reservedCents, 1);
});
test('aucune sortie ne peut rendre le stock négatif, même sur plusieurs soirées', () => {
  const f = fixture();
  f.entry(1000);
  const a = f.event(),
    b = f.event();
  f.issue(a, 1000);
  const prior = structuredClone(f.state());
  assert.throws(() => f.issue(b, 1), /Stock insuffisant/);
  assert.deepEqual(f.state(), prior);
});
test('un retour supérieur à la sortie est refusé sans mutation', () => {
  const f = fixture();
  f.entry(2000);
  const e = f.event();
  f.issue(e, 1000);
  const before = structuredClone(f.state());
  assert.throws(() => f.close(e, 1001), /retour dépasse/);
  assert.deepEqual(f.state(), before);
});
test('correction historique bloquée si elle invalide une sortie ultérieure', () => {
  const f = fixture();
  const entry = f.entry(2000);
  const a = f.event();
  f.issue(a, 2000);
  f.close(a, 1000);
  const b = f.event();
  f.issue(b, 1000);
  assert.throws(() => f.close(a, 0), /Stock insuffisant/);
  assert.throws(() => f.run({ type: 'entry.delete', id: entry.id }), /Stock insuffisant/);
  f.run({ type: 'event.delete', id: b });
  f.close(a, 0);
  assert.equal(project(f.state()).stockCents, 0);
});
test('les corrections d’achats recalculent les coûts historiques', () => {
  const f = fixture();
  const entry = f.entry(3000);
  const e = f.event();
  f.issue(e, 1000);
  f.close(e);
  f.run({
    type: 'entry.save',
    id: entry.id,
    date: entry.date,
    note: 'Correction facture',
    items: [{ productId: f.productId, quantity: 3000, unitPriceCents: 150 }],
  });
  const p = project(f.state());
  assert.equal(p.consumedCents, 150);
  assert.equal(p.stockCents, 300);
  assert.equal(f.state().audit.at(-1)?.note, 'Correction facture');
});
test('les sorties clôturées peuvent être corrigées et annulées par admin', () => {
  const f = fixture();
  f.entry(5000);
  const e = f.event();
  const l = f.issue(e, 1000);
  f.close(e);
  f.run({ type: 'event.issue', eventId: e, id: l.id, productId: f.productId, quantityOut: 2000 });
  assert.equal(project(f.state()).consumedCents, 240);
  assert.throws(() => f.issue(e, 1000), /clôturée/);
  f.run({ type: 'event.removeLine', eventId: e, id: l.id });
  assert.equal(project(f.state()).consumedCents, 0);
});
test('contribution modifiée/supprimée : indicateurs recalculés et audit conservé', () => {
  const f = fixture();
  const c = f.contribution(5000);
  f.run({
    type: 'contribution.save',
    id: c.id,
    participantId: f.participantId,
    amountCents: 3000,
    date: c.date,
    note: '',
  });
  assert.equal(project(f.state()).fundsCents, 3000);
  f.run({ type: 'contribution.delete', id: c.id });
  assert.equal(project(f.state()).fundsCents, 0);
  assert.equal(project(f.state()).contributors, 0);
  assert.equal((f.state().audit.at(-1)?.before as { amountCents: number }).amountCents, 3000);
});
test('participants utilisés archivés même après suppression des contributions', () => {
  const f = fixture();
  const c = f.contribution(100);
  f.run({ type: 'contribution.delete', id: c.id });
  f.run({ type: 'participant.delete', id: f.participantId });
  assert.equal(f.state().participants[0].archived, true);
  f.run({ type: 'participant.restore', id: f.participantId });
  assert.equal(f.state().participants[0].archived, false);
});
test('suppression physique des produits jamais utilisés, archivage sinon', () => {
  const unused = fixture();
  unused.run({ type: 'product.delete', id: unused.productId });
  assert.equal(unused.state().products.length, 0);
  const f = fixture();
  f.entry(1000);
  f.run({ type: 'product.delete', id: f.productId });
  assert.equal(f.state().products[0].archived, true);
  assert.equal(project(f.state()).stockCents, 120);
  assert.throws(() => f.entry(1000), /archivé/);
  const e = f.event();
  f.issue(e, 1000);
  f.close(e);
  assert.equal(project(f.state()).consumedCents, 120);
});
test('contrôles de rôle et de références côté domaine', () => {
  const f = fixture(),
    member = { ...admin, role: 'MEMBER' as const };
  f.run({ type: 'participant.save', name: 'Julie' }, member);
  assert.throws(() => f.run({ type: 'product.delete', id: f.productId }, member), /administrateur/);
  assert.throws(
    () =>
      f.run({
        type: 'contribution.save',
        participantId: 'missing',
        amountCents: 100,
        date: '2026-09-17',
        note: '',
      }),
    /introuvable/,
  );
  assert.throws(() =>
    f.run({ type: 'event.save', name: 'Date fausse', date: '2026-02-30', note: '' }),
  );
});
test('100 cycles de sorties/retours fractionnés conservent quantité et valeur', () => {
  const f = fixture();
  f.entry(100000, 137);
  let totalConsumed = 0;
  for (let i = 0; i < 100; i++) {
    const e = f.event();
    const out = 150 + i,
      ret = i % 90;
    f.issue(e, out);
    f.close(e, ret);
    totalConsumed += out - ret;
    const p = project(f.state());
    assert.equal(p.stock[f.productId].quantity, 100000 - totalConsumed);
    assert.equal(p.stockCents + p.reservedCents + p.consumedCents, p.purchasesCents);
  }
});
