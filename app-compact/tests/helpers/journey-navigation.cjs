const { expect } = require('@playwright/test');

async function openTab(page, name) {
  const nav = page.getByRole('navigation', { name: '主要分頁', exact: true });
  const direct = nav.getByRole('button', { name, exact: true });
  if (await direct.count()) await direct.click();
  else {
    await nav.getByRole('button', { name: '更多', exact: true }).click();
    await page.getByRole('dialog', { name: '更多旅程工具' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
  }
}
async function expectCurrentTab(page, tab) {
  await expect(page.locator('.journey-shell')).toHaveAttribute('data-active-tab', tab);
}
module.exports = { openTab, expectCurrentTab };
