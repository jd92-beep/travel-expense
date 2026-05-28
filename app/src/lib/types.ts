export type Category =
  | 'transport'
  | 'food'
  | 'shopping'
  | 'lodging'
  | 'ticket'
  | 'localtour'
  | 'medicine'
  | 'other';

export type Payment = 'cash' | 'credit' | 'paypay' | 'suica';

export interface ReceiptItem {
  name: string;
  name_jp?: string;
  price?: number;
}

export interface Receipt {
  id: string;
  store: string;
  total: number;
  subtotal?: number | null;
  tax?: number | null;
  hkd?: number | null;
  date: string;
  time?: string;
  category: Category;
  payment: Payment;
  region?: string;
  itemsText?: string;
  items?: ReceiptItem[];
  note?: string;
  address?: string;
  bookingRef?: string;
  confidence?: 'high' | 'medium' | 'low';
  createdAt: number;
  notionPageId?: string;
  photoBase64?: string;
  photoUrl?: string;
}

export interface AppState {
  receipts: Receipt[];
  budget: number;
  rate: number;
  currency?: string;
  apiKey?: string;
  notionToken?: string;
  notionDb?: string;
  proxy?: string;
  model?: string;
  scanModel?: string;
  autoSync?: boolean;
  itineraryOverrides?: Record<string, ItineraryOverride>;
  tripName?: string;
  notionDeletedIds?: string[];
}

export interface ItineraryOverride {
  name?: string;
  time?: string;
  type?: string;
  note?: string;
  _source?: 'user' | 'email';
}

export interface ItinerarySpot {
  time?: string;
  name: string;
  type: Category | 'sightseeing' | 'transport' | 'other';
  note?: string;
}

export interface ItineraryDay {
  day: number;
  date: string;
  region: string;
  title: string;
  highlight: string;
  spots: ItinerarySpot[];
}

export interface ScanResult {
  store: string;
  total: number | null;
  subtotal?: number | null;
  tax?: number | null;
  date: string;
  time?: string | null;
  address?: string | null;
  booking_ref?: string | null;
  category: Category;
  payment?: Payment | null;
  items?: ReceiptItem[];
  note?: string | null;
  confidence?: 'high' | 'medium' | 'low';
}

export interface WeatherDay {
  date: string;
  tmax: number;
  tmin: number;
  code: number;
  label: string;
  icon: string;
}
