const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

async function setAccordion(page, title, expanded = true) {
  const button = page.getByRole('button', { name: new RegExp(title) });
  if ((await button.getAttribute('aria-expanded')) !== String(expanded)) await button.click();
}

// Seeds a 6-person trip where only 2 people have an explicit share ratio (50 each) and the other
// FOUR have NO shareRatios entry. Pre-fix, computeSettlements defaulted the missing four to weight 1,
// so a ¥60000 shared meal charged them ¥60000/104 ≈ ¥577 each instead of the fair ¥10000. This test
// proves the fix (missing → mean of positive ratios → fair equal split) AND the percentage UI.
test('6-person shared trip: missing-ratio persons are charged fairly + percentage UI', async ({ page }) => {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'six-person', credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    const persons = [
      { id: 'p_boss', name: 'A', emoji: '👤', color: '#CC2929' },
      { id: 'p2', name: 'B', emoji: '🧳', color: '#1E4D6B' },
      { id: 'p3', name: 'C', emoji: '🗺️', color: '#2D6E48' },
      { id: 'p4', name: 'D', emoji: '🎒', color: '#D4A843' },
      { id: 'p5', name: 'E', emoji: '🚆', color: '#7C5CFF' },
      { id: 'p6', name: 'F', emoji: '📷', color: '#0EA5E9' },
    ];
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings', budget: 100000, rate: 20.36, tripCurrency: 'JPY',
      persons,
      shareRatios: { p_boss: 50, p2: 50 }, // p3..p6 intentionally MISSING
      receipts: [{
        id: 'r_meal', store: '六人晚餐', total: 60000, currency: 'JPY', originalCurrency: 'JPY',
        date: '2026-04-21', category: 'food', payment: 'cash',
        personId: 'p_boss', splitMode: 'shared', createdAt: Date.now(), updatedAt: Date.now(),
      }],
    }));
  });
  await page.goto('http://localhost:8903/travel-expense/compact/#settings');
  await setAccordion(page, '旅伴');

  // Percentage UI: 6 inputs, each summing to 100, last read-only auto.
  const shareInputs = page.locator('.person-share-field input');
  await expect(shareInputs).toHaveCount(6);
  const pcts = [];
  for (let i = 0; i < 6; i++) pcts.push(Number(await shareInputs.nth(i).inputValue()));
  console.log('percent inputs:', pcts, 'sum:', pcts.reduce((a, b) => a + b, 0));
  expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
  await expect(shareInputs.nth(5)).toHaveAttribute('readonly', '');
  // p_boss:50, p2:50, p3..p6 missing → normalized display gives the two set people the visible weight;
  // what matters for correctness is the settlement below, not the raw display normalization.

  // Settlement fairness: read the "應付" (should-pay) lines. With the fix every person's should-pay
  // is the fair 60000/6 = 10000 (missing four default to the mean of the positive ratios = 50 = equal).
  const miniList = page.locator('.mini-list');
  await expect(miniList).toBeVisible();
  const text = await miniList.innerText();
  console.log('settlement mini-list:\n', text);
  // Extract every "應付 ¥N" number.
  const shouldPays = [...text.matchAll(/應付\s*¥([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  console.log('shouldPays:', shouldPays);
  expect(shouldPays.length).toBe(6);
  // Fair equal split: each ≈ 10000 (allow ±1 for largest-remainder rounding). Pre-fix the missing
  // four would be ≈577 and the two set ones ≈28846 — this assertion would fail loudly on regression.
  for (const sp of shouldPays) {
    expect(sp).toBeGreaterThanOrEqual(9999);
    expect(sp).toBeLessThanOrEqual(10001);
  }
  // Balances must sum to zero (no created/lost money).
  const paids = [...text.matchAll(/已付 shared\s*¥([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  const totalPaid = paids.reduce((a, b) => a + b, 0);
  expect(totalPaid).toBe(60000); // only A paid, the full shared meal
});
