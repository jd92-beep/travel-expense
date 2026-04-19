export type Category =
  | 'transport'
  | 'food'
  | 'shopping'
  | 'lodging'
  | 'ticket'
  | 'medicine'
  | 'other';

export type Payment = 'cash' | 'credit' | 'paypay' | 'suica';

export interface Receipt {
  id: string;
  store: string;
  total: number;
  date: string; // YYYY-MM-DD
  category: Category;
  payment: Payment;
  region?: string;
  itemsText?: string;
  note?: string;
  createdAt: number;
  notionPageId?: string;
  bookingRef?: string;
  time?: string;
  address?: string;
  photoBase64?: string;
}

export interface AppState {
  receipts: Receipt[];
  budget: number;
  rate: number;
  currency?: string;
  apiKey?: string;
  model?: string;
  notionToken?: string;
  notionDb?: string;
  proxy?: string;
  autoSync?: boolean;
  itineraryOverrides?: Record<string, ItineraryOverride>;
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
