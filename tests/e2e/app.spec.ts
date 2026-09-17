import { test, expect } from '@playwright/test';

test('authentification, contribution, stock, soirée et retour fractionné sur mobile', async ({
  page,
}) => {
  const suffix = Date.now().toString().slice(-7),
    participant = `Test ${suffix}`,
    product = `Bouteille ${suffix}`,
    event = `Soirée ${suffix}`;
  await page.goto('/');
  await expect(page).toHaveURL(/connexion/);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Un œil sur la buvette' })).toBeVisible();
  await page.goto('/participants');
  await page.getByRole('button', { name: 'Ajouter un participant', exact: true }).click();
  await page.getByLabel('Nom du participant').fill(participant);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/cagnotte');
  await page.getByRole('button', { name: 'Ajouter une contribution', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Participant', exact: true })
    .selectOption({ label: participant });
  await page.getByLabel('Montant reçu').fill('50,15');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const contributionRow = page.getByRole('row').filter({ hasText: participant });
  await expect(contributionRow).toContainText('50,15');
  await contributionRow.getByRole('button', { name: 'Modifier', exact: true }).click();
  await page.getByLabel('Montant reçu').fill('60,15');
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await expect(contributionRow).toContainText('60,15');
  await page.goto('/produits');
  await page.getByRole('button', { name: 'Nouveau produit' }).click();
  await page.getByLabel('Nom du produit').fill(product);
  await page.getByLabel('Catégorie').fill('Boissons sans alcool');
  await page.getByLabel('Prix d’achat par unité').fill('3,15');
  await page.getByLabel('Seuil d’alerte').fill('1');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/stock');
  await page.getByRole('button', { name: 'Entrée de stock', exact: true }).click();
  await page.getByLabel('Produit 1', { exact: true }).selectOption({ label: product });
  await page.getByLabel('Quantité 1', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/soirees');
  await page.getByRole('button', { name: 'Créer une soirée', exact: true }).click();
  await page.getByLabel('Nom de la soirée').fill(event);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: event, exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Sortir des produits' }).click();
  await page
    .getByRole('combobox', { name: 'Produit', exact: true })
    .selectOption({ label: `${product} · 3 disponible(s)` });
  await page.getByLabel('Quantité à sortir').fill('2');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: event, exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Clôturer et saisir les retours' }).click();
  await page.getByLabel(`Retour ${product}`).fill('0,5');
  await page.getByRole('button', { name: 'Clôturer la soirée', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: event, exact: true }) })
    .click();
  await expect(page.getByRole('dialog')).toContainText('1,5');
  await expect(page.getByRole('dialog')).toContainText('4,72');
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.goto('/stock');
  await expect(page.getByRole('row').filter({ hasText: product })).toContainText('1,5');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.goto('/historique');
  await page
    .getByRole('combobox', { name: 'Produit', exact: true })
    .selectOption({ label: product });
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('return');
  await expect(page.getByRole('table')).toContainText(product);
  await expect(page.getByRole('table')).toContainText('0,5');
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/connexion/);
});

test('API protégée, vérification d’origine et réservations concurrentes', async ({
  page,
  request,
}) => {
  const unauthorized = await request.get('/api/register');
  expect(unauthorized.status()).toBe(401);
  const invalidOrigin = await request.post('/api/register', {
    data: { type: 'participant.save', name: 'test' },
  });
  expect(invalidOrigin.status()).toBe(403);
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page).toHaveURL('/');
  const result = await page.evaluate(async () => {
    const post = async (body: unknown) => {
      const r = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    };
    let r = await post({
      type: 'product.save',
      name: `Concurrent ${Date.now()}`,
      category: 'Test',
      purchasePriceCents: 100,
      lowStockThreshold: 0,
    });
    const productId = r.body.products.at(-1).id;
    await post({
      type: 'entry.save',
      date: '2026-09-17',
      note: '',
      items: [{ productId, quantity: 1000, unitPriceCents: 100 }],
    });
    r = await post({ type: 'event.save', name: 'Test simultané', date: '2026-09-17', note: '' });
    const eventId = r.body.events.at(-1).id;
    const attempts = await Promise.all([
      post({ type: 'event.issue', eventId, productId, quantityOut: 1000 }),
      post({ type: 'event.issue', eventId, productId, quantityOut: 1000 }),
    ]);
    const final = await (await fetch('/api/register')).json();
    return {
      statuses: attempts.map((a) => a.status).sort(),
      stock: final.projection.stock[productId].quantity,
    };
  });
  expect(result.statuses).toEqual([200, 400]);
  expect(result.stock).toBe(0);
});
