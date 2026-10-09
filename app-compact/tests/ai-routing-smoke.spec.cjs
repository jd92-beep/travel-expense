const { test, expect } = require('@playwright/test');
const ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';
const BASE = `${ORIGIN}/travel-expense/compact/`;
const MUSE = 'openrouter/meta/muse-spark-1.3-contributor';
const NEM = 'openrouter/nvidia/nemotron-3-super-120b-a12b:free';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64');
test.use({ viewport: { width: 390, height: 844 } });
async function setup(page, settings = {}, respond) {
  const calls = [];
  await page.route('**/secrets.local.js', route => route.fulfill({ contentType:'application/javascript', body:'window.DEV_SECRETS = {};' }));
  await page.route('https://travel-expense-credential-broker.*.workers.dev/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.endsWith('/json')) return route.fulfill({ contentType:'application/json', body:JSON.stringify({ok:true,broker:'online',providers:[]}) });
    const body = route.request().postDataJSON(); calls.push({provider:path.split('/')[1], ...body});
    const result = respond ? respond(body, calls.length) : { data:body.kind === 'test' ? {ok:true} : body.kind === 'trip' ? {
      trip:{name:'AI 首爾旅程', startDate:'2026-10-20',endDate:'2026-10-22',itinerary:[{date:'2026-10-20',day:1,city:'首爾',country:'韓國',currency:'KRW',timezone:'Asia/Seoul',spots:[{time:'09:30',name:'景福宮',type:'sightseeing'}]}]},summary:'已擷取',warnings:[],changes:[]
    } : body.kind === 'scan' ? {store:'Cafe Sakura（櫻花咖啡店）',total:12.34,currency:'USD',date:'2026-10-20',payment:'',category:'food',lineItems:[{desc:'Iced tea（凍茶）',amount:12.34,qty:2}]} : [{store:'Hana Hotel（花酒店）',total:24000,currency:'JPY',date:'2026-10-20',payment:'',category:'lodging',bookingRef:'HANA8',note:'2晚，未有付款證據'}] };
    await route.fulfill({status:result.status || 200,contentType:'application/json',body:JSON.stringify(result.status ? {ok:false,error:result.error} : {ok:true,...result})});
  });
  await page.addInitScript(settings => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1',JSON.stringify({ok:true,exp:Date.now()+3600000}));
    localStorage.setItem('boss-japan-tracker:credential-session:v1',JSON.stringify({credentialSession:'disposable-model-smoke',credentialSessionExpiresAt:Date.now()+3600000}));
    localStorage.setItem('boss-japan-tracker',JSON.stringify({lastTab:'scan',receipts:[],scanModel:'auto',voiceModel:'auto',emailModel:'auto',tripUpdateModel:'auto',aiTranslationLanguage:'yue-HK',...settings}));
  },settings);
  await page.goto(`${BASE}#${settings.lastTab || 'scan'}`);
  return calls;
}
async function library(page, action) {
  return page.evaluate(async action => {
    const ai = await import('/travel-expense/compact/src/lib/ai.ts');
    const {DEFAULT_STATE} = await import('/travel-expense/compact/src/lib/constants.ts');
    const state = {...DEFAULT_STATE,credentialSession:'disposable-model-smoke',credentialSessionExpiresAt:Date.now()+3600000,...action.state};
    try {
      if (action.kind==='trip') return {result:await ai.parseTripParagraph('2026-10-20 首爾 09:30 景福宮',state)};
      return {result:await ai.parseTextWithAi('日本酒店 HANA8，2026-10-20 入住，JPY24000，2晚',state,action.kind==='voice'?'react-voice':'react-email')};
    } catch(e) { return {error:e.message}; }
  },action);
}
test('provider groups start collapsed, filter image capability and persist a real selection',async({page})=>{
  const calls=await setup(page,{lastTab:'settings'});
  const section=page.locator('.accordion-card').filter({has:page.getByRole('button',{name:/AI 模型選擇/})});
  await section.getByRole('button',{name:/AI 模型選擇/}).click();
  const picker=section.locator('.ai-model-field').first();
  for(const provider of ['Google','OpenRouter','OpenCode Zen']) await expect(picker.getByRole('button',{name:new RegExp(provider)})).toHaveAttribute('aria-expanded','false');
  await picker.getByRole('button',{name:/OpenRouter/}).click();
  await expect(picker.getByRole('radio',{name:/Nemotron 3 Super/i})).toHaveCount(0);
  await expect(picker.getByRole('radio',{name:/Muse Spark/})).toBeVisible();
  const model=picker.getByRole('radio',{name:/MiMo-V2.6-Flash/i});await model.check();
  await expect(model).toBeChecked();
  await picker.getByRole('button',{name:/OpenRouter/}).click();
  await expect(model).toBeHidden();
  await expect(section.getByText('Kimi',{exact:true})).toHaveCount(0);
  await section.getByLabel('AI 翻譯語言').selectOption('en');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('boss-japan-tracker')).scanModel)).toBe('openrouter/xiaomi/mimo-v2.6-flash');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('boss-japan-tracker')).aiTranslationLanguage)).toBe('en');
  await picker.getByRole('button',{name:/測試/}).click();
  await expect.poll(()=>calls.length).toBe(1);
  expect(calls[0]).toMatchObject({provider:'openrouter',model:'xiaomi/mimo-v2.6-flash',kind:'test'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/model-picker-mobile.png',fullPage:true});
});
test('selected image model keeps translation, unknown payment and dollar cents in the saved record',async({page})=>{
  const calls=await setup(page,{scanModel:MUSE});
  await page.locator('#scan-gallery-input').setInputFiles({name:'receipt.png',mimeType:'image/png',buffer:PNG});
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('Cafe Sakura（櫻花咖啡店）');
  const currency=page.getByLabel('幣種',{exact:true});if(await currency.count())await expect(currency).toHaveValue('USD');
  await expect(page.locator('select').filter({has:page.locator('option[value="credit"]')})).toHaveValue('');
  expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({provider:'openrouter',model:'meta/muse-spark-1.3-contributor',kind:'scan'});
  expect(calls[0].outputLanguage).toBe('yue-HK');
  expect(calls[0].prompt).toContain('香港繁體廣東話');
  await page.getByRole('button',{name:/儲存|保存/}).last().click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('boss-japan-tracker')).receipts.length)).toBe(1);
  const row=await page.evaluate(()=>JSON.parse(localStorage.getItem('boss-japan-tracker')).receipts[0]);
  expect(row.store).toContain('櫻花咖啡店');expect(row.payment).toBe('');expect(row.lineItems[0].amount).toBe(12.34);expect(row.itemsText).toContain('US$');
});
test('voice, email and itinerary use the exact selected nested ID',async({page})=>{
  const calls=await setup(page);
  for(const kind of ['voice','email','trip']){
    const state=kind==='voice'?{voiceModel:'opencode/space-bunny-free'}:kind==='email'?{emailModel:'openrouter/qwen/qwen3.7-flash'}:{tripUpdateModel:NEM};
    const r=await library(page,{kind,state});expect(r.error).toBeUndefined();
  }
  expect(calls.map(c=>[c.provider,c.model,c.kind])).toEqual([
    ['opencode','space-bunny-free','voice'],['openrouter','qwen/qwen3.7-flash','email'],['openrouter','nvidia/nemotron-3-super-120b-a12b:free','trip']
  ]);
  expect(calls[0].prompt).toContain('HANA8');expect(calls[1].prompt).toContain('HANA8');
});
test('automatic text policy tries exactly three free models then the paid guard',async({page})=>{
  const calls=await setup(page,{},(body,n)=>n<4?{status:502,error:'Invalid JSON'}:{data:[{store:'Paid guard',total:1,date:'2026-10-20'}]});
  const r=await library(page,{kind:'email',state:{emailModel:'auto'}});expect(r.error).toBeUndefined();
  expect(calls.map(c=>c.model)).toEqual(['nvidia/nemotron-3-super-120b-a12b:free','cohere/north-mini-code:free','apodex/apodex-1.1-mini:free','qwen/qwen3.7-flash']);
});
test('429 stops automatic policy; a selected failure never switches model or makes a local trip',async({page})=>{
  const calls=await setup(page,{},()=>({status:429,error:'Daily quota exceeded'}));
  expect((await library(page,{kind:'email',state:{emailModel:'auto'}})).error).toMatch(/quota/i);expect(calls).toHaveLength(1);
  expect((await library(page,{kind:'trip',state:{tripUpdateModel:NEM}})).error).toMatch(/quota/i);expect(calls).toHaveLength(2);
});
test('selected empty email or trip output is reported instead of heuristic substitution',async({page})=>{
  const calls=await setup(page,{},body=>({data:body.kind==='trip'?{}:[]}));
  expect((await library(page,{kind:'email',state:{emailModel:NEM}})).error).toMatch(/valid receipt|紀錄/);
  expect((await library(page,{kind:'trip',state:{tripUpdateModel:NEM}})).error).toMatch(/可用行程|itinerary/);
  expect(calls).toHaveLength(2);
});
test('Supabase authentication can use the selected model without a broker password session',async({page})=>{
  const calls=await setup(page);
  await page.evaluate(()=>{
    localStorage.removeItem('boss-japan-tracker:credential-session:v1');
    localStorage.setItem('travel-expense:supabase-auth:v1',JSON.stringify({access_token:'disposable-auth-token',expires_at:Math.floor(Date.now()/1000)+3600}));
  });
  let headers;
  page.on('request',request=>{if(new URL(request.url()).pathname==='/openrouter/json')headers=request.headers();});
  const r=await library(page,{kind:'email',state:{emailModel:NEM,credentialSession:'',credentialSessionExpiresAt:0}});
  expect(r.error).toBeUndefined();expect(calls).toHaveLength(1);
  expect(headers['x-supabase-auth']).toBe('Bearer disposable-auth-token');
  expect(headers['x-travel-session']).toBeUndefined();
});
test('failed selected photo extraction leaves a blank manual draft without guessing from its filename',async({page})=>{
  const calls=await setup(page,{scanModel:MUSE},()=>({status:502,error:'Provider unavailable'}));
  await page.locator('#scan-gallery-input').setInputFiles({name:'receipt_20261020_9999.png',mimeType:'image/png',buffer:PNG});
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('');
  await expect(page.getByLabel('金額',{exact:true})).toHaveValue('0');
  await expect(page.getByLabel('日期',{exact:true})).toHaveValue('');
  await expect(page.locator('select').filter({has:page.locator('option[value="credit"]')})).toHaveValue('');
  expect(calls).toHaveLength(1);expect(calls[0].model).toBe('meta/muse-spark-1.3-contributor');
});
