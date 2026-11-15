const { test, expect } = require('@playwright/test');
const { openTab } = require('./helpers/journey-navigation.cjs');
const origin = process.env.COMPACT_TEST_ORIGIN || 'http://127.0.0.1:8903';
const date = '2026-12-03';
const text = 'Day 1 2026-12-03 東京\n08:45 CX500 香港飛東京\n14:15 上野公園\n15:30 雷門\n住宿：山湖旅館，16:30 入住\n行前準備：觀鳥望遠鏡\n預算 JPY 42,000';
const day = { date, day: 1, region: '東京', city: '東京', country: '日本', currency: 'JPY', timezone: 'Asia/Tokyo', note: '在公園觀鳥。',
  spots: [{ time: '08:45', timeEnd: '13:45', timezone: 'Asia/Hong_Kong', endTimezone: 'Asia/Tokyo', endDate: date, type: 'flight', name: 'CX500 香港飛東京' },
    { time: '14:15', name: '上野公園', type: 'sightseeing' }, { time: '15:30', name: '雷門', type: 'sightseeing' }, { time: '', name: '自由活動', type: 'other' }],
  lodging: { name: '山湖旅館', checkIn: '16:30', address: '東京站前' },
  packing: [{ label: '觀鳥望遠鏡', note: '放隨身袋', suggested: false }],
  quiz: [{ question: '行程安排在哪個公園觀鳥？', options: ['上野公園','大阪城'], answer: '上野公園', evidence: '上野公園' }],
};

test.use({ viewport: { width: 390, height: 844 } });
async function tool(page, name) {
  await page.getByRole('button', {name:'旅程工具',exact:true}).click();
  await page.getByRole('dialog', {name:'旅程工具面板'}).getByRole('button', {name,exact:true}).click();
}

