/**
 * Smoke test for Trip Update AI partial/full detection logic.
 * Run: node scripts/test-trip-update-intent.mjs
 */

const testCases = [
  {
    name: 'Full 8-day itinerary → full intent',
    existingDays: 8,
    pastedText: `
Day 1｜6月13日｜到步
06:30 濟州機場
09:00 早餐

Day 2｜6月14日｜西線
09:00 涯月
12:00 午餐

Day 3｜6月15日｜東線
09:00 日出峰
12:00 牛島

Day 4｜6月16日｜南線
09:00 西歸浦
12:00 午餐

Day 5｜6月17日｜北線
09:00 濟州市區
12:00 午餐

Day 6｜6月18日｜休閒
09:00 酒店早餐
12:00 購物

Day 7｜6月19日｜自由行
09:00 咖啡店
12:00 午餐

Day 8｜6月20日｜回程
09:00 機場
12:00 航班
`,
    expectedIntent: 'full',
  },
  {
    name: 'Partial 2-day update → partial intent',
    existingDays: 8,
    pastedText: `
Day 3｜6月15日｜東線新行程
08:00 日出峰看日出
10:00 牛島環島
14:00 城山浦港

Day 4｜6月16日｜南線新行程
09:00 中文旅遊區
12:00 黑豬肉街
15:00 天帝淵瀑布
`,
    expectedIntent: 'partial',
  },
  {
    name: 'Single day update → partial intent',
    existingDays: 8,
    pastedText: `
Day 5｜6月17日｜更新行程
09:00 濟州牧官衙
11:00 東門市場
14:00 龍頭岩
`,
    expectedIntent: 'partial',
  },
  {
    name: 'No dates in text → full intent (fallback)',
    existingDays: 8,
    pastedText: `
06:30 濟州機場
09:00 早餐
12:00 午餐
`,
    expectedIntent: 'full',
  },
];

function detectItineraryIntent(pastedText, existingDays) {
  const dayHeaderRegex = /(?:^|\n)\s*#{0,6}\s*Day\s*(\d+)\s*(?:[｜|\-–—]\s*)?(?:(20\d{2})[年\/.-]\s*)?(\d{1,2})\s*(?:月|\/|-)\s*(\d{1,2})\s*(?:日)?/gi;
  const matches = [...pastedText.matchAll(dayHeaderRegex)];
  const pastedDates = new Set(matches.map(m => `${m[3]}-${m[4]}`).filter(Boolean));

  if (!existingDays || !pastedDates.size) {
    return { intent: 'full', pastedDates: pastedDates.size };
  }

  const coverage = pastedDates.size / existingDays;
  if (coverage >= 0.8) {
    return { intent: 'full', pastedDates: pastedDates.size };
  }

  return { intent: 'partial', pastedDates: pastedDates.size };
}

console.log('=== Trip Update Intent Detection Smoke Test ===\n');

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = detectItineraryIntent(tc.pastedText, tc.existingDays);
  const ok = result.intent === tc.expectedIntent;
  if (ok) {
    passed++;
    console.log(`✅ PASS: ${tc.name}`);
    console.log(`   Intent: ${result.intent}, Pasted dates: ${result.pastedDates}`);
  } else {
    failed++;
    console.log(`❌ FAIL: ${tc.name}`);
    console.log(`   Expected: ${tc.expectedIntent}, Got: ${result.intent}`);
    console.log(`   Pasted dates: ${result.pastedDates}`);
  }
  console.log('');
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
