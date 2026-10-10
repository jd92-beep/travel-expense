import type { Session } from '@supabase/supabase-js';
import { safePhotoUrl } from './domain';
import { isReceiptPhotoExpected } from './receiptHealth';
import { getSupabaseClient } from './supabase';
import type { ExportPhoto } from './tripExport';
import type { Receipt } from './types';

const MAX_PHOTO_BYTES = 6_000_000;

function extensionFor(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'png';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(8, 12))) return 'heic';
  throw new Error('Invalid receipt image');
}

async function readImage(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
  if (!response.ok) throw new Error('Receipt image unavailable');
  if (Number(response.headers.get('content-length')) > MAX_PHOTO_BYTES) {
    await response.body?.cancel();
    throw new Error('Receipt image too large');
  }
  if (!response.body) throw new Error('Receipt image empty');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PHOTO_BYTES) throw new Error('Receipt image too large');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error('Receipt image empty');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  extensionFor(bytes); // Verify bytes, rather than trusting a MIME label or URL extension.
  return bytes;
}

async function abortable<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let onAbort: () => void = () => undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
  } finally { signal.removeEventListener('abort', onAbort); }
}

export async function loadReceiptExportPhoto(session: Session | null, receipt: Receipt, signal: AbortSignal): Promise<ExportPhoto | null> {
  signal.throwIfAborted();
  const urls: Array<{ url: string; source: ExportPhoto['source'] }> = [];
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error('Receipt photo timeout')), 20_000);
  try {
    // Renew private Storage access using the initiating account; never change bucket policy.
    if (session && (receipt.supabasePhotoPath || receipt.supabaseId)) {
      try {
        const client = getSupabaseClient(session);
        let path = receipt.supabasePhotoPath;
        if (client && !path && receipt.supabaseId) {
          const { data, error } = await client.from('receipt_photos').select('storage_path').eq('receipt_id', receipt.supabaseId).abortSignal(controller.signal).maybeSingle();
          if (error) throw error;
          path = data?.storage_path;
        }
        if (client && path) {
          const { data, error } = await abortable(client.storage.from('receipt-photos').createSignedUrl(path, 60), controller.signal);
          if (error) throw error;
          const url = safePhotoUrl(data?.signedUrl);
          if (url) urls.push({ url, source: 'cloud' });
        }
      } catch { signal.throwIfAborted(); }
    }
    const remote = safePhotoUrl(receipt.photoUrl);
    if (remote && !urls.some((candidate) => candidate.url === remote)) urls.push({ url: remote, source: 'remote' });
    for (const candidate of urls) {
      try {
        const bytes = await readImage(candidate.url, controller.signal);
        return { bytes, extension: extensionFor(bytes), source: candidate.source };
      } catch { signal.throwIfAborted(); }
    }
    // Cached compressed photo remains usable offline; mark it honestly in the manifest/report.
    const thumb = safePhotoUrl(receipt.photoThumb);
    if (thumb.startsWith('data:')) {
      const bytes = await readImage(thumb, signal);
      return { bytes, extension: extensionFor(bytes), source: 'thumbnail' };
    }
    if (urls.length || receipt.photoUrl || receipt.photoThumb || receipt.supabasePhotoPath || isReceiptPhotoExpected(receipt)) throw new Error('Receipt image unavailable');
    return null;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
  }
}
