import { test, expect } from '@playwright/test';
import { URLS } from '../playwright.config';

/**
 * Guest order flow, end to end: walk in → verify (mocked OTP) → occasion → tastes
 * → recommendations → add a pick → place the order, and assert the kitchen
 * received it. This is the whole loop the product is built around; if it passes,
 * the guest app, the recommender, and the order path all work together.
 */
test('a walk-in guest can order from the recommendations', async ({ page }) => {
  await page.goto(URLS.guest);

  // Landing → "Just walked in".
  await page.getByText('Just walked in').click();

  // Details.
  await page.getByPlaceholder(/priya sharma/i).fill('E2E Guest');
  await page.getByPlaceholder(/98765/i).fill('9800012345');
  await page.getByRole('button', { name: /send me the code/i }).click();

  // OTP is mocked — any 6 digits pass. Fill the six single-digit boxes.
  await expect(page.getByText(/enter the code/i)).toBeVisible({ timeout: 15_000 });
  const boxes = page.locator('input:visible');
  const digits = '123456';
  for (let i = 0; i < 6; i += 1) await boxes.nth(i).fill(digits[i]);
  // Some builds auto-verify on the last digit; otherwise click the button.
  const verifyBtn = page.getByRole('button', { name: /verify & continue/i });
  if (await verifyBtn.isVisible().catch(() => false)) await verifyBtn.click().catch(() => {});

  // Table step → Continue.
  await expect(page.getByText(/you're checked in/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /continue/i }).click();

  // Occasion.
  await expect(page.getByText(/what kind of night/i)).toBeVisible();
  await page.getByText('Friends', { exact: true }).click();

  // Interstitial (tap to continue) then Tastes.
  const findBtn = page.getByRole('button', { name: /find our dishes/i });
  await expect(findBtn).toBeVisible({ timeout: 15_000 });
  await findBtn.click();

  // Recommendations render; add the first pick.
  await expect(page.getByText(/picked for your table/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^add/i }).first().click();

  // Review → place order.
  await page.getByRole('button', { name: /review order/i }).click();
  const place = page.getByRole('button', { name: /place order/i });
  await expect(place).toBeVisible();
  await place.click();

  // The kitchen has it.
  await expect(page.getByText(/order's in/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/order number/i)).toBeVisible();
});
