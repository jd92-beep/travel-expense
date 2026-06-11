// Self-contained test for local trip parser functions.
// We copy the pure functions here because import.meta.env (Vite) is not available in Node.js.

function cleanLocalSpotName(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\s*([^*]+?)\s*\*/g, '$1')
    .replace(/^\s*(?:地點\s*\/\s*活動|建議停留|時間|類別)\s*$/i, '')
    .replace(/\s*[—-]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function classifyTripSpot(name) {
  if (/機場|airport|航班|起飛|抵達|還車|租車|check-?in|check out|退房|出發|回到|開車|搭船|船票|港/i.test(name)) return 'transport';
  if (/hotel|resort|酒店|住宿|stanford|fine jeju/i.test(name)) return 'lodging';
  if (/午餐|晚餐|早餐|cafe|coffee|donut|donuts|restaurant|市場|黑豬|麵|飯|豬腳|炸雞|甜點|pudding|starbucks|bakery|baguette|flowave|waboda|chita|安頓|風爐/i.test(name)) return 'food';
  if (/mart|shopping|購物|免稅|手信|街|地下街|小店|emart|lotte|新羅|七星路|nuwemaru|blue elephant|the islander|moodjeju|randy/i.test(name)) return 'shopping';
  if (/park|museum|planet|瀑布|山|峰|牛島|海岸|沙灘|公園|水族館|aqua|camellia|osulloc|9\.81|日出峰|自然|市場/i.test(name)) return 'sightseeing';
  return 'other';
}

function normalizeTripTime(hour, minute, meridiem = '') {
  let h = Number(hour);
  const suffix = meridiem.toLowerCase();
  if (suffix === 'pm' && h < 12) h += 12;
  if (suffix === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

function localSpotFromParts(time, name, sourceText, category = '') {
  const cleanName = cleanLocalSpotName(name);
  if (!cleanName || /^[:：-]+$/.test(cleanName) || /^(時間|類別|地點名稱|建議停留)$/i.test(cleanName)) return null;
  const classifierText = `${category} ${cleanName}`;
  return {
    time,
    name: cleanName,
    type: classifyTripSpot(classifierText),
    timezone: 'Asia/Seoul',
    note: category ? cleanLocalSpotName(category) : cleanName,
    sourceText: sourceText.trim(),
    confidence: 'medium',
  };
}

function computeTimeEnd(time, durationMinutes) {
  if (!durationMinutes || !time) return '';
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const totalMin = h * 60 + m + durationMinutes;
  const endH = Math.floor(((totalMin % 1440) + 1440) % 1440 / 60);
  const endM = ((totalMin % 60) + 60) % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

function parseDuration(raw, time = '') {
  const clean = String(raw || '').replace(/[—–\-]/g, '–').trim();
  if (!clean || clean === '–' || clean === '-') return { minutes: 0, end: '', note: '' };
  const range = clean.match(/(?:約)?(\d+)\s*–\s*(\d+)\s*分鐘(?:車程|步程|停留)?/);
  if (range) {
    const avg = Math.round((Number(range[1]) + Number(range[2])) / 2);
    return { minutes: avg, end: computeTimeEnd(time, avg), note: `${range[1]}–${range[2]}分鐘` };
  }
  const single = clean.match(/(\d+)\s*分鐘/);
  if (single) {
    const mins = Number(single[1]);
    return { minutes: mins, end: computeTimeEnd(time, mins), note: `${single[1]}分鐘` };
  }
  return { minutes: 0, end: '', note: clean !== '–' ? clean : '' };
}

function extractLocalDaySpots(block) {
  const spots = [];
  const seen = new Set();
  const add = (spot) => {
    if (!spot) return;
    const key = `${spot.time}|${spot.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    spots.push(spot);
  };

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line || /^[-|:\s]+$/.test(line)) continue;
    if (/^\|/.test(line)) {
      const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean);
      if (cells.length >= 2 && !cells.some((cell) => /^:?-{3,}:?$/.test(cell))) {
        const timeMatch = cells[0].match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
        if (timeMatch) add(localSpotFromParts(`${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`, cells.slice(2).join(' / ') || cells[1], rawLine, cells[1]));
      }
      continue;
    }
    
    const tabs = line.split(/\t| {3,}/).map(c => c.trim()).filter(Boolean);
    if (tabs.length >= 2 && !line.includes('｜') && !line.includes('|')) {
      const timeMatch = tabs[0].match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
      if (timeMatch) {
        const time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
        const name = tabs[1];
        const duration = parseDuration(tabs[2] || '', time);
        const spot = localSpotFromParts(time, name, rawLine);
        if (spot) {
          if (duration.end) spot.timeEnd = duration.end;
          if (duration.note) spot.note = spot.note ? `${spot.note} (${duration.note})` : duration.note;
          add(spot);
        }
        continue;
      }
    }

    const plain = line.match(/^\s*(?:[-*]\s*)?([01]?\d|2[0-3]):([0-5]\d)\s*(AM|PM)?\s*[:：\-–—]?\s*(.+?)\s*$/i);
    if (plain) {
      add(localSpotFromParts(normalizeTripTime(plain[1], plain[2], plain[3]), plain[4], rawLine));
    }
  }
  return spots;
}

// ===== TESTS =====

const SAMPLE_ITINERARY = `Day 1｜6月13日｜到步＋西線入住｜住 Hotel Fine Jeju

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

建議：Day 1 唔好加正房瀑布。紅眼機到埗，容易攰，Osulloc 之後直接返酒店比較舒服。


Day 2｜6月14日｜南部花景＋西歸浦｜住 Hotel Fine Jeju

時間	地點 / 活動	建議停留

09:15	Cafe Gyulkkot Darak 橘子咖啡廳	45–60分鐘
10:30	Camellia Hill 山茶花之丘	75–90分鐘
12:30	午餐：風爐 풍로 西歸浦黑豬肉	75–90分鐘
14:15	Starbucks 濟州限定打卡	30–45分鐘
15:15	休愛里自然公園	75–90分鐘
17:00	正房瀑布 optional	30–45分鐘
18:15	偶來市場晚餐／甜點	90分鐘
20:00	回 Hotel Fine Jeju	—

建議：正房瀑布要睇時間。因為正房瀑布一般 17:20 左右關，如果 16:45 前未去到，就直接 skip，唔好趕。`;

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

console.log('\n=== extractLocalDaySpots — Tab-separated format ===\n');

const day1Block = SAMPLE_ITINERARY.split('Day 2')[0];
const spots = extractLocalDaySpots(day1Block);

assert(spots.length === 10, `Day 1 has 10 spots (got ${spots.length})`);

const airport = spots.find(s => s.name.includes('抵達濟州機場'));
assert(!!airport, 'Found airport spot');
assert(airport?.time === '06:30', `Airport time is 06:30 (got ${airport?.time})`);

const breakfast = spots.find(s => s.name.includes('先食簡單早餐'));
assert(!!breakfast, 'Found breakfast spot');
assert(breakfast?.time === '09:00', `Breakfast time is 09:00 (got ${breakfast?.time})`);
assert(breakfast?.timeEnd === '09:38', `Breakfast timeEnd is 09:38 (avg 37min, got ${breakfast?.timeEnd})`);
assert(breakfast?.note?.includes('30–45分鐘'), `Breakfast note includes duration (got ${breakfast?.note})`);

const lunch = spots.find(s => s.name.includes('李春玉'));
assert(!!lunch, 'Found lunch spot');
assert(lunch?.time === '11:15', `Lunch time is 11:15 (got ${lunch?.time})`);
assert(lunch?.timeEnd === '12:23', `Lunch timeEnd is 12:23 (avg 67min, got ${lunch?.timeEnd})`);

const osulloc = spots.find(s => s.name.includes('Osulloc'));
assert(!!osulloc, 'Found Osulloc spot');
assert(osulloc?.time === '14:00', `Osulloc time is 14:00 (got ${osulloc?.time})`);
assert(osulloc?.timeEnd === '15:23', `Osulloc timeEnd is 15:23 (avg 82min, got ${osulloc?.timeEnd})`);

const drive = spots.find(s => s.name.includes('開車去 Hotel Fine'));
assert(!!drive, 'Found drive spot');
assert(drive?.time === '15:45', `Drive time is 15:45 (got ${drive?.time})`);
assert(drive?.timeEnd === '16:53', `Drive timeEnd is 16:53 (avg 67min, got ${drive?.timeEnd})`);
assert(drive?.note?.includes('60–75分鐘'), `Drive note includes duration (got ${drive?.note})`);

const dinner = spots.find(s => s.name.includes('晚餐'));
assert(!!dinner, 'Found dinner spot');
assert(dinner?.time === '19:00', `Dinner time is 19:00 (got ${dinner?.time})`);
assert(dinner?.timeEnd === '20:15', `Dinner timeEnd is 20:15 (avg 75min, got ${dinner?.timeEnd})`);

console.log('\n=== Header row filtering ===\n');

const headerRow = spots.find(s => s.name.includes('地點') || s.name.includes('建議停留'));
assert(!headerRow, 'Header row (地點/建議停留) is filtered out');

console.log('\n=== Day 2 spots ===\n');

const day2Block = SAMPLE_ITINERARY.split('Day 2')[1];
const day2Spots = extractLocalDaySpots(day2Block);

assert(day2Spots.length === 8, `Day 2 has 8 spots (got ${day2Spots.length})`);

const cafe = day2Spots.find(s => s.name.includes('Gyulkkot') || s.name.includes('橘子'));
assert(!!cafe, 'Found cafe spot');
assert(cafe?.time === '09:15', `Cafe time is 09:15 (got ${cafe?.time})`);
assert(cafe?.timeEnd === '10:08', `Cafe timeEnd is 10:08 (avg 52min, got ${cafe?.timeEnd})`);

const camellia = day2Spots.find(s => s.name.includes('Camellia'));
assert(!!camellia, 'Found Camellia Hill spot');
assert(camellia?.time === '10:30', `Camellia time is 10:30 (got ${camellia?.time})`);
assert(camellia?.timeEnd === '11:53', `Camellia timeEnd is 11:53 (avg 82min, got ${camellia?.timeEnd})`);

console.log('\n=== Pipe table format (regression) ===\n');

const pipeBlock = `09:00 | 交通 | 機場巴士
12:00 | 午餐 | 黑豬肉一條街
14:00 | 景點 | 濟州民俗村`;
const pipeSpots = extractLocalDaySpots(pipeBlock);
assert(pipeSpots.length === 3, `Pipe table has 3 spots (got ${pipeSpots.length})`);
assert(pipeSpots[0].name.includes('機場巴士'), 'Pipe spot 1 name correct');
assert(pipeSpots[1].name.includes('黑豬肉'), 'Pipe spot 2 name correct');

console.log('\n=== Plain text format (regression) ===\n');

const plainBlock = `09:00 機場巴士
14:30 PM 濟州民俗村
- 18:00: 烤肉晚餐`;
const plainSpots = extractLocalDaySpots(plainBlock);
assert(plainSpots.length === 3, `Plain text has 3 spots (got ${plainSpots.length})`);
assert(plainSpots[0].time === '09:00', 'Plain spot 1 time correct');
assert(plainSpots[1].time === '14:30', 'Plain spot 2 time (PM) correct');
assert(plainSpots[2].time === '18:00', 'Plain spot 3 time correct');

console.log('\n=== Bullet list with AM/PM and full-width colon ===\n');

const bulletBlock = `  * 06:30 AM：抵達濟州機場及辦理入境
  * 08:30 AM：機場取車
  * 09:30 AM：道頭洞彩虹海岸道路、麥當勞打卡石頭爺爺 (打卡拍照)
  * 11:30 AM：李春玉元祖鯖魚包飯 (午餐：燉泡菜鯖魚)
  * 01:30 PM：umu pudding (買布丁)
  * 03:00 PM：Osulloc Tea Museum (綠茶博物館)`;
const bulletSpots = extractLocalDaySpots(bulletBlock);
assert(bulletSpots.length === 6, `Bullet list has 6 spots (got ${bulletSpots.length})`);
assert(bulletSpots[0].time === '06:30', `Bullet spot 1 time is 06:30 (got ${bulletSpots[0].time})`);
assert(bulletSpots[0].name.includes('抵達濟州機場'), `Bullet spot 1 name correct (got ${bulletSpots[0].name})`);
assert(bulletSpots[1].time === '08:30', `Bullet spot 2 time is 08:30 (got ${bulletSpots[1].time})`);
assert(bulletSpots[3].time === '11:30', `Bullet spot 4 time is 11:30 (got ${bulletSpots[3].time})`);
assert(bulletSpots[4].time === '13:30', `Bullet spot 5 time is 13:30 PM (got ${bulletSpots[4].time})`);
assert(bulletSpots[5].time === '15:00', `Bullet spot 6 time is 15:00 PM (got ${bulletSpots[5].time})`);

console.log('\n=== Pipe table with category column ===\n');

const pipeCatBlock = `| 06:30 | 航班降落 | 濟州國際機場 |
| 08:30 | 地點 / 交通 | 機場取車完成 |
| 09:00 | 餐廳 | 簡單早餐 / 咖啡（肚餓記住先食野） |
| 11:15 | 餐廳 | 李春玉元祖鯖魚包飯（午餐） |`;
const pipeCatSpots = extractLocalDaySpots(pipeCatBlock);
assert(pipeCatSpots.length === 4, `Pipe table with category has 4 spots (got ${pipeCatSpots.length})`);
assert(pipeCatSpots[0].time === '06:30', `Pipe cat spot 1 time correct`);
assert(pipeCatSpots[0].name.includes('濟州國際機場'), `Pipe cat spot 1 name correct`);
assert(pipeCatSpots[1].name.includes('機場取車完成'), `Pipe cat spot 2 name correct`);

console.log('\n=== Full-width colon separator without space ===\n');

const colonBlock = `09:00：簡單早餐
11:30：午餐
15:00：景點`;
const colonSpots = extractLocalDaySpots(colonBlock);
assert(colonSpots.length === 3, `Full-width colon has 3 spots (got ${colonSpots.length})`);
assert(colonSpots[0].time === '09:00', `Colon spot 1 time correct`);
assert(colonSpots[0].name === '簡單早餐', `Colon spot 1 name correct`);

console.log('\n=== computeTimeEnd edge cases ===\n');

assert(computeTimeEnd('09:00', 30) === '09:30', '09:00 + 30min = 09:30');
assert(computeTimeEnd('09:00', 45) === '09:45', '09:00 + 45min = 09:45');
assert(computeTimeEnd('11:15', 75) === '12:30', '11:15 + 75min = 12:30');
assert(computeTimeEnd('23:30', 45) === '00:15', '23:30 + 45min = 00:15 (midnight wrap)');
assert(computeTimeEnd('', 30) === '', 'Empty time returns empty');
assert(computeTimeEnd('09:00', 0) === '', 'Zero duration returns empty');

console.log('\n=== parseDuration edge cases ===\n');

assert(parseDuration('30–45分鐘').note === '30–45分鐘', 'Range duration note');
assert(parseDuration('30–45分鐘', '09:00').end === '09:38', 'Range duration timeEnd uses average (37min)');
assert(parseDuration('約60–75分鐘車程').note === '60–75分鐘', 'Approximate range with 車程');
assert(parseDuration('90分鐘').note === '90分鐘', 'Single duration note');
assert(parseDuration('90分鐘', '14:00').end === '15:30', 'Single duration timeEnd');
assert(parseDuration('—').note === '', 'Em-dash returns empty');
assert(parseDuration('').note === '', 'Empty returns empty');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
