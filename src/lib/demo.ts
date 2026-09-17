import { applyCommand, emptyRegister } from './domain';
import { hashPassword } from './password';
import type { User } from './types';
export async function createRegister(user?: User, withDemo = true) {
  let state = emptyRegister();
  const admin: User = user ?? {
    id: 'demo-admin',
    name: 'Camille Martin',
    email: 'demo@buvette.local',
    role: 'ADMIN',
    passwordHash: await hashPassword('Buvette-demo-2026!'),
  };
  state.users.push(admin);
  if (!withDemo) return state;
  const run = (input: unknown) => {
    state = applyCommand(state, input, admin);
  };
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  [
    'Paul Dubois',
    'Thomas Leroy',
    'Julie Moreau',
    'Marc Petit',
    'Camille Martin',
    'Alex Bernard',
  ].forEach((name) => run({ type: 'participant.save', name }));
  [15000, 12500, 10000, 20000, 15000, 10000].forEach((amountCents, i) =>
    run({
      type: 'contribution.save',
      participantId: state.participants[i].id,
      amountCents,
      date: day(-20 + i),
      note: i === 3 ? 'Participation pour la saison' : 'Cagnotte de l’équipe',
    }),
  );
  const products = [
    ['Coca-Cola', 'Boissons sans alcool', 120, 6],
    ['Pack de bière', 'Bières', 1500, 5],
    ['Chips nature', 'À grignoter', 200, 8],
    ['Curly', 'À grignoter', 180, 3],
    ['Bouteille de 3D', 'Boissons sans alcool', 350, 2],
    ['Eau minérale', 'Boissons sans alcool', 60, 6],
  ] as const;
  products.forEach(([name, category, purchasePriceCents, threshold]) =>
    run({
      type: 'product.save',
      name,
      category,
      purchasePriceCents,
      lowStockThreshold: threshold * 1000,
    }),
  );
  run({
    type: 'entry.save',
    date: day(-18),
    note: 'Courses de début de saison',
    items: state.products.map((p, i) => ({
      productId: p.id,
      unitPriceCents: p.purchasePriceCents,
      quantity: [60000, 40000, 30000, 25000, 18000, 48000][i],
    })),
  });
  for (let e = 0; e < 3; e++) {
    run({
      type: 'event.save',
      name: ['Après-match · ESJ / Saint-Grégoire', 'Entraînement du jeudi', 'Soirée de rentrée'][e],
      date: day(-14 + e * 5),
      note: 'Un moment ensemble après le terrain.',
    });
    const event = state.events.at(-1)!;
    state.products.forEach((p, i) =>
      run({
        type: 'event.issue',
        eventId: event.id,
        productId: p.id,
        quantityOut: [15000, 12000, 8000, 7000, 5000, 12000][i],
      }),
    );
    run({
      type: 'event.close',
      eventId: event.id,
      returns: state.events
        .at(-1)!
        .lines.map((l, i) => ({ id: l.id, quantityReturned: [1000, 0, 0, 1000, 500, 1000][i] })),
    });
  }
  run({
    type: 'event.save',
    name: 'Buvette du prochain match',
    date: day(0),
    note: 'Rendez-vous au club-house !',
  });
  run({
    type: 'event.issue',
    eventId: state.events.at(-1)!.id,
    productId: state.products[0].id,
    quantityOut: 6000,
  });
  return state;
}
