export interface GeoCoordinate {
  lat: number;
  lon: number;
  city: string;
  country?: string;
}

export const GEO_DICTIONARY: { pattern: RegExp; geo: GeoCoordinate }[] = [
  // ─── Japan: Nagoya / Chubu region ───
  { pattern: /中部國際|中部国際|centrair|chubu.*airport/i, geo: { city: 'Nagoya', country: 'Japan', lat: 34.8584, lon: 136.8124 } },
  { pattern: /榮町?|栄|sakae/i, geo: { city: 'Nagoya', country: 'Japan', lat: 35.1709, lon: 136.9089 } },
  { pattern: /大須|osu/i, geo: { city: 'Nagoya', country: 'Japan', lat: 35.1575, lon: 136.9033 } },
  { pattern: /熱田神宮|atsuta/i, geo: { city: 'Nagoya', country: 'Japan', lat: 35.1283, lon: 136.9087 } },
  { pattern: /名古屋城|nagoya castle/i, geo: { city: 'Nagoya', country: 'Japan', lat: 35.1856, lon: 136.8995 } },
  { pattern: /名古屋駅|名古屋站|nagoya station/i, geo: { city: 'Nagoya', country: 'Japan', lat: 35.1709, lon: 136.8816 } },
  { pattern: /東山動植物|東山zoo|higashiyama/i, geo: { city: 'Nagoya', country: 'Japan', lat: 35.1558, lon: 136.9756 } },
  { pattern: /白川鄉|白川郷|shirakawa-?go/i, geo: { city: 'Shirakawa', country: 'Japan', lat: 36.2583, lon: 136.9063 } },
  { pattern: /高山市|takayama/i, geo: { city: 'Takayama', country: 'Japan', lat: 36.1429, lon: 137.2538 } },
  { pattern: /立山黑部|立山黒部|tateyama/i, geo: { city: 'Toyama', country: 'Japan', lat: 36.5776, lon: 137.6064 } },
  { pattern: /上高地|kamikochi/i, geo: { city: 'Matsumoto', country: 'Japan', lat: 36.2497, lon: 137.6343 } },
  { pattern: /金沢|金澤|kanazawa/i, geo: { city: 'Kanazawa', country: 'Japan', lat: 36.5613, lon: 136.6562 } },
  { pattern: /常滑|tokoname/i, geo: { city: 'Tokoname', country: 'Japan', lat: 34.8871, lon: 136.8356 } },
  // ─── Hong Kong SAR ───
  { pattern: /香港機場|赤鱲角|hk.*airport|chek lap kok/i, geo: { city: 'Hong Kong', country: 'Hong Kong', lat: 22.3080, lon: 113.9185 } },
  { pattern: /太平山|victoria peak|山頂/i, geo: { city: 'Hong Kong', country: 'Hong Kong', lat: 22.2759, lon: 114.1455 } },
  { pattern: /尖沙咀|tsim sha tsui|tst/i, geo: { city: 'Hong Kong', country: 'Hong Kong', lat: 22.2988, lon: 114.1722 } },
  { pattern: /旺角|mong kok/i, geo: { city: 'Hong Kong', country: 'Hong Kong', lat: 22.3193, lon: 114.1694 } },
  { pattern: /銅鑼灣|causeway bay/i, geo: { city: 'Hong Kong', country: 'Hong Kong', lat: 22.2800, lon: 114.1840 } },
  { pattern: /中環|central/i, geo: { city: 'Hong Kong', country: 'Hong Kong', lat: 22.2816, lon: 114.1585 } },
  { pattern: /沙田|sha tin/i, geo: { city: 'Hong Kong', country: 'Hong Kong', lat: 22.3813, lon: 114.1880 } },
  { pattern: /大嶼山|lantau/i, geo: { city: 'Hong Kong', country: 'Hong Kong', lat: 22.2580, lon: 113.9425 } },
  { pattern: /西貢|sai kung/i, geo: { city: 'Hong Kong', country: 'Hong Kong', lat: 22.3813, lon: 114.2700 } },
  { pattern: /迪士尼|disneyland/i, geo: { city: 'Hong Kong', country: 'Hong Kong', lat: 22.3130, lon: 114.0413 } },
  { pattern: /海洋公園|ocean park/i, geo: { city: 'Hong Kong', country: 'Hong Kong', lat: 22.2394, lon: 114.1748 } },
  // ─── South Korea: Jeju ───
  { pattern: /濟州機場|제주공항|jeju.*airport/i, geo: { city: 'Jeju', country: 'South Korea', lat: 33.5113, lon: 126.4930 } },
  { pattern: /城山浦港|seongsan.*port/i, geo: { city: 'Seongsan', country: 'South Korea', lat: 33.4600, lon: 126.9300 } },
  { pattern: /fine jeju/i, geo: { city: 'Seogwipo', country: 'South Korea', lat: 33.2486, lon: 126.5683 } },
  { pattern: /stanford/i, geo: { city: 'Aewol', country: 'South Korea', lat: 33.4658, lon: 126.3722 } },
  { pattern: /東門市場|dongmun/i, geo: { city: 'Jeju', country: 'South Korea', lat: 33.5126, lon: 126.5284 } },
  { pattern: /七星路|chilseong/i, geo: { city: 'Jeju', country: 'South Korea', lat: 33.5170, lon: 126.5200 } },
  { pattern: /中央地下街/i, geo: { city: 'Jeju', country: 'South Korea', lat: 33.5150, lon: 126.5250 } },
  { pattern: /道頭洞|彩虹海岸|rainbow/i, geo: { city: 'Jeju', country: 'South Korea', lat: 33.5100, lon: 126.5200 } },
  { pattern: /蓮洞|nuwemaru/i, geo: { city: 'Jeju', country: 'South Korea', lat: 33.4900, lon: 126.4900 } },
  { pattern: /osulloc/i, geo: { city: 'Seogwipo', country: 'South Korea', lat: 33.3060, lon: 126.2895 } },
  { pattern: /camellia|山茶花/i, geo: { city: 'Seogwipo', country: 'South Korea', lat: 33.2800, lon: 126.3600 } },
  { pattern: /正房瀑布/i, geo: { city: 'Seogwipo', country: 'South Korea', lat: 33.2300, lon: 126.5600 } },
  { pattern: /天地淵/i, geo: { city: 'Seogwipo', country: 'South Korea', lat: 33.2500, lon: 126.5600 } },
  { pattern: /偶來市場/i, geo: { city: 'Seogwipo', country: 'South Korea', lat: 33.2500, lon: 126.5600 } },
  { pattern: /休愛里|sihori/i, geo: { city: 'Seogwipo', country: 'South Korea', lat: 33.2500, lon: 126.5600 } },
  { pattern: /牛沼端|suwol/i, geo: { city: 'Seogwipo', country: 'South Korea', lat: 33.2400, lon: 126.6200 } },
  { pattern: /日出峰|sunrise peak/i, geo: { city: 'Seongsan', country: 'South Korea', lat: 33.4586, lon: 126.9423 } },
  { pattern: /牛島|udo/i, geo: { city: 'Udo', country: 'South Korea', lat: 33.5066, lon: 126.9534 } },
  { pattern: /aqua planet/i, geo: { city: 'Seongsan', country: 'South Korea', lat: 33.4312, lon: 126.9278 } },
  { pattern: /涉地可支|seopjikoji/i, geo: { city: 'Seongsan', country: 'South Korea', lat: 33.4300, lon: 126.9300 } },
  { pattern: /9\.81/i, geo: { city: 'Jeju', country: 'South Korea', lat: 33.3768, lon: 126.3575 } },
  { pattern: /涯月|aewol/i, geo: { city: 'Aewol', country: 'South Korea', lat: 33.4658, lon: 126.3100 } },
  { pattern: /橘子|gyulkkot|darak/i, geo: { city: 'Seogwipo', country: 'South Korea', lat: 33.2600, lon: 126.5600 } },
  { pattern: /李春玉|鯖魚/i, geo: { city: 'Jeju', country: 'South Korea', lat: 33.4900, lon: 126.4900 } },
  { pattern: /umu/i, geo: { city: 'Jeju', country: 'South Korea', lat: 33.4800, lon: 126.4800 } },
  { pattern: /風爐|풍로/i, geo: { city: 'Seogwipo', country: 'South Korea', lat: 33.2500, lon: 126.5600 } },
  { pattern: /黑沙灘|black sand/i, geo: { city: 'Udo', country: 'South Korea', lat: 33.5066, lon: 126.9534 } },
  { pattern: /西濱白沙|seobin/i, geo: { city: 'Udo', country: 'South Korea', lat: 33.5100, lon: 126.9500 } },
  { pattern: /blanc rocher/i, geo: { city: 'Udo', country: 'South Korea', lat: 33.5080, lon: 126.9550 } },
  { pattern: /randy.*donut/i, geo: { city: 'Aewol', country: 'South Korea', lat: 33.4650, lon: 126.3200 } },
  { pattern: /blue elephant/i, geo: { city: 'Aewol', country: 'South Korea', lat: 33.4650, lon: 126.3150 } },
];

