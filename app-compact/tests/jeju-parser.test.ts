import { test, expect } from 'vitest';
import { extractLocalDaySpots } from '../src/lib/ai';

test('extractLocalDaySpots Jeju string', () => {
  const block = `
Day 1｜6月13日｜到步＋西線入住｜住 Hotel Fine Jeju

時間	地點 / 活動	建議停留

06:30	抵達濟州機場	—
08:30	機場租車完成	—
09:00	先食簡單早餐 / 咖啡，Natalie 肚餓就唔好硬頂	30–45分鐘
09:45	道頭洞彩虹海岸道路＋石頭爺爺麥當勞	30–45分鐘
11:15	午餐：李春玉元祖鯖魚包飯	60–75分鐘
12:45	umu pudding	20–30分鐘
14:00	Osulloc Tea Museum	75–90分鐘
15:45	開車去 Hotel Fine Jeju	約60–75分鐘車程
17:15	Hotel Fine Jeju check-in / 休息	60–90分鐘
19:00	晚餐：Chilsimni-ro 或酒店附近	60–90分鐘
`;
  // Needs export for extractLocalDaySpots. Let's assume we test it via normalizeTripDraft or export it.
  const spots = extractLocalDaySpots(block);
  expect(spots.length).toBe(10);
  expect(spots[0].time).toBe('06:30');
  expect(spots[0].name).toBe('抵達濟州機場');
});
