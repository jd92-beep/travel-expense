// Spreadsheet-safe CSV helpers shared by every admin export.

export function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  // Neutralise formula injection (=, +, -, @) when opened in Excel/Sheets.
  const safe = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function downloadCsv<T>(
  filePrefix: string,
  rows: T[],
  columns: Array<[string, (row: T) => unknown]>,
) {
  const csv = [
    columns.map(([name]) => csvCell(name)).join(","),
    ...rows.map((row) => columns.map(([, value]) => csvCell(value(row))).join(",")),
  ].join("\r\n");
  // BOM so Excel opens UTF-8 (store names are often CJK) correctly.
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
