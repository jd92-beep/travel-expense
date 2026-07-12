import type { SupabaseClient } from "@supabase/supabase-js";

import { AdminOperationError } from "./operations.ts";

type JsonRecord = Record<string, unknown>;
type SourceState = "live" | "partial" | "unavailable";

export type ReconciliationContext = {
  brokerKey: string;
  brokerUrl: string;
  client: SupabaseClient;
  fetcher?: typeof fetch;
  requestId: string;
};

type ReceiptRow = {
  id: string;
  source_id: string | null;
  notion_page_id: string | null;
  visibility: string;
};

type NotionReceipt = {
  pageId: string;
  sourceId: string;
  tripId: string;
};

export type ReconciliationItem = {
  linked: boolean;
  notionCopies: number;
  sourceId: string;
  status:
    | "matched"
    | "missing_in_notion"
    | "notion_only"
    | "duplicate_in_notion"
    | "duplicate_in_supabase"
    | "blocked";
  supabaseReceiptId: string | null;
};

export type ReconciliationComparison = {
  blockedNotionRows: number;
  blockedSupabaseRows: number;
  duplicateNotion: number;
  duplicateSupabase: number;
  items: ReconciliationItem[];
  matchingReceipts: number;
  missingInNotion: number;
  notionOnly: number;
  notionTripReceipts: number;
  resultRows: number;
  truncated: boolean;
};

export type ReconciliationResult = ReconciliationComparison & {
  binding: "configured" | "invalid" | "none";
  bindingStatus: string;
  checkVersion: "notion-reconciliation-v1";
  databaseScope: "personal" | "shared_mirror" | "none";
  lastError: string | null;
  lastHealthAt: string | null;
  linkedReceipts: number;
  mode: "dry_run";
  notionRowsScanned: number;
  notionSource: SourceState;
  privateReceiptsExcluded: number;
  syncMode: string | null;
  tripId: string;
  tripName: string;
  tripReceipts: number;
};