for (const theme of ['pocket_planner','alpine_postcard','night_ledger']) {
  test(`confirmed paste reaches each tab and both trip games in ${theme}`, async ({page}) => {
    const prompts = [];
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.pathname !== '/openrouter/json') return route.abort();
      prompts.push(route.request().postDataJSON().prompt);
      return route.fulfill({ json: { ok:true, data:{trip:{name:'東京觀鳥旅程', startDate:date, endDate:date, destinationSummary:'東京', budget:42000, currencies:['JPY'], itinerary:[day]}} } });
    });
    await page.addInitScript(({theme,date}) => {
      window.__disable_supabase_configured = true;
      if (sessionStorage.getItem('content-fixture')) return;
      sessionStorage.setItem('content-fixture','1');
      localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ok:true,exp:Date.now()+86400000}));
      localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({credentialSession:'synthetic-content-session',credentialSessionExpiresAt:Date.now()+86400000}));
      localStorage.setItem('boss-japan-tracker', JSON.stringify({schemaVersion:4, lastTab:'settings', themePreference:theme, autoSync:false, rateMode:'fixed',
        tripUpdateModel:'openrouter/nvidia/nemotron-3-super-120b-a12b:free', activeTripId:'test-content', tripName:'東京', tripDateRange:{start:date,end:date}, receipts:[], tripCurrency:'JPY',
        trips:[{id:'test-content', name:'東京', destinationSummary:'東京', active:true, version:1, startDate:date,endDate:date,currencies:['JPY'],itinerary:[{date,day:1,region:'東京',spots:[]}]}]}));
    }, {theme,date});
    await page.goto(origin+'/travel-expense/compact/#settings');
    await page.locator('.accordion-summary', {hasText:'AI 行程更新'}).click();
    await page.getByPlaceholder(/下次/).fill(text);
    await page.getByRole('button',{name:'用已選模型分析'}).click();
    const review = page.getByRole('dialog',{name:'確認 AI 行程更新'});
    await expect(review).toContainText('1 件用品 · 1 道題目');
    await review.getByRole('button',{name:'確認並更新行程'}).click();
    expect(prompts).toHaveLength(1);
    for (const field of ['packing','quiz','evidence','endTimezone','checkIn','budget','觀鳥望遠鏡']) expect(prompts[0]).toContain(field);
    await openTab(page,'主頁');
    await expect(page.locator('.journey-overview')).toContainText('東京觀鳥旅程');
    await openTab(page,'行程');
    await expect(page.locator('.timeline-day')).toContainText('在公園觀鳥');
    const ev = page.locator('.timeline-event').filter({hasText:'上野公園'}).first();
    const pos = await ev.evaluate(el=>{
      const time=el.querySelector('.timeline-time time').getBoundingClientRect(), node=el.querySelector('.schedule-stop-node').getBoundingClientRect(), card=el.querySelector('.schedule-stop-card').getBoundingClientRect();
      return {ordered:time.right<=node.left && node.right<=card.left, aligned:Math.abs(time.y+time.height/2-node.y-node.height/2)<4};
    });
    expect(pos).toEqual({ordered:true,aligned:true});
    await expect(page.locator('.timeline-event').filter({hasText:'自由活動'}).locator('.timeline-time')).toHaveText('待定');
    await expect(page.locator('.timeline-event').filter({hasText:'山湖旅館'}).locator('.timeline-time')).toHaveText('16:30');
    await ev.getByRole('button',{name:/行程地圖/}).click();
    await expect(page.locator('.planner-place h3')).toHaveText('上野公園');
    await tool(page,'航班'); await expect(page.locator('.journey-flight-ticket')).toContainText('CX500');
    if (theme === 'alpine_postcard') {
      await page.emulateMedia({reducedMotion:'no-preference'});
      await expect.poll(()=>page.locator('.postcard-flight-art img').evaluate(i=>i.currentSrc)).toMatch(/takeoff\.gif/);
      await page.emulateMedia({reducedMotion:'reduce'});
      await expect.poll(()=>page.locator('.postcard-flight-art img').evaluate(i=>i.currentSrc)).toMatch(/takeoff\.webp/);
    }
    await tool(page,'住宿'); await expect(page.locator('.journey-stay-card')).toContainText('山湖旅館');
    await tool(page,'清單'); await expect(page.getByLabel('觀鳥望遠鏡',{exact:true})).toBeVisible();
    if (theme === 'pocket_planner') await expect(page.locator('.journey-check-row')).toHaveCount(53);
    await page.getByLabel('觀鳥望遠鏡',{exact:true}).check();
    await tool(page,'小遊戲');
    await page.getByRole('button',{name:'上野公園',exact:true}).click();
    await expect(page.locator('.game-answer')).toContainText('答啱');
    await page.getByRole('button',{name:'查看成績'}).click();
    await expect(page.locator('.trip-game-round')).toContainText('答中 1 / 1 題');
    await page.getByRole('button',{name:'行程排排看',exact:true}).click();
    const routeGame = page.getByRole('region',{name:'行程排排看'});
    await routeGame.getByRole('button',{name:'雷門'}).click();
    await expect(routeGame.getByRole('status')).toContainText('再試一次');
    await routeGame.getByRole('button',{name:'上野公園'}).click();
    await routeGame.getByRole('button',{name:'雷門'}).click();
    await expect(routeGame.getByRole('status')).toHaveText('全日路線排啱晒！');
    await openTab(page,'記帳'); await expect(page.locator('.scan-calc-launch')).toContainText('JPY');
    await openTab(page,'紀錄'); await expect(page.getByText('未有紀錄',{exact:true}).first()).toBeVisible();
    await openTab(page,'統計');
    await expect(page.locator('.preview-budget-total')).toContainText('HK$ 2,063.00');
    await page.getByRole('group',{name:'顯示貨幣'}).getByRole('button',{name:'JPY',exact:true}).click();
    await expect(page.locator('.preview-budget-total')).toContainText('42,000');
    await openTab(page,'天氣'); await expect(page.locator('.wx-trip-label')).toContainText('東京觀鳥旅程');
    await page.getByRole('button',{name:'Day 1 '+date}).click(); await expect(page.locator('.wx-places')).toContainText(/東京|上野/);
    await page.reload(); await openTab(page,'行程'); await tool(page,'清單');
    await expect(page.getByLabel('觀鳥望遠鏡',{exact:true})).toBeChecked();
    expect(errors).toEqual([]);
  });
}
