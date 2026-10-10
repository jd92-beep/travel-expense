# Compact local-download format

Available in Compact 0.30.0: **Settings → 資料管理 → 下載旅程資料**.
Choose data only (default), or check **連同收據圖片下載** before downloading.
Both choices create one ZIP on the user's device; neither writes to cloud storage.

The file name is `<safe-trip-name>-<download-date>-data-only.zip` or
`<safe-trip-name>-<download-date>-with-receipts.zip`. Dates use Hong Kong time.

## Archive contents

| File | Contents / use |
| --- | --- |
| `summary.html` | Offline report: trip/date range, expense total in HKD, category breakdown, receipts, payer amounts, notes, itinerary and image links. Can be printed or saved to PDF using the browser. |
| `data/receipts.csv` | One row per visible current-trip record, ordered by date/time/ID; original and record amounts/currencies, resolved HKD, stored rate, pinned-rate flag, payment, payers, split mode/type, beneficiary, visibility, phase, source, OCR status, notes/items, local ID and image file/status. |
| `data/line-items.csv` | Structured item descriptions, quantities and amounts in the record currency, joined by local receipt ID. Unstructured item text remains in `receipts.csv`. |
| `data/allocations.csv` | Raw payment amounts and per-person split inputs (weight, percent, adjustment or amount), joined by receipt ID. These are stored settings, not a computed debt statement. |
| `data/people.csv` | Companion IDs, names, emoji and default share weights. |
| `data/itinerary.csv` | Daily summaries, lodging and planned stops, timezones, addresses, booking references, notes and source text. |
| `data/itinerary.json` | Current-trip itinerary in the existing itinerary JSON shape. |
| `data/photos.csv` | Receipt ID/date/store, image filename, status, byte size and omission/failure explanation. |
| `backup.json` | Portable text-only state for the existing **匯入 Backup** preview/confirmation flow. |
| `manifest.json` | `travel-expense-trip-export` format version 1, app version, UTC creation time, trip summary, file inventory, record count, image choice and per-receipt image result. |
| `README.txt` | Opening, spreadsheet and restore instructions. |
| `receipts/` (optional) | Separate receipt images named with a unique sequence/date/store and byte-verified extension. |

Extract the **whole ZIP**, then open `summary.html`. Image links use relative paths and
remain usable offline. CSV image paths are relative to the archive root and match the manifest.
The report contains no scripts, external fonts or live image links.

## Money and spreadsheet conventions

- CSV uses UTF-8 with BOM, comma delimiters, quoted cells and CRLF rows. Quotes, commas,
  Unicode and multiline notes remain intact. Suspicious spreadsheet formula text is prefixed
  with an apostrophe; signed numeric refund amounts remain numeric.
- HKD conversion uses the same receipt resolver as the app, retaining pinned/historical rate
  behavior. The rate column is record-currency units per 1 HKD; blank means no stored rate.
- Original-currency and record-currency amounts are separate. Never add different currencies
  without conversion. The report's expense total includes refunds and excludes settlement
  and pending-OCR records, which still appear in the exported receipt table.
- Blank split amounts are not zero. Default ratios appear in `people.csv` and `backup.json`;
  detailed per-record settings appear in `allocations.csv` and the JSON backup.

## Image results and limits

Data-only exports make **no photo-loading requests** and contain no embedded images.
For image exports, an available private Storage original is preferred, using a freshly signed
URL from the initiating account; an existing image URL is another source. A locally held
compressed image can substitute when the original is unavailable. That result is labelled
**只有本地縮圖**, never presented as an original.

Missing/forbidden/expired/offline/invalid/oversized photos are reported in `photos.csv` and the
manifest. Successful images and all text data remain downloadable. A manual text record with
no photo is marked **沒有圖片**. Image signatures determine PNG/JPEG/WebP/GIF/HEIC extensions;
HTML and SVG are not accepted as receipts. Existing cloud bucket MIME rules remain unchanged.

Each photo is capped at 6 MB, cloud work at 20 seconds per record, and archive photo contents
at 100 MB. Images are processed sequentially with visible progress. The export can be cancelled;
switching trip/account or leaving the section also cancels pending work without downloading it.

## Scope and restore compatibility

Only the selected trip and device-visible records are exported, **including visible private
records**. This is a personal download, not an anonymized sharing package. Other trips, foreign
trip maps/caches, app login/provider credentials, cloud IDs, sync queues, sharing invitations,
signed image links and photo data are excluded from the portable JSON.

The existing standalone **匯出 CSV** and **匯出 Backup** remain available; Backup is now explicitly
text-only. To restore, select the extracted `backup.json`, review the existing preview and apply.
ZIP image files are for reference and must be attached separately if needed after restore.
Import rules and the cross-client persisted schema remain unchanged.

## Verification

- `npm run test:trip-export`: mocked account-bound Storage renewal, permission denial and local
  thumbnail substitution, signature validation, per-image size ceiling, empty photo and abort.
- `npm run smoke:exports`: actual browser download, ZIP extraction, CSV safety/Unicode/multiline,
  active-trip and credential isolation, JSON restore, original/thumbnail bytes, missing/invalid
  photos, offline report image links, cancellation/retry, empty trip and mobile/desktop layout.
- `npm run smoke:settings`: Settings regressions plus the export suite.
- Required typecheck/build/security scan and the shared-contract smoke also run locally;
  export photo contracts and browser downloads are included in the Compact CI gates.

These checks use disposable fixtures and mocked image/auth responses. A production user's
private Storage photo download needs that user's valid session; this work did not test a real
account's export or write production data.
