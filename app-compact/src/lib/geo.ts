export interface GeoCoordinate {
  lat: number;
  lon: number;
  city: string;
}

export const GEO_DICTIONARY: { pattern: RegExp; geo: GeoCoordinate }[] = [
  { pattern: /機場|airport/i, geo: { city: 'Jeju', lat: 33.5113, lon: 126.4930 } },
  { pattern: /fine jeju/i, geo: { city: 'Seogwipo', lat: 33.2486, lon: 126.5683 } },
  { pattern: /stanford/i, geo: { city: 'Aewol', lat: 33.4658, lon: 126.3722 } },
  { pattern: /osulloc/i, geo: { city: 'Seogwipo', lat: 33.3060, lon: 126.2895 } },
  { pattern: /日出峰|sunrise peak/i, geo: { city: 'Seongsan', lat: 33.4586, lon: 126.9423 } },
  { pattern: /牛島|udo/i, geo: { city: 'Udo', lat: 33.5066, lon: 126.9534 } },
  { pattern: /aqua planet/i, geo: { city: 'Seongsan', lat: 33.4312, lon: 126.9278 } },
  { pattern: /9\.81/i, geo: { city: 'Jeju', lat: 33.3768, lon: 126.3575 } },
  { pattern: /東門市場|dongmun/i, geo: { city: 'Jeju', lat: 33.5126, lon: 126.5284 } },
];

export function resolveGeoCoordinate(name: string): GeoCoordinate | null {
  for (const entry of GEO_DICTIONARY) {
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
