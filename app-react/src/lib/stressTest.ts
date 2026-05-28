import type { Receipt, CategoryId, PaymentId } from './types';

// Mock words for store generation
const STORES = [
  '蓬萊軒鰻魚飯 (Atsuta Houraiken)',
  '矢場豬排 (Yabaton)',
  '世界之山將手羽先 (Sekai no Yamachan)',
  '名古屋城 (Nagoya Castle Entry)',
  'CX530 航班 (Cathay Pacific Flight)',
  '名古屋 Marriott 酒店 (Marriott Associa)',
  '中部國際機場伴手禮 (Centrair Airport Shop)',
  'JR 東海道新幹線 (Shinkansen to Kyoto)',
  'Lawson 榮一丁目店 (Lawson Convenience)',
  'FamilyMart 錦三丁目 (FamilyMart)',
  '7-Eleven 名古屋站前 (7-Eleven)',
  '大須觀音商店街 (Osu Kannon Market)',
  '綠洲 21 購物中心 (Oasis 21)',
  '名古屋港水族館 (Nagoya Port Aquarium)',
  '中部電力 MIRAI TOWER (TV Tower)',
  'Bic Camera 名古屋站西店 (Bic Camera)',
  '吉野家 榮店 (Yoshinoya)',
  '一蘭拉麵 名古屋榮店 (Ichiran Ramen)',
  '星巴克 名古屋 JR 門前 (Starbucks)',
  '熱田神宮御守 (Atsuta Shrine)',
];

const CATEGORIES: CategoryId[] = [
  'food', 'food', 'food', // Food more frequent
  'shopping', 'shopping',
  'transport', 'transport',
  'lodging',
  'ticket',
  'localtour',
  'other'
];

const PAYMENTS: PaymentId[] = ['cash', 'credit', 'paypay', 'suica'];

function ymdInTokyo(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Generate highly realistic Nagoya travel receipts for stress testing
 */
export function generateMockReceipts(count: number): Receipt[] {
  const receipts: Receipt[] = [];
  const now = Date.now();
  
  // Trip date range: 2026-05-10 to 2026-05-20
  const startTimestamp = new Date('2026-05-10T00:00:00Z').getTime();
  const endTimestamp = new Date('2026-05-20T23:59:59Z').getTime();
  const timeSpan = endTimestamp - startTimestamp;

  for (let i = 0; i < count; i++) {
    const id = `mock_${now}_${Math.random().toString(36).substring(2, 11)}`;
    const store = STORES[Math.floor(Math.random() * STORES.length)];
    
    // Weighted amounts: mostly standard purchases, occasional high hotel/flight ticket
    let total = Math.floor(Math.random() * 8000) + 200; // 200 - 8200 JPY
    if (Math.random() < 0.05) {
      total = Math.floor(Math.random() * 80000) + 15000; // 15000 - 95000 JPY (Hotel / Big purchases)
    } else if (Math.random() < 0.02) {
      total = Math.floor(Math.random() * 250000) + 100000; // 100k - 350k JPY (Flights / Luxury hotel stay)
    }

    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const payment = PAYMENTS[Math.floor(Math.random() * PAYMENTS.length)];
    
    // Date distributed during the trip duration
    const dateTimestamp = startTimestamp + Math.floor(Math.random() * timeSpan);
    const dateObj = new Date(dateTimestamp);
    const dateStr = ymdInTokyo(dateObj);
    const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;

    const exchangeRate = 0.051; // ~0.051 HKD per JPY
    const hkdAmount = Math.round(total * exchangeRate * 100) / 100;

    receipts.push({
      id,
      store,
      total,
      currency: 'JPY',
      originalAmount: total,
      originalCurrency: 'JPY',
      hkdAmount,
      exchangeRate,
      rateSource: 'mock_stress_test',
      date: dateStr,
      time: timeStr,
      category,
      payment,
      region: '名古屋 (Nagoya)',
      note: `壓力測試模擬數據 (Index #${i + 1})`,
      splitMode: Math.random() > 0.4 ? 'shared' : 'private',
      createdAt: dateTimestamp,
      updatedAt: dateTimestamp,
      syncStatus: 'local',
      source: 'mock_stress_test',
      sourceId: id,
    });
  }

  // Sort receipts by date and time descending
  return receipts.sort((a, b) => {
    const timeA = new Date(`${a.date}T${a.time || '00:00'}:00Z`).getTime();
    const timeB = new Date(`${b.date}T${b.time || '00:00'}:00Z`).getTime();
    return timeB - timeA;
  });
}

// Global fetch hijacking setup
if (typeof window !== 'undefined' && !(window as any).__stressFetchHijacked) {
  (window as any).__stressFetchHijacked = true;
  const originalFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    let url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else if (input && (input as any).url) {
      url = (input as any).url;
    }

    const isNotionRequest =
      url.includes('notion') ||
      url.includes('credential-broker') ||
      url.includes('rare-duck-29.jd92-beep.deno.net');

    if (isNotionRequest) {
      // 1. Simulate Latency (5s delay)
      const latencyEnabled = localStorage.getItem('__stress_latency') === 'true';
      if (latencyEnabled) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      // 2. Simulate Sync Faults (500 Server Error)
      const faultEnabled = localStorage.getItem('__stress_fault') === 'true';
      if (faultEnabled) {
        return new Response(
          JSON.stringify({
            message: '壓力測試：模擬 Notion 同步伺服器故障 (500 Error)',
            code: 'stress_test_error',
          }),
          {
            status: 500,
            statusText: 'Internal Server Error',
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return originalFetch.apply(this, [input, init]);
  };
}

/**
 * Automates rapid tab switching to verify no components leak resources or crash the GPU context.
 */
export function simulateTabSwitching(changeTab: (tabId: any) => void, onComplete?: () => void) {
  const tabs: any[] = ['dashboard', 'scan', 'history', 'stats', 'timeline', 'weather', 'settings'];
  let count = 0;
  const maxSwitch = 20;

  const interval = setInterval(() => {
    if (count >= maxSwitch) {
      clearInterval(interval);
      changeTab('settings');
      if (onComplete) onComplete();
      return;
    }
    const currentTab = tabs[count % tabs.length];
    changeTab(currentTab);
    count++;
  }, 120);
}
