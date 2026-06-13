import type { Receipt } from './types';

export const LARGE_PHOTO_BYTES = 600_000;

export function isReceiptPhotoExpected(receipt: Receipt): boolean {
  const source = String(receipt.source || '');
  return source === 'react-ocr'
    || source === 'react-ocr-manual'
    || source === 'react-email-image'
    || /OCR|截圖|掃描/i.test(String(receipt.note || ''));
}

export function estimatePhotoBytes(value: unknown): number {
  const raw = String(value || '').trim().replace(/[\r\n\s]/g, '');
  if (!raw || /^https?:\/\//i.test(raw)) return 0;
  const base64 = raw.includes(',') ? raw.split(',').pop() || '' : raw;
  if (!/^[a-z0-9+/=]+$/i.test(base64)) return 0;
  const padding = (base64.match(/=+$/)?.[0].length || 0);
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

export function receiptPhotoBytes(receipt: Receipt): number {
  return Math.max(estimatePhotoBytes(receipt.photoThumb), estimatePhotoBytes(receipt.photoUrl));
}

export function receiptHasLargePhoto(receipt: Receipt): boolean {
  return receiptPhotoBytes(receipt) > LARGE_PHOTO_BYTES;
}

export function receiptHasLocalPhoto(receipt: Receipt): boolean {
  return estimatePhotoBytes(receipt.photoThumb) > 0
    || (!!receipt.photoUrl && !/^https?:\/\//i.test(String(receipt.photoUrl)));
}

export function receiptPhotoNeedsSync(receipt: Receipt): boolean {
  if (!receiptHasLocalPhoto(receipt)) return false;
  if (receipt._photoSyncedToNotion || receipt.notionFileUploadId || /^https?:\/\//i.test(String(receipt.photoUrl || ''))) return false;
  if (receipt._photoSyncedToSupabase || receipt.supabasePhotoPath) return false;
  return receipt.syncStatus !== 'synced' || !receipt.photoUrl;
}
