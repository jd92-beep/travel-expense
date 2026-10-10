import { strToU8, zipSync, type Zippable } from 'fflate';
import { activeTrip, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { APP_VERSION } from './constants';
import { bakeItineraryOverrides, categoryById, csvCell, displayStore, getItinerary, getPersons, getReceiptHkdAmount, isPendingReceipt, receiptCsv, todayYmd } from './domain';
import { stripPortableBackupState } from './storage';
import type { AppState, Receipt, TripProfile } from './types';

export type ExportPhoto = { bytes: Uint8Array; extension: string; source: 'cloud' | 'remote' | 'thumbnail' };
export type PhotoEntry = {
  receiptId: string;
  date: string;
  store: string;
  file: string;
  status: 'downloaded' | 'thumbnail' | 'missing' | 'none' | 'omitted';
  bytes: number;
  note: string;
};
export const PHOTO_STATUS = { downloaded: '已下載', thumbnail: '只有本地縮圖', missing: '未能下載', none: '沒有圖片', omitted: '未包含圖片' };
const MAX_ARCHIVE_PHOTO_BYTES = 100_000_000;

export function exportFilename(value: string): string {
  // No path separators, control characters, hidden files or platform-reserved punctuation.
  return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-').replace(/\s+/g, '-').replace(/^[. -]+|[. -]+$/g, '').slice(0, 70) || 'travel-expense';
}

export function portableTripBackup(state: AppState, trip = activeTrip(state)): Partial<AppState> {
  const scopedState = { ...state, trips: [trip], activeTripId: trip.id };
  const itinerary = bakeItineraryOverrides(scopedState) || getItinerary(scopedState);
  const receipts = scopedReceiptsForTrip(state, trip);
  const stores = new Set(receipts.map((receipt) => receipt.store));
  const portable = stripPortableBackupState({
    ...scopedState,
    tripName: trip.name,
    tripDateRange: { start: trip.startDate, end: trip.endDate },
    trips: [{ ...trip, itinerary }],
    customItinerary: itinerary,
    itineraryOverrides: {},
    storeTranslations: Object.fromEntries(Object.entries(state.storeTranslations || {}).filter(([store]) => stores.has(store))),
    receipts,
  });
  // Images are separate files in the ZIP. Restore deliberately never imports image URLs/data.
  portable.receipts = portable.receipts?.map(({ photoThumb: _thumb, createdByEmail: _email, ...receipt }) => receipt);
  return portable;
}

function csv(rows: unknown[][]): string {
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function html(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function report(state: AppState, trip: TripProfile, receipts: Receipt[], photos: PhotoEntry[], generatedAt: string): string {
  const expenses = receipts.filter((r) => r.recordKind !== 'settlement' && !r.isSettlement && !isPendingReceipt(r));
  const expenseHkd = expenses.reduce((sum, receipt) => sum + getReceiptHkdAmount(receipt, state), 0);
  const categories = new Map<string, number>();
  for (const receipt of expenses) {
    const name = categoryById(receipt.category).name;
    categories.set(name, (categories.get(name) || 0) + getReceiptHkdAmount(receipt, state));
  }
  const itinerary = getItinerary(state);
  const persons = getPersons(state);
  const photoById = new Map(photos.map((photo) => [photo.receiptId, photo]));
  const rows = receipts.map((r) => {
    const photo = photoById.get(r.id);
    const label = isPendingReceipt(r) ? '待辨識' : r.recordKind === 'settlement' || r.isSettlement ? '還款' : '開支';
    const payer = persons.find((p) => p.id === (r.personId || persons[0]?.id));
    const payerLabel = r.payers?.length ? r.payers.map((p) => `${persons.find((person) => person.id === p.personId)?.name || p.personId} (${p.amount} ${r.currency || state.tripCurrency})`).join('、') : payer?.name || r.personId || '未指定';
    return `<tr><td>${html(r.date)}<br>${html(r.time)}</td><td>${html(displayStore(r))}<small>${html(label)} · ${html(categoryById(r.category).name)}</small></td><td>${html(r.originalAmount ?? r.total)} ${html(r.originalCurrency || r.currency || state.tripCurrency)}</td><td>${html(getReceiptHkdAmount(r, state))}</td><td>${html(payerLabel)}</td><td>${html(r.note)}<small>${html(r.itemsText)}</small></td><td>${photo?.file ? `<a href="${html(photo.file.split('/').map(encodeURIComponent).join('/'))}">${html(PHOTO_STATUS[photo.status])}</a>` : html(PHOTO_STATUS[photo?.status || 'omitted'])}</td></tr>`;
  }).join('');
  const days = itinerary.map((day) => `<section><h3>${html(day.date)} · ${html(day.region)}</h3><p>${html(day.highlight)} ${html(day.note)}</p>${day.lodging ? `<p>住宿：${html(day.lodging.name)} · ${html(day.lodging.address)} · ${html(day.lodging.bookingRef)}</p>` : ''}<ul>${(day.spots || []).map((spot) => `<li>${html(spot.time)} ${html(spot.name)}<small>${html(spot.address)} ${html(spot.note)} ${html(spot.bookingRef)}</small></li>`).join('')}</ul></section>`).join('');
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${html(trip.name)} · 旅程報告</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#182b34;max-width:1100px;margin:auto;padding:24px}h1,h2,h3{line-height:1.3}small{display:block;color:#54646b;white-space:pre-wrap}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #cad3d6;padding:10px;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}a{color:#135975}.scroll{overflow:auto}section{break-inside:avoid}@media print{body{padding:0}.scroll{overflow:visible}table{font-size:10px}a{color:inherit}}</style><h1>${html(trip.name)}</h1><p>${html(trip.destinationSummary)} · ${html(trip.startDate)} 至 ${html(trip.endDate)}</p><small>匯出時間：${html(generatedAt)} · Travel Expense ${APP_VERSION}</small><h2>開支摘要</h2><p>已記錄開支：HKD ${html(expenseHkd)} · ${expenses.length} 筆（包含退款；還款及待辨識紀錄不計入開支總額）。全部紀錄：${receipts.length} 筆。</p><ul>${[...categories].map(([category, amount]) => `<li>${html(category)}：HKD ${html(amount)}</li>`).join('')}</ul><p>圖片：${photos.filter((p) => !!p.file).length} 張；只有縮圖 ${photos.filter((p) => p.status === 'thumbnail').length} 張；未能下載 ${photos.filter((p) => p.status === 'missing').length} 張。</p><h2>收據紀錄</h2><div class="scroll"><table><thead><tr><th>日期</th><th>店名／種類</th><th>原金額</th><th>HKD</th><th>付款人</th><th>備註／品項</th><th>圖片</th></tr></thead><tbody>${rows}</tbody></table></div><h2>行程</h2>${days}<p>完整欄位見 data/ 內 CSV；匯入 App 請用 backup.json。解壓整個資料包後，圖片連結先可開啟。</p></html>`;
}

export async function buildTripArchive(
  state: AppState,
  options: { includeImages: boolean; signal: AbortSignal; loadPhoto: (receipt: Receipt, signal: AbortSignal) => Promise<ExportPhoto | null>; onProgress?: (done: number, total: number) => void },
): Promise<{ blob: Blob; filename: string; photos: PhotoEntry[]; receiptCount: number }> {
  const trip = activeTrip(state);
  const receipts = scopedReceiptsForTrip(state, trip).slice().sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`) || a.id.localeCompare(b.id));
  const scopedState = { ...state, receipts, trips: [trip], activeTripId: trip.id };
  const backup = portableTripBackup(scopedState, trip);
  const itinerary = backup.customItinerary || [];
  const exportState = { ...scopedState, trips: backup.trips, customItinerary: itinerary, itineraryOverrides: {} };
  const generatedAt = new Date().toISOString();
  const files: Zippable = {};
  const photos: PhotoEntry[] = [];
  let photoBytes = 0;
  for (const [index, receipt] of receipts.entries()) {
    options.signal.throwIfAborted();
    const entry: PhotoEntry = { receiptId: receipt.id, date: receipt.date, store: displayStore(receipt), file: '', status: options.includeImages ? 'none' : 'omitted', bytes: 0, note: '' };
    if (options.includeImages) {
      try {
        const photo = await options.loadPhoto(receipt, options.signal);
        if (photo) {
          if (photoBytes + photo.bytes.length > MAX_ARCHIVE_PHOTO_BYTES) throw new Error('圖片總大小超過 100 MB；請另行下載此收據圖片');
          entry.file = `receipts/${String(index + 1).padStart(4, '0')}-${exportFilename(receipt.date)}-${exportFilename(displayStore(receipt))}.${photo.extension}`;
          entry.status = photo.source === 'thumbnail' ? 'thumbnail' : 'downloaded';
          entry.note = photo.source === 'thumbnail' ? '原圖未能取得；匯出本地縮圖' : '';
          entry.bytes = photo.bytes.length;
          photoBytes += photo.bytes.length;
          files[entry.file] = [photo.bytes, { level: 0 }];
        }
      } catch (error) {
        options.signal.throwIfAborted();
        entry.status = 'missing';
        // Only controlled messages from the photo adapter reach a portable file, never URLs/tokens.
        entry.note = error instanceof Error && error.message.startsWith('圖片總大小') ? error.message : '圖片未能取得（離線、權限、已過期或檔案無效）；資料仍已匯出';
      }
    }
    photos.push(entry);
    options.onProgress?.(index + 1, receipts.length);
  }
  options.signal.throwIfAborted();
  const persons = getPersons(state);
  const personName = (id?: string) => persons.find((p) => p.id === id)?.name || id || '';
  const photoMap = Object.fromEntries(photos.map((p) => [p.receiptId, { file: p.file, status: PHOTO_STATUS[p.status] }]));
  const textFile = (name: string, content: string) => { files[name] = strToU8(content); };
  textFile('data/receipts.csv', receiptCsv(exportState, photoMap));
  textFile('data/line-items.csv', csv([
    ['紀錄 ID', '日期', '店名', '品項', '數量', '品項金額', '紀錄貨幣'],
    ...receipts.flatMap((r) => (r.lineItems || []).map((item) => [r.id, r.date, displayStore(r), item.desc, item.qty ?? '', item.amount, r.currency || state.tripCurrency])),
  ]));
  textFile('data/allocations.csv', csv([
    ['紀錄 ID', '店名', '角色', '旅伴', '金額', '紀錄貨幣', '權重', '百分比', '調整', '分帳方法'],
    ...receipts.flatMap((r) => [
      ...(r.payers?.length ? r.payers : [{ personId: r.personId || persons[0]?.id, amount: r.total }]).map((payer) => [r.id, displayStore(r), '付款', personName(payer.personId), payer.amount, r.currency || state.tripCurrency, '', '', '', '']),
      ...(r.splits || []).map((split) => [r.id, displayStore(r), '分攤設定', personName(split.personId), split.amount ?? '', r.currency || state.tripCurrency, split.weight ?? '', split.pct ?? '', split.adjust ?? '', r.splitType || 'shares']),
    ]),
  ]));
  textFile('data/itinerary.csv', csv([
    ['日期', '第幾日', '地區', '時區', '類型', '開始時間', '結束時間', '名稱', '地址', 'Booking Ref', '備註', '原文'],
    ...itinerary.flatMap((day) => [
      [day.date, day.day, day.region, day.timezone || '', '每日摘要', '', '', day.highlight || '', '', '', day.note || '', ''],
      ...(day.lodging ? [[day.date, day.day, day.region, day.timezone || '', '住宿', day.lodging.checkIn || '', day.lodging.checkOut || '', day.lodging.name, day.lodging.address || '', day.lodging.bookingRef || '', '', day.lodging.sourceText || '']] : []),
      ...(day.spots || []).map((spot) => [day.date, day.day, day.region, spot.timezone || day.timezone || '', spot.type, spot.time, spot.timeEnd || '', spot.name, spot.address || '', spot.bookingRef || '', spot.note || '', spot.sourceText || '']),
    ]),
  ]));
  textFile('data/people.csv', csv([
    ['旅伴 ID', '姓名', '圖示', '預設分帳權重'],
    ...persons.map((person) => [person.id, person.name, person.emoji, state.shareRatios[person.id] ?? '']),
  ]));
  textFile('data/photos.csv', csv([
    ['紀錄 ID', '日期', '店名', '圖片檔案', '狀態', '大小(bytes)', '備註'],
    ...photos.map((p) => [p.receiptId, p.date, p.store, p.file, PHOTO_STATUS[p.status], p.bytes, p.note]),
  ]));
  textFile('data/itinerary.json', JSON.stringify(itinerary, null, 2));
  textFile('backup.json', JSON.stringify(backup, null, 2));
  textFile('summary.html', report(exportState, trip, receipts, photos, generatedAt));
  textFile('README.txt', `Travel Expense 旅程資料包\n旅程：${trip.name}\n匯出時間：${generatedAt}\n\n先解壓整個 ZIP，再開啟 summary.html 閱讀／列印報告（不需要網絡）。\n\ndata/receipts.csv：每筆收據、原幣／HKD、匯率、付款人、備註及圖片對照。\ndata/line-items.csv：有結構化品項的明細；只有文字的品項在 receipts.csv。\ndata/allocations.csv：原始付款及分攤設定；空白金額不是零，權重／百分比並非已計算欠款。\ndata/itinerary.csv / itinerary.json：每日摘要、住宿、行程、預訂資料。\ndata/people.csv：旅伴名稱及預設分帳權重。\ndata/photos.csv：圖片檔案及下載狀態。\nbackup.json：在設定 > 資料管理 > 匯入 Backup 還原文字資料；圖片需另行附回。\nreceipts/：${options.includeImages ? '可取得的收據圖片；只有縮圖或下載失敗會列明' : '沒有加入圖片（已選擇只下載資料）'}。\n\nCSV 採用 UTF-8 BOM，可用 Excel／Numbers；多行備註保留，疑似公式的文字以單引號保護。\nHKD 使用 App 的收據匯率／金額計算法；原幣不可跨貨幣直接加總。\n匯率欄為每 1 HKD 可換的紀錄貨幣；空白代表紀錄未保存匯率。\n圖片逐張下載；單張最多 6 MB，資料包圖片最多 100 MB，超限會記在 photos.csv。\n只包含匯出時目前旅程及裝置可見的紀錄（包括你可見的私人紀錄）；不包含其他旅程、登入憑證、雲端 ID 或圖片存取連結。\n`);
  textFile('manifest.json', JSON.stringify({ format: 'travel-expense-trip-export', formatVersion: 1, appVersion: APP_VERSION, generatedAt, trip: { name: trip.name, startDate: trip.startDate, endDate: trip.endDate }, receiptCount: receipts.length, includeImages: options.includeImages, photos, files: [...Object.keys(files), 'manifest.json'] }, null, 2));
  // Give the browser a paint/cancel opportunity before packaging. Already-compressed images
  // use ZIP STORE; only small text files need deflate work.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  options.signal.throwIfAborted();
  const bytes = zipSync(files, { level: 6 });
  return { blob: new Blob([bytes], { type: 'application/zip' }), filename: `${exportFilename(trip.name)}-${todayYmd()}-${options.includeImages ? 'with-receipts' : 'data-only'}.zip`, photos, receiptCount: receipts.length };
}
