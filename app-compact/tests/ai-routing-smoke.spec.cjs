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
      if (action.kind==='trip') return {result:await ai[action.newTrip ? 'parseNewTripParagraph' : 'parseTripParagraph'](action.paragraph || '2026-10-20 首爾 09:30 景福宮',state)};
      return {result:await ai.parseTextWithAi('日本酒店 HANA8，2026-10-20 入住，JPY24000，2晚',state,action.kind==='voice'?'react-voice':'react-email')};
    } catch(e) { return {error:e.message}; }
  },action);
}
const oldTrip = {
  id:'old-seoul-trip',supabaseId:'old-cloud-trip',sourceId:'old-source',
  name:'OLD_PRIVATE_TRIP',destinationSummary:'Seoul',startDate:'2026-10-20',endDate:'2026-10-21',
  budget:98765,homeCurrency:'HKD',currencies:['HKD','NZD'],timezones:['Asia/Seoul'],
  version:7,active:true,createdAt:1,updatedAt:1,
  notionPageId:'old-notion-page',sharing:{isShared:true,role:'owner',memberCount:2},
  itinerary:[
    {date:'2026-10-20',day:1,region:'Seoul',timezone:'Asia/Seoul',currency:'KRW',lodging:{name:'OLD_HOTEL'},spots:[{time:'08:00',name:'OLD_BREAKFAST',type:'food'}]},
    {date:'2026-10-21',day:2,region:'Seoul',timezone:'Asia/Seoul',currency:'KRW',spots:[{time:'10:00',name:'OLD_SECOND_DAY',type:'other'}]},
  ],
};
const oldTripState = {
  trips:[oldTrip],activeTripId:oldTrip.id,tripName:oldTrip.name,
  tripDateRange:{start:oldTrip.startDate,end:oldTrip.endDate},
  tripCurrency:'NZD',budget:oldTrip.budget,customItinerary:oldTrip.itinerary,
};
const newSeoulTrip = {
  name:'New Seoul',destinationSummary:'Seoul',startDate:'2026-10-20',endDate:'2026-10-21',
  itinerary:[{date:'2026-10-20',day:1,region:'Seoul',city:'Seoul',country:'South Korea',timezone:'Asia/Seoul',currency:'KRW',spots:[{time:'19:00',timeEnd:'21:00',name:'NEW_SHOW',type:'ticket'}]}],
};

test('new-trip parsing excludes old context and metadata even for matching dates and destination',async({page})=>{
  const calls=await setup(page,{},()=>({data:{trip:newSeoulTrip}}));
  const state={...oldTripState,tripUpdateModel:NEM};
  const first=await library(page,{kind:'trip',newTrip:true,state});
  const second=await library(page,{kind:'trip',newTrip:true,state});
  expect(first.error).toBeUndefined();expect(second.error).toBeUndefined();
  const trip=first.result.trip;
  expect(trip.id).not.toBe(oldTrip.id);expect(trip.id).not.toBe(second.result.trip.id);
  expect(trip.version).toBe(1);expect(trip.budget).toBe(0);
  for(const key of ['supabaseId','notionPageId','sharing'])expect(trip[key]).toBeUndefined();
  expect(trip.sourceId).toBe(`trip_${trip.id}`);expect(trip.createdAt).toBeGreaterThan(1);
  expect(trip.currencies).not.toContain('NZD');
  expect(trip.itinerary).toHaveLength(1);
  expect(trip.itinerary[0].spots.map(s=>s.name)).toEqual(['NEW_SHOW']);
  expect(trip.itinerary[0].lodging).toBeUndefined();
  expect(trip.itinerary[0].dayId).not.toBe(second.result.trip.itinerary[0].dayId);
  expect(trip.itinerary[0].spots[0].spotId).not.toBe(second.result.trip.itinerary[0].spots[0].spotId);
  for(const call of calls){
    expect(call.prompt).toContain('FULL REPLACEMENT');
    for(const old of ['OLD_PRIVATE_TRIP','OLD_HOTEL','OLD_BREAKFAST','OLD_SECOND_DAY',oldTrip.id])expect(call.prompt).not.toContain(old);
  }
});

test('Settings parser still merges partial updates and retains the existing trip identity',async({page})=>{
  const calls=await setup(page,{},()=>({data:{trip:newSeoulTrip}}));
  const r=await library(page,{kind:'trip',state:{...oldTripState,tripUpdateModel:NEM}});
  expect(r.error).toBeUndefined();
  expect(calls[0].prompt).toContain('PARTIAL UPDATE');
  expect(calls[0].prompt).toContain('OLD_SECOND_DAY');
  const trip=r.result.trip;
  expect(trip.id).toBe(oldTrip.id);expect(trip.supabaseId).toBe(oldTrip.supabaseId);
  expect(trip.budget).toBe(oldTrip.budget);expect(trip.itinerary).toHaveLength(2);
  expect(trip.itinerary[0].spots.map(s=>s.name)).toEqual(expect.arrayContaining(['NEW_SHOW','OLD_BREAKFAST']));
  expect(trip.itinerary[1].spots[0].name).toBe('OLD_SECOND_DAY');
});