type ReconciliationRead = {
  data: ReconciliationResult;
  sources: Record<string, "live" | "stale" | "unavailable">;
  warnings: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOTION_ID_RE = /^[0-9a-f]{32}$/i;
const PROPERTY_ALIASES = {
  objectType: ["Object Type", "物件類型"],
  sourceId: ["SourceID", "🔑 SourceID", "Source ID"],
  store: ["店名", "🏪 店名", "Store", "Name"],
  tripId: ["TripID", "Trip ID"],
} as const;
const MAX_NOTION_PAGES = 20;
const MAX_NOTION_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_RECEIPTS = 5_000;
const MAX_RESULT_ITEMS = 200;

function recordValue(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function boundedText(value: unknown, max = 240): string {
  return String(value ?? "").trim().slice(0, max);
}

function propertyText(property: unknown): string {
  const value = recordValue(property);
  for (const key of ["title", "rich_text"] as const) {
    const items = Array.isArray(value[key]) ? value[key] as unknown[] : [];
    const text = items.map((item) => {
      const part = recordValue(item);
      const plainText = boundedText(part.plain_text, 500);
      if (plainText) return plainText;
      return boundedText(recordValue(part.text).content, 500);
    }).join("");
    if (text) return boundedText(text);
  }
  const select = boundedText(recordValue(value.select).name);
  if (select) return select;
  const formula = recordValue(value.formula);
  for (const key of ["string", "number", "boolean"] as const) {
    if (formula[key] !== undefined && formula[key] !== null) {
      return boundedText(formula[key]);
    }
  }
  if (value.number !== undefined && value.number !== null) return boundedText(value.number);
  return "";
}

function aliasedProperty(properties: unknown, aliases: readonly string[]): string {
  const values = recordValue(properties);
  for (const alias of aliases) {
    const text = propertyText(values[alias]);
    if (text) return text;
  }
  return "";
}

export function extractNotionReceipts(
  pages: unknown[],
  acceptedTripIds: ReadonlySet<string>,
): { blockedRows: number; receipts: NotionReceipt[] } {
  const receipts: NotionReceipt[] = [];
  let blockedRows = 0;
  for (const rawPage of pages) {
    const page = recordValue(rawPage);
    const properties = page.properties;
    const objectType = aliasedProperty(properties, PROPERTY_ALIASES.objectType).toLowerCase();
    const sourceId = aliasedProperty(properties, PROPERTY_ALIASES.sourceId);
    const tripId = aliasedProperty(properties, PROPERTY_ALIASES.tripId);
    const store = aliasedProperty(properties, PROPERTY_ALIASES.store);
    if (
      (objectType && objectType !== "receipt") ||
      (!objectType && !sourceId && !tripId && !store) ||
      sourceId.startsWith("__") || sourceId.startsWith("trip_") ||
      store.startsWith("🗓")
    ) continue;
    if (tripId && !acceptedTripIds.has(tripId)) continue;
    if (!tripId || !sourceId) {
      blockedRows += 1;
      continue;
    }
    receipts.push({
      pageId: boundedText(page.id, 80),
      sourceId: boundedText(sourceId),
      tripId: boundedText(tripId),
    });
  }
  return { blockedRows, receipts };
}

export function compareTripReceipts(
  receipts: ReceiptRow[],
  notionReceipts: NotionReceipt[],
  blockedNotionRows = 0,
): ReconciliationComparison {
  const activeTripReceipts = receipts.filter((receipt) => receipt.visibility === "trip");
  const notionBySource = new Map<string, NotionReceipt[]>();
  for (const receipt of notionReceipts) {
    const rows = notionBySource.get(receipt.sourceId) ?? [];
    rows.push(receipt);
    notionBySource.set(receipt.sourceId, rows);
  }
  const supabaseBySource = new Map<string, ReceiptRow[]>();
  let blockedSupabaseRows = 0;
  for (const receipt of activeTripReceipts) {
    const sourceId = boundedText(receipt.source_id);
    if (!sourceId) {
      blockedSupabaseRows += 1;
      continue;
    }
    const rows = supabaseBySource.get(sourceId) ?? [];
    rows.push(receipt);
    supabaseBySource.set(sourceId, rows);
  }

  const items: ReconciliationItem[] = [];
  let matchingReceipts = 0;
  let missingInNotion = 0;
  let duplicateNotion = 0;
  let duplicateSupabase = 0;
  for (const [sourceId, supabaseRows] of supabaseBySource) {
    const notionCopies = notionBySource.get(sourceId)?.length ?? 0;
    if (supabaseRows.length > 1) duplicateSupabase += 1;
    if (notionCopies > 1) duplicateNotion += 1;
    for (const receipt of supabaseRows) {
      let status: ReconciliationItem["status"];
      if (supabaseRows.length > 1) status = "duplicate_in_supabase";
      else if (notionCopies > 1) status = "duplicate_in_notion";
      else if (notionCopies === 1) {
        status = "matched";
        matchingReceipts += 1;
      } else {
        status = "missing_in_notion";
        missingInNotion += 1;
      }
      items.push({
        linked: Boolean(receipt.notion_page_id),
        notionCopies,
        sourceId,
        status,
        supabaseReceiptId: receipt.id,
      });
    }
  }
  for (const [sourceId, notionRows] of notionBySource) {
    if (supabaseBySource.has(sourceId)) continue;
    items.push({
      linked: false,
      notionCopies: notionRows.length,
      sourceId,
      status: notionRows.length > 1 ? "duplicate_in_notion" : "notion_only",
      supabaseReceiptId: null,
    });
    if (notionRows.length > 1) duplicateNotion += 1;
  }
  const notionOnly =
    [...notionBySource.keys()].filter((sourceId) => !supabaseBySource.has(sourceId)).length;
  for (let index = 0; index < blockedSupabaseRows; index += 1) {
    items.push({
      linked: false,
      notionCopies: 0,
      sourceId: "Missing SourceID",
      status: "blocked",
      supabaseReceiptId: null,
    });
  }
  const priority: Record<ReconciliationItem["status"], number> = {
    blocked: 0,
    duplicate_in_supabase: 1,
    duplicate_in_notion: 2,
    missing_in_notion: 3,
    notion_only: 4,
    matched: 5,
  };
  items.sort((left, right) =>
    priority[left.status] - priority[right.status] || left.sourceId.localeCompare(right.sourceId)
  );
  return {
    blockedNotionRows,
    blockedSupabaseRows,
    duplicateNotion,
    duplicateSupabase,
    items: items.slice(0, MAX_RESULT_ITEMS),
    matchingReceipts,
    missingInNotion,
    notionOnly,
    notionTripReceipts: notionReceipts.length,
    resultRows: items.length,
    truncated: items.length > MAX_RESULT_ITEMS,
  };
}

function normalizedNotionId(value: unknown): string | null {
  const normalized = boundedText(value, 80).replace(/-/g, "").toLowerCase();
  return NOTION_ID_RE.test(normalized) ? normalized : null;
}

async function responseJson(response: Response): Promise<JsonRecord> {
  const declared = Number(response.headers.get("Content-Length") || "0");
  if (declared > MAX_NOTION_RESPONSE_BYTES) {
    throw new Error("NOTION_RESPONSE_TOO_LARGE");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).length > MAX_NOTION_RESPONSE_BYTES) {
    throw new Error("NOTION_RESPONSE_TOO_LARGE");
  }
  try {
    return recordValue(text ? JSON.parse(text) : {});
  } catch {
    throw new Error("NOTION_RESPONSE_INVALID");
  }
}

async function fetchNotionPages(
  context: ReconciliationContext,
  databaseId: string,
  internalUserId: string | null,
): Promise<{ pages: unknown[]; source: SourceState; warnings: string[] }> {
  const fetcher = context.fetcher ?? fetch;
  const endpoint = new URL("/notion/request", `${context.brokerUrl.replace(/\/+$/, "")}/`);
  if (endpoint.protocol !== "https:") throw new Error("BROKER_URL_INVALID");
  const pages: unknown[] = [];
  const warnings: string[] = [];
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < MAX_NOTION_PAGES; pageNumber += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        body: JSON.stringify({
          body: {
            page_size: 100,
            ...(cursor ? { start_cursor: cursor } : {}),
          },
          databaseId,
          ...(internalUserId ? { internalUserId } : {}),
          method: "POST",
          path: `/databases/${databaseId}/query`,
        }),
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://travel-expense-compact.vercel.app",
          "X-Admin-Internal": context.brokerKey,
          "X-Admin-Request-Id": context.requestId,
        },
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const payload = await responseJson(response);
    if (response.status === 429) {
      const retryAfter = Math.max(1, Number(response.headers.get("Retry-After") || "60") || 60);
      throw new AdminOperationError(
        "RATE_LIMITED",
        "Notion reconciliation is rate limited",
        429,
        { retryable: true, retryAfterSeconds: retryAfter },
      );
    }
    if (!response.ok || payload.ok === false) {
      warnings.push(`NOTION_UNAVAILABLE:${response.status}`);
      return { pages, source: pages.length ? "partial" : "unavailable", warnings };
    }
    const data = recordValue(payload.data);
    const results = Array.isArray(data.results) ? data.results : null;
    if (!results) {
      warnings.push("NOTION_RESPONSE_INVALID");
      return { pages, source: pages.length ? "partial" : "unavailable", warnings };
    }
    pages.push(...results);
    if (data.has_more !== true) return { pages, source: "live", warnings };
    cursor = boundedText(data.next_cursor, 200) || null;
    if (!cursor) {
      warnings.push("NOTION_CURSOR_MISSING");
      return { pages, source: "partial", warnings };
    }
  }
  warnings.push("NOTION_RESULT_LIMIT_REACHED");
  return { pages, source: "partial", warnings };
}

