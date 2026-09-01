import { test, expect } from '@playwright/test';
import { URLS } from '../playwright.config';

/**
 * Operator dashboard smoke: log in through the same-origin API (the app stores
 * pos_user / pos_restaurant in localStorage and the JWT rides an httpOnly cookie),
 * then confirm the authenticated Overview renders. Proves the SPA boots, auth
 * works, and the API is reachable end to end.
 */
test('operator can log in and load the Overview', async ({ page }) => {
  await page.goto(URLS.dashboard);

  // Authenticate via the same API the login form posts to, then seed the client.
  const ok = await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: 'admin@demo.com', password: 'admin123' }),
    });
    if (!r.ok) return false;
    const j = await r.json();
    if (j.user) localStorage.setItem('pos_user', JSON.stringify(j.user));
    if (j.restaurant) localStorage.setItem('pos_restaurant', JSON.stringify(j.restaurant));
    return true;
  });
  expect(ok, 'demo login should succeed (admin@demo.com / admin123)').toBeTruthy();

  await page.goto(`${URLS.dashboard}/overview`);
  await expect(page.getByRole('heading', { name: /overview/i })).toBeVisible();
  // The Daily Brief instrument is the signature of a loaded, authenticated Overview.
  await expect(page.getByText(/daily brief/i).first()).toBeVisible();
});

test('the Recommendations page loads its funnel', async ({ page }) => {
  await page.goto(URLS.dashboard);
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ email: 'admin@demo.com', password: 'admin123' }),
    });
    const j = await r.json();
    if (j.user) localStorage.setItem('pos_user', JSON.stringify(j.user));
    if (j.restaurant) localStorage.setItem('pos_restaurant', JSON.stringify(j.restaurant));
  });
  await page.goto(`${URLS.dashboard}/reco-performance`);
  await expect(page.getByRole('heading', { name: /recommendations/i })).toBeVisible();
  await expect(page.getByText(/the funnel/i)).toBeVisible();
});