test('new-trip local and total-failure fallbacks cannot recover old itinerary or year',async({page})=>{
  await setup(page,{},()=>({status:502,error:'Provider unavailable'}));
  const state={...oldTripState,tripUpdateModel:'auto',trips:[{...oldTrip,startDate:'2033-10-20'}]};
  const local=await library(page,{kind:'trip',newTrip:true,state,paragraph:'Day 1 7月10日 首爾\n09:30 景福宮'});
  expect(local.error).toBeUndefined();
  expect(local.result.trip.itinerary).toHaveLength(1);
  expect(local.result.trip.itinerary[0].date).toBe(`${new Date().getFullYear()}-07-10`);
  expect(JSON.stringify(local.result)).not.toContain('OLD_');
  expect(local.result.trip.budget).toBe(0);
  const failed=await library(page,{kind:'trip',newTrip:true,state,paragraph:'not an itinerary'});
  expect(failed.error).toBeUndefined();
  expect(failed.result.trip.itinerary).toEqual([]);
  expect(JSON.stringify(failed.result)).not.toContain('OLD_');
});

test('Welcome Guide creates an independent trip from AI while preserving the old saved trip',async({page})=>{
  const calls=await setup(page,{...oldTripState,lastTab:'settings',tripUpdateModel:NEM},()=>({data:{trip:newSeoulTrip}}));
  await page.getByRole('button',{name:'重新開啟歡迎指南'}).click();
  const guide=page.locator('.welcome-guide-modal');
  await guide.locator('textarea').fill('Day 1 2026-10-20 Seoul\n19:00-21:00 NEW_SHOW');
  await guide.getByRole('button',{name:/開始 AI 智能解析/}).click();
  await expect(guide).toContainText('New Seoul');
  await expect(guide).not.toContainText('OLD_SECOND_DAY');
  await guide.getByRole('button',{name:'確認建立新旅程',exact:true}).click();
  await expect(guide).toHaveCount(0);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('boss-japan-tracker')));
  const fresh=stored.trips.find(t=>t.id===stored.activeTripId);
  expect(fresh.id).not.toBe(oldTrip.id);expect(fresh.itinerary).toHaveLength(1);
  expect(fresh.itinerary[0].spots.map(s=>s.name)).toEqual(['NEW_SHOW']);
  expect(stored.trips.find(t=>t.id===oldTrip.id).itinerary).toMatchObject(oldTrip.itinerary);
  expect(calls[0].prompt).not.toContain('OLD_PRIVATE_TRIP');
});

test('Welcome Guide does not offer the old trip as a successful analysis after providers fail',async({page})=>{
  await setup(page,{...oldTripState,lastTab:'settings',tripUpdateModel:'auto'},()=>({status:502,error:'Provider unavailable'}));
  await page.getByRole('button',{name:'重新開啟歡迎指南'}).click();
  const guide=page.locator('.welcome-guide-modal');
  await guide.locator('textarea').fill('not an itinerary');
  await guide.getByRole('button',{name:/開始 AI 智能解析/}).click();
  await expect(guide).toContainText('Provider unavailable');
  await expect(guide.locator('textarea')).toHaveValue('not an itinerary');
  await expect(guide.getByRole('button',{name:'確認建立新旅程',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('boss-japan-tracker')).activeTripId)).toBe(oldTrip.id);
});
test('provider groups start collapsed, filter image capability and persist a real selection',async({page})=>{
  const calls=await setup(page,{lastTab:'settings'});
  const section=page.locator('.accordion-card').filter({has:page.getByRole('button',{name:/AI 模型選擇/})});
  await section.getByRole('button',{name:/AI 模型選擇/}).click();
  const picker=section.locator('.ai-model-field').first();
  const category=picker.locator('.ai-model-category');
  await expect(category).toHaveAttribute('aria-expanded','false');
  await expect(category).toContainText('掃描 receipt 模型');
  await expect(category).toContainText('Muse Spark');
  await expect(picker.locator('.ai-model-current > span')).toHaveCSS('white-space', 'normal');
  await category.click();
  const providerButton=(name)=>picker.locator('.ai-provider-toggle').filter({hasText:name});
  for(const provider of ['Google','OpenRouter','OpenCode Zen']) await expect(providerButton(provider)).toHaveAttribute('aria-expanded','false');
  await providerButton('OpenRouter').click();
  await expect(picker.getByRole('radio',{name:/Nemotron 3 Super/i})).toHaveCount(0);
  await expect(picker.getByRole('radio',{name:/Muse Spark/})).toBeVisible();
  const model=picker.getByRole('radio',{name:/MiMo-V2.6-Flash/i});await model.check();
  await expect(model).toBeChecked();
  await expect(category).toContainText('MiMo-V2.6-Flash');
  await expect(providerButton('OpenRouter')).toContainText('已選');
  await providerButton('OpenRouter').click();
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
