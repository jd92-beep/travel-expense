export type Category = 'transport' | 'food' | 'shopping' | 'lodging' | 'ticket' | 'medicine' | 'other';
export type Payment = 'cash' | 'credit' | 'paypay' | 'suica';

export interface Receipt {
  id: string;
  store: string;
  total: number;
  date: string;
  time?: string;
  category: Category;
  payment: Payment;
  region?: string;
  itemsText?: string;
  note?: string;
  personId?: string;
  notionPageId?: string;
  photoThumb?: string;
  address?: string;
  bookingRef?: string;
  createdAt: number;
}

export interface Person {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface AppState {
  receipts: Receipt[];
  budget: number;
  rate: number;
  apiKey: string;
  scanModel: string;
  notionToken: string;
  notionDb: string;
  proxy: string;
  autoSync: boolean;
  persons: Person[];
  shareRatios: Record<string, number>;
  tripName: string;
  tripDateRange: { start: string; end: string };
  statsIncludeTransportLodging: boolean;
}

export interface GeminiScanResult {
  store: string;
  total: number;
  date: string;
  time?: string;
  category: Category;
  payment: Payment;
  items?: string;
  tax?: number;
  note?: string;
  region?: string;
}

export type TabId = 'dashboard' | 'scan' | 'history' | 'stats' | 'settings';

export interface ItinerarySpot {
  time: string;
  name: string;
  type: string;
}

export interface ItineraryDay {
  day: number;
  date: string;
  region: string;
  highlight: string;
  spots: ItinerarySpot[];
}