// Country scoping: the dictionary mixes trips (Japan/HK/Korea) and some Korea patterns are
// generic terms (中央地下街, 鯖魚, umu…) that also occur in Japanese spot names. An unscoped
// lookup once stamped Jeju-airport coords onto 中部國際機場 and the bad coords synced to every
// device. When we know the day's country, only that country's entries may match.
const COUNTRY_HINTS: { pattern: RegExp; country: string }[] = [
  { pattern: /japan|日本|jpn/i, country: 'Japan' },
  { pattern: /korea|韓國|韩国|kr\b/i, country: 'South Korea' },
  { pattern: /hong\s*kong|香港|hk\b/i, country: 'Hong Kong' },
];

const TZ_COUNTRY: Record<string, string> = {
  'Asia/Tokyo': 'Japan',
  'Asia/Seoul': 'South Korea',
  'Asia/Hong_Kong': 'Hong Kong',
};

export function countryHintFor(context: { country?: string; timezone?: string }): string | undefined {
  const country = String(context.country || '').trim();
  if (country) {
    const hit = COUNTRY_HINTS.find((h) => h.pattern.test(country));
    if (hit) return hit.country;
    return country;
  }
  return TZ_COUNTRY[String(context.timezone || '').trim()];
}

export function geoDistanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function resolveGeoCoordinate(name: string, countryHint?: string): GeoCoordinate | null {
  for (const entry of GEO_DICTIONARY) {
    if (countryHint && entry.geo.country && entry.geo.country !== countryHint) continue;
    if (entry.pattern.test(name)) return entry.geo;
  }
  return null;
}

export function resolveCategory(name: string): string {
  if (/機|flight|airport|航空|hkexpress|peach|ana|jal/i.test(name)) return 'flight';
  if (/酒店|hotel|住宿|inn|民宿|resort|check-in|check out/i.test(name)) return 'lodging';
  if (/食|餐|cafe|咖啡|飯|麵|居酒屋|串燒|肉|海鮮|pudding|tea|breakfast|lunch|dinner/i.test(name)) return 'food';
  if (/買|購|shop|market|百貨|outlet|donki|市場/i.test(name)) return 'shopping';
  if (/車|pass|地鐵|jr|bus|taxi|transport|租車|還車/i.test(name)) return 'transport';
  if (/博物館|美術館|museum|展|tour|觀光|peak|島|海|道|景/i.test(name)) return 'sightseeing';
  if (/藥|醫|clinic|pharmacy/i.test(name)) return 'medicine';
  if (/券|票|ticket/i.test(name)) return 'ticket';
  return 'other';
}
