import { test, expect } from '@playwright/test';
test('les sept écrans restent accessibles sans débordement sur smartphone', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Un œil sur la buvette' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    '/',
    '/cagnotte',
    '/stock',
    '/produits',
    '/soirees',
    '/participants',
    '/historique',
  ]) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter(
          (e) =>
            e.getBoundingClientRect().right > window.innerWidth + 1 &&
            getComputedStyle(e).position !== 'fixed',
        )
        .slice(0, 12)
        .map((e) => ({
          tag: e.tagName,
          class: e.className,
          right: e.getBoundingClientRect().right,
        })),
    );
    await page.screenshot({
      path: `test-results/mobile-${route.replaceAll('/', '') || 'dashboard'}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Débordement sur ${route}: ${JSON.stringify(overflowing)}`,
    ).toBeTruthy();
    if (route === '/')
      await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  }
  expect(errors).toEqual([]);
});
