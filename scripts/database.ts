import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { createRegister } from '../src/lib/demo';
import { decodeRegister, prefix, redis } from '../src/lib/store';
import { hashPassword } from '../src/lib/password';
import { project } from '../src/lib/domain';

async function main() {
  const action = process.argv[2];
  const db = redis(),
    key = `${prefix()}:registre`;
  if (action === 'migrate') {
    const raw = await db.get<string>(key);
    if (!raw) {
      console.log('Aucun registre. Initialisez-le avec npm run db:seed.');
      return;
    }
    const state = decodeRegister(raw);
    project(state);
    console.log(
      `Schéma v${state.schemaVersion} à jour, révision ${state.revision}. Aucune migration nécessaire.`,
    );
    return;
  }
  if (action !== 'seed') throw new Error('Commande attendue : migrate ou seed.');
  const email = process.env.ADMIN_EMAIL,
    password = process.env.ADMIN_PASSWORD;
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    password.length < 12 ||
    password.length > 256
  )
    throw new Error('Définissez ADMIN_EMAIL et ADMIN_PASSWORD (12 à 256 caractères).');
  const withDemo = process.argv.includes('--demo');
  const state = await createRegister(
    {
      id: crypto.randomUUID(),
      name: process.env.ADMIN_NAME || 'Responsable',
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      role: 'ADMIN',
    },
    withDemo,
  );
  const result = await db.set(key, JSON.stringify(state), { nx: true });
  if (!result)
    throw new Error('Le registre existe déjà. Le seed ne remplace jamais des données existantes.');
  console.log(
    withDemo
      ? 'Registre de démonstration et administrateur créés.'
      : 'Registre vide et administrateur créés.',
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