async function loadReceipts(client: SupabaseClient, tripId: string) {
  const receipts: ReceiptRow[] = [];
  for (let offset = 0; offset < MAX_RECEIPTS; offset += 1_000) {
    const { data, error } = await client.from("receipts")
      .select("id,source_id,notion_page_id,visibility")
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new AdminOperationError("INTERNAL_ERROR", "Receipts could not be loaded", 500);
    const rows = Array.isArray(data) ? data as ReceiptRow[] : [];
    receipts.push(...rows);
    if (rows.length < 1_000) return { receipts, truncated: false };
  }
  return { receipts, truncated: true };
}

export async function reconcileTripReadOnly(
  context: ReconciliationContext,
  tripId: string,
): Promise<ReconciliationRead> {
  if (!UUID_RE.test(tripId)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Trip ID is invalid", 400);
  }
  const [{ data: trip, error: tripError }, { data: link, error: linkError }, receiptRead] =
    await Promise.all([
      context.client.from("trips")
        .select("id,name,owner_id,legacy_source_id,app_metadata,notion_database_id")
        .eq("id", tripId)
        .maybeSingle(),
      context.client.from("trip_backend_links")
        .select(
          "notion_database_ref,notion_owner_user_id,sync_mode,status,last_health_at,last_error",
        )
        .eq("trip_id", tripId)
        .maybeSingle(),
      loadReceipts(context.client, tripId),
    ]);
  if (tripError) throw new AdminOperationError("INTERNAL_ERROR", "Trip could not be loaded", 500);
  if (!trip) throw new AdminOperationError("NOT_FOUND", "Trip was not found", 404);
  if (linkError) {
    throw new AdminOperationError("INTERNAL_ERROR", "Trip integration could not be loaded", 500);
  }

  const receipts = receiptRead.receipts;
  const tripReceipts = receipts.filter((receipt) => receipt.visibility === "trip").length;
  const privateReceiptsExcluded =
    receipts.filter((receipt) => receipt.visibility === "private").length;
  const linkedReceipts =
    receipts.filter((receipt) => receipt.visibility === "trip" && Boolean(receipt.notion_page_id))
      .length;
  const databaseScope = link
    ? "personal" as const
    : trip.notion_database_id
    ? "shared_mirror" as const
    : "none" as const;
  const databaseRef = link?.notion_database_ref || trip.notion_database_id || null;
  const databaseId = normalizedNotionId(databaseRef);
  const base = {
    binding: databaseRef
      ? databaseId ? "configured" as const : "invalid" as const
      : "none" as const,
    bindingStatus: boundedText(link?.status || (databaseRef ? "legacy_binding" : "not_configured")),
    checkVersion: "notion-reconciliation-v1" as const,
    databaseScope,
    lastError: link?.last_error ? boundedText(link.last_error, 500) : null,
    lastHealthAt: link?.last_health_at || null,
    linkedReceipts,
    mode: "dry_run" as const,
    privateReceiptsExcluded,
    syncMode: link?.sync_mode || null,
    tripId,
    tripName: boundedText(trip.name, 160) || "Unnamed trip",
    tripReceipts,
  };
  const emptyComparison: ReconciliationComparison = {
    blockedNotionRows: 0,
    blockedSupabaseRows: 0,
    duplicateNotion: 0,
    duplicateSupabase: 0,
    items: [],
    matchingReceipts: 0,
    missingInNotion: 0,
    notionOnly: 0,
    notionTripReceipts: 0,
    resultRows: 0,
    truncated: false,
  };
  const warnings: string[] = receiptRead.truncated ? ["SUPABASE_RECEIPT_LIMIT_REACHED"] : [];
  if (!databaseRef) {
    return {
      data: {
        ...base,
        ...emptyComparison,
        notionRowsScanned: 0,
        notionSource: "unavailable",
      },
      sources: { "shared-cloud": "live", notion: "unavailable" },
      warnings: [...warnings, "NOTION_NOT_CONFIGURED"],
    };
  }
  if (!databaseId) {
    return {
      data: {
        ...base,
        ...emptyComparison,
        notionRowsScanned: 0,
        notionSource: "unavailable",
      },
      sources: { "shared-cloud": "live", notion: "unavailable" },
      warnings: [...warnings, "NOTION_BINDING_INVALID"],
    };
  }
  if (context.brokerKey.length < 32) {
    return {
      data: {
        ...base,
        ...emptyComparison,
        notionRowsScanned: 0,
        notionSource: "unavailable",
      },
      sources: { "shared-cloud": "live", notion: "unavailable" },
      warnings: [...warnings, "NOTION_BROKER_UNAVAILABLE"],
    };
  }

  let notionRead: Awaited<ReturnType<typeof fetchNotionPages>>;
  try {
    notionRead = await fetchNotionPages(
      context,
      databaseId,
      link?.notion_owner_user_id || null,
    );
  } catch (error) {
    if (error instanceof AdminOperationError) throw error;
    notionRead = { pages: [], source: "unavailable", warnings: ["NOTION_UNAVAILABLE"] };
  }
  const metadata = recordValue(trip.app_metadata);
  const acceptedTripIds = new Set(
    [tripId, trip.legacy_source_id, metadata.localTripId]
      .map((value) => boundedText(value))
      .filter(Boolean),
  );
  const extracted = extractNotionReceipts(notionRead.pages, acceptedTripIds);
  const comparison = compareTripReceipts(receipts, extracted.receipts, extracted.blockedRows);
  return {
    data: {
      ...base,
      ...comparison,
      notionRowsScanned: notionRead.pages.length,
      notionSource: notionRead.source,
    },
    sources: {
      "shared-cloud": receiptRead.truncated ? "stale" : "live",
      notion: notionRead.source === "live" ? "live" : "unavailable",
    },
    warnings: [
      ...warnings,
      ...notionRead.warnings,
      ...(extracted.blockedRows
        ? [`NOTION_ROWS_WITHOUT_TRIP_OR_SOURCE:${extracted.blockedRows}`]
        : []),
      ...(comparison.truncated ? ["RECONCILIATION_ITEMS_TRUNCATED"] : []),
    ],
  };
}
