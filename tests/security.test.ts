import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { createRegister } from '../src/lib/demo';
import { project } from '../src/lib/domain';
import { checkOrigin } from '../src/lib/auth';
test('scrypt utilise un sel aléatoire et vérifie les mots de passe', async () => {
  const a = await hashPassword('Une-phrase-secrete!'),
    b = await hashPassword('Une-phrase-secrete!');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('Une-phrase-secrete!', a), true);
  assert.equal(await verifyPassword('mauvais', a), false);
  assert.equal(await verifyPassword('test', 'invalid'), false);
});
test('le jeu de démonstration respecte les invariants financiers', async () => {
  const s = await createRegister();
  const p = project(s);
  assert.equal(s.events.length, 4);
  assert.equal(p.closedEvents, 3);
  assert.equal(p.fundsCents, 82500);
  assert.equal(p.purchasesCents, p.stockCents + p.consumedCents + p.reservedCents);
  assert.ok(p.reservedCents > 0);
});
test('le contrôle d’origine accepte l’URL effective du déploiement', () => {
  assert.equal(
    checkOrigin(
      new Request('https://buvette-sg2.vercel.app/api/register', {
        headers: { origin: 'https://buvette-sg2.vercel.app' },
      }),
    ),
    true,
  );
  assert.equal(
    checkOrigin(
      new Request('https://buvette-sg2.vercel.app/api/register', {
        headers: { origin: 'https://attacker.example' },
      }),
    ),
    false,
  );
});
