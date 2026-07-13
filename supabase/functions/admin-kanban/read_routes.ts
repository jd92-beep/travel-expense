export type AdminErrorCode =
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL_ERROR";

type SourceState = "live" | "stale" | "unavailable";

export type AdminEnvelope = {
  ok: boolean;
  data: unknown | null;
  error: {
    code: AdminErrorCode;
    message: string;
    retryable: boolean;
  } | null;
  meta: {
    requestId: string;
    generatedAt: string;
    warnings: string[];
    staleAfterSeconds?: number;
    scope?: "shared-cloud" | "compact-web" | "android";
    sources?: Record<string, SourceState>;
    nextCursor?: string;
    total?: number;
  };
};

export type AdminReadResult = {
  status: number;
  payload: AdminEnvelope;
};

export type AdminRpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

type ReadContext = {
  client: AdminRpcClient;
  now?: Date;
  requestId: string;
  route: string;
  searchParams: URLSearchParams;
};

type Cursor = { id: string; timestamp: string };
type JsonRecord = Record<string, unknown>;

export type CanonicalItinerarySpot = {
  id: string;
  name: string;
  time?: string;
  address?: string;
  order: number;
};

export type CanonicalItineraryDay = {
  date: string;
  title: string;
  location?: string;
  notes?: string;
  spots: CanonicalItinerarySpot[];
};

export type ItineraryIntegrityIssue = {
  code: "DUPLICATE_DAY" | "OUT_OF_RANGE_DAY" | "INVALID_DAY" | "MISSING_DAY" | "INVALID_SPOT";
  date?: string;
  count?: number;
  spotCount?: number;
};

export type CanonicalItinerary = {
  tripId: string;
  startDate: string;
  endDate: string;
  version: number;
  days: CanonicalItineraryDay[];
  integrityIssues: ItineraryIntegrityIssue[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMITS = new Set([50, 100, 200]);
const SHARED_SOURCE = { "shared-cloud": "live" as const };

class ReadFault extends Error {
  constructor(
    readonly code: AdminErrorCode,
    readonly status: number,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function success(
  context: ReadContext,
  data: unknown,
  options: {
    nextCursor?: string;
    staleAfterSeconds?: number;
    total?: number;
    warnings?: string[];
  } = {},
): AdminReadResult {
  return {
    status: 200,
    payload: {
      ok: true,
      data,
      error: null,
      meta: {
        requestId: context.requestId,
        generatedAt: (context.now ?? new Date()).toISOString(),
        staleAfterSeconds: options.staleAfterSeconds ?? 60,
        scope: "shared-cloud",
        sources: SHARED_SOURCE,
        warnings: options.warnings ?? [],
        ...(options.nextCursor ? { nextCursor: options.nextCursor } : {}),
        ...(options.total !== undefined ? { total: options.total } : {}),
      },
    },
  };
}

function failure(context: ReadContext, fault: ReadFault): AdminReadResult {
  return {
    status: fault.status,
    payload: {
      ok: false,
      data: null,
      error: {
        code: fault.code,
        message: fault.message,
        retryable: fault.retryable,
      },
      meta: {
        requestId: context.requestId,
        generatedAt: (context.now ?? new Date()).toISOString(),
        warnings: [],
      },
    },
  };
}

function validation(message = "Admin request parameters are invalid"): never {
  throw new ReadFault("VALIDATION_FAILED", 400, message);
}

function parseQuery(searchParams: URLSearchParams, allowed: ReadonlySet<string>) {
  const values = new Map<string, string>();
  for (const [key, value] of searchParams.entries()) {
    if (values.has(key) || !allowed.has(key) || value.length > 256) validation();
    values.set(key, value);
  }
  return values;
}

function textValue(
  values: ReadonlyMap<string, string>,
  key: string,
  options: { max?: number; min?: number; rejectEmail?: boolean; required?: boolean } = {},
) {
  const raw = values.get(key);
  if (raw === undefined || raw === "") {
    if (options.required) validation();
    return null;
  }
  if (
    raw.length > (options.max ?? 100) || raw.length < (options.min ?? 0) ||
    (options.rejectEmail && raw.includes("@"))
  ) validation();
  return raw;
}

function enumValue(
  values: ReadonlyMap<string, string>,
  key: string,
  allowed: readonly string[],
) {
  const value = textValue(values, key, { max: 40 });
  if (value !== null && !allowed.includes(value)) validation();
  return value;
}

function uuidValue(
  values: ReadonlyMap<string, string>,
  key: string,
  required = false,
) {
  const value = textValue(values, key, { max: 36, required });
  if (value !== null && !UUID_RE.test(value)) validation();
  return value;
}

function timestampValue(values: ReadonlyMap<string, string>, key: string) {
  const value = textValue(values, key, { max: 40 });
  if (value !== null && !Number.isFinite(Date.parse(value))) validation();
  return value;
}

function limitValue(values: ReadonlyMap<string, string>) {
  const raw = values.get("limit");
  if (raw === undefined || raw === "") return 50;
  if (!/^\d{2,3}$/.test(raw)) validation();
  const limit = Number(raw);
  if (!LIMITS.has(limit)) validation();
  return limit;
}

function fixedSort(
  values: ReadonlyMap<string, string>,
  expectedColumn: "updated_at" | "created_at",
) {
  const sort = values.get("sort");
  const direction = values.get("direction");
  if (sort !== undefined && sort !== expectedColumn) validation();
  if (direction !== undefined && direction !== "desc") validation();
}

function base64urlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecode(value: string) {
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) validation();
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      Math.ceil(value.length / 4) * 4,
      "=",
    );
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    validation();
  }
}

function decodeCursor(values: ReadonlyMap<string, string>): Cursor | null {
  const value = values.get("cursor");
  if (!value) return null;
  try {
    const parsed = JSON.parse(base64urlDecode(value)) as unknown;
    if (
      !isRecord(parsed) || parsed.v !== 1 || typeof parsed.t !== "string" ||
      typeof parsed.id !== "string" || !UUID_RE.test(parsed.id) ||
      !Number.isFinite(Date.parse(parsed.t))
    ) validation();
    return { id: parsed.id, timestamp: parsed.t };
  } catch (error) {
    if (error instanceof ReadFault) throw error;
    validation();
  }
}

function encodeCursor(item: JsonRecord, timestampColumn: "updated_at" | "created_at") {
  const timestamp = item[timestampColumn];
  const id = item.id;
  if (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))) {
    throw new ReadFault(
      "UPSTREAM_UNAVAILABLE",
      502,
      "Admin data source returned invalid data",
      true,
    );
  }
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    throw new ReadFault(
      "UPSTREAM_UNAVAILABLE",
      502,
      "Admin data source returned invalid data",
      true,
    );
  }
  return base64urlEncode(JSON.stringify({ v: 1, t: timestamp, id }));
}

async function rpc(
  context: ReadContext,
  name: string,
  args?: Record<string, unknown>,
) {
  const { data, error } = await context.client.rpc(name, args);
  if (error) {
    throw new ReadFault(
      "UPSTREAM_UNAVAILABLE",
      503,
      "Admin data source is temporarily unavailable",
      true,
    );
  }
  return data;
}

async function detail(
  context: ReadContext,
  rpcName: string,
  id: string,
  staleAfterSeconds = 60,
) {
  const data = await rpc(context, rpcName, { p_id: id });
  if (data === null) throw new ReadFault("NOT_FOUND", 404, "Admin resource was not found");
  return success(context, data, { staleAfterSeconds });
}

async function list(
  context: ReadContext,
  rpcName: string,
  args: Record<string, unknown>,
  limit: number,
  timestampColumn: "updated_at" | "created_at",
  staleAfterSeconds = 60,
) {
  const raw = await rpc(context, rpcName, args);
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    throw new ReadFault(
      "UPSTREAM_UNAVAILABLE",
      502,
      "Admin data source returned invalid data",
      true,
    );
  }
  const rows = raw.items;
  if (!rows.every(isRecord)) {
    throw new ReadFault(
      "UPSTREAM_UNAVAILABLE",
      502,
      "Admin data source returned invalid data",
      true,
    );
  }
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const total = Number(raw.total);
  if (!Number.isInteger(total) || total < 0) {
    throw new ReadFault(
      "UPSTREAM_UNAVAILABLE",
      502,
      "Admin data source returned invalid data",
      true,
    );
  }
  const nextCursor = hasMore && items.length > 0
    ? encodeCursor(items[items.length - 1], timestampColumn)
    : undefined;
  const data: JsonRecord = { ...raw, items };
  delete data.total;
  return success(context, data, { nextCursor, staleAfterSeconds, total });
}

function parseLocalDate(value: unknown): { value: string; epochDay: number } | null {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const instant = Date.UTC(year, month - 1, day);
  const parsed = new Date(instant);
  if (
    parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) return null;
  return { value, epochDay: Math.floor(instant / 86_400_000) };
}

function inclusiveDates(startDate: unknown, endDate: unknown) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end || end.epochDay < start.epochDay || end.epochDay - start.epochDay > 3660) {
    throw new ReadFault("UPSTREAM_UNAVAILABLE", 502, "Trip date range is invalid", true);
  }
  const dates: string[] = [];
  for (let day = start.epochDay; day <= end.epochDay; day += 1) {
    dates.push(new Date(day * 86_400_000).toISOString().slice(0, 10));
  }
  return dates;
}

function optionalString(value: unknown, max = 500) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function daySpots(day: JsonRecord) {
  return Array.isArray(day.spots) ? day.spots : [];
}

export function canonicalizeItinerary(input: unknown): {
  data: CanonicalItinerary;
  warnings: string[];
} {
  if (!isRecord(input)) {
    throw new ReadFault(
      "UPSTREAM_UNAVAILABLE",
      502,
      "Itinerary source returned invalid data",
      true,
    );
  }
  const tripId = input.tripId;
  const startDate = input.startDate;
  const endDate = input.endDate;
  if (
    typeof tripId !== "string" || !UUID_RE.test(tripId) || typeof startDate !== "string" ||
    typeof endDate !== "string"
  ) {
    throw new ReadFault(
      "UPSTREAM_UNAVAILABLE",
      502,
      "Itinerary source returned invalid data",
      true,
    );
  }

  const expectedDates = inclusiveDates(startDate, endDate);
  const expectedSet = new Set(expectedDates);
  const rawDays = Array.isArray(input.itinerary)
    ? input.itinerary
    : Array.isArray(input.days)
    ? input.days
    : [];
  const byDate = new Map<string, JsonRecord[]>();
  const integrityIssues: ItineraryIntegrityIssue[] = [];
  let invalidDayCount = 0;
  let outOfRangeCount = 0;
  let duplicateCount = 0;
  let invalidSpotCount = 0;

  for (const candidate of rawDays) {
    if (!isRecord(candidate)) {
      invalidDayCount += 1;
      integrityIssues.push({ code: "INVALID_DAY", count: 1 });
      continue;
    }
    const parsedDate = parseLocalDate(candidate.date);
    if (!parsedDate) {
      invalidDayCount += 1;
      integrityIssues.push({ code: "INVALID_DAY", count: 1 });
      continue;
    }
    if (!expectedSet.has(parsedDate.value)) {
      outOfRangeCount += 1;
      integrityIssues.push({
        code: "OUT_OF_RANGE_DAY",
        date: parsedDate.value,
        spotCount: daySpots(candidate).length,
      });
      continue;
    }
    const existing = byDate.get(parsedDate.value) ?? [];
    if (existing.length > 0) {
      duplicateCount += 1;
      integrityIssues.push({ code: "DUPLICATE_DAY", date: parsedDate.value, count: 1 });
    }
    existing.push(candidate);
    byDate.set(parsedDate.value, existing);
  }

  const days = expectedDates.map((date, dayIndex): CanonicalItineraryDay => {
    const sources = byDate.get(date) ?? [];
    if (sources.length === 0) {
      integrityIssues.push({ code: "MISSING_DAY", date });
      return { date, title: `Day ${dayIndex + 1}`, spots: [] };
    }

    const primary = sources[0];
    const spotRows: Array<{ sourceOrder: number; spot: CanonicalItinerarySpot }> = [];
    let sourceOrder = 0;
    for (const source of sources) {
      for (const candidate of daySpots(source)) {
        sourceOrder += 1;
        if (!isRecord(candidate)) {
          invalidSpotCount += 1;
          integrityIssues.push({ code: "INVALID_SPOT", date, count: 1 });
          continue;
        }
        const name = optionalString(candidate.name, 240);
        if (!name) {
          invalidSpotCount += 1;
          integrityIssues.push({ code: "INVALID_SPOT", date, count: 1 });
          continue;
        }
        const preferredOrder = Number(candidate.order);
        spotRows.push({
          sourceOrder: Number.isFinite(preferredOrder) ? preferredOrder : sourceOrder,
          spot: {
            id: optionalString(candidate.id, 128) ?? `${tripId}:${date}:${sourceOrder}`,
            name,
            ...(optionalString(candidate.time, 16)
              ? { time: optionalString(candidate.time, 16) }
              : {}),
            ...(optionalString(candidate.address, 500)
              ? { address: optionalString(candidate.address, 500) }
              : {}),
            order: 0,
          },
        });
      }
    }
    spotRows.sort((left, right) => left.sourceOrder - right.sourceOrder);
    const spots = spotRows.map(({ spot }, index) => ({ ...spot, order: index + 1 }));
    const title = optionalString(primary.title, 240) ?? optionalString(primary.highlight, 240) ??
      optionalString(primary.region, 240) ?? `Day ${dayIndex + 1}`;
    const location = optionalString(primary.location, 240) ?? optionalString(primary.region, 240) ??
      optionalString(primary.city, 240);
    const notes = optionalString(primary.notes, 1000) ?? optionalString(primary.note, 1000);
    return {
      date,
      title,
      ...(location ? { location } : {}),
      ...(notes ? { notes } : {}),
      spots,
    };
  });

  const missingCount = integrityIssues.filter((issue) => issue.code === "MISSING_DAY").length;
  const warnings = [
    missingCount > 0 ? `ITINERARY_MISSING_DAYS:${missingCount}` : null,
    duplicateCount > 0 ? `ITINERARY_DUPLICATE_DAYS:${duplicateCount}` : null,
    outOfRangeCount > 0 ? `ITINERARY_OUT_OF_RANGE_DAYS:${outOfRangeCount}` : null,
    invalidDayCount > 0 ? `ITINERARY_INVALID_DAYS:${invalidDayCount}` : null,
    invalidSpotCount > 0 ? `ITINERARY_INVALID_SPOTS:${invalidSpotCount}` : null,
  ].filter((warning): warning is string => warning !== null);

  return {
    data: {
      tripId,
      startDate,
      endDate,
      version: Number.isInteger(Number(input.version)) ? Number(input.version) : 0,
      days,
      integrityIssues,
    },
    warnings,
  };
}

async function executeRoute(context: ReadContext): Promise<AdminReadResult | null> {
  const { route, searchParams } = context;

  if (route === "/api/overview") {
    parseQuery(searchParams, new Set());
    return success(context, await rpc(context, "admin_read_overview"), {
      staleAfterSeconds: 30,
    });
  }

  if (route === "/api/search") {
    const values = parseQuery(searchParams, new Set(["q"]));
    const q = textValue(values, "q", { min: 2, max: 100, rejectEmail: true, required: true });
    return success(context, await rpc(context, "admin_read_search", { p_q: q }));
  }

  if (route === "/api/accounts") {
    const values = parseQuery(
      searchParams,
      new Set(["cursor", "direction", "limit", "platform", "q", "sort", "status"]),
    );
    fixedSort(values, "updated_at");
    const limit = limitValue(values);
    const cursor = decodeCursor(values);
    return await list(
      context,
      "admin_read_accounts",
      {
        p_cursor_id: cursor?.id ?? null,
        p_cursor_updated_at: cursor?.timestamp ?? null,
        p_limit: limit + 1,
        p_platform: enumValue(values, "platform", ["all", "compact", "android"]),
        p_q: textValue(values, "q", { max: 100, rejectEmail: true }),
        p_status: enumValue(values, "status", ["all", "active", "banned", "deleted", "risk"]),
      },
      limit,
      "updated_at",
    );
  }

  if (route === "/api/trips") {
    const values = parseQuery(
      searchParams,
      new Set(["cursor", "direction", "integrity", "limit", "q", "sort", "status"]),
    );
    fixedSort(values, "updated_at");
    const limit = limitValue(values);
    const cursor = decodeCursor(values);
    return await list(
      context,
      "admin_read_trips",
      {
        p_cursor_id: cursor?.id ?? null,
        p_cursor_updated_at: cursor?.timestamp ?? null,
        p_integrity: enumValue(values, "integrity", ["all", "healthy", "issue", "invalid_dates"]),
        p_limit: limit + 1,
        p_q: textValue(values, "q", { max: 100 }),
        p_status: enumValue(values, "status", ["all", "open", "past", "archived"]),
      },
      limit,
      "updated_at",
    );
  }

  if (route === "/api/receipts") {
    const values = parseQuery(
      searchParams,
      new Set([
        "cursor",
        "direction",
        "limit",
        "ownerId",
        "q",
        "recordKind",
        "sort",
        "trash",
        "tripId",
        "visibility",
      ]),
    );
    fixedSort(values, "updated_at");
    const limit = limitValue(values);
    const cursor = decodeCursor(values);
    return await list(
      context,
      "admin_read_receipts",
      {
        p_cursor_id: cursor?.id ?? null,
        p_cursor_updated_at: cursor?.timestamp ?? null,
        p_limit: limit + 1,
        p_owner_id: uuidValue(values, "ownerId"),
        p_q: textValue(values, "q", { max: 100 }),
        p_record_kind: enumValue(values, "recordKind", ["all", "expense", "settlement"]),
        p_trash: enumValue(values, "trash", ["active", "trash", "all"]),
        p_trip_id: uuidValue(values, "tripId"),
        p_visibility: enumValue(values, "visibility", ["all", "trip", "private"]),
      },
      limit,
      "updated_at",
    );
  }

  if (route === "/api/incidents") {
    const values = parseQuery(
      searchParams,
      new Set(["cursor", "direction", "limit", "severity", "sort", "status"]),
    );
    fixedSort(values, "created_at");
    const limit = limitValue(values);
    const cursor = decodeCursor(values);
    return await list(
      context,
      "admin_read_incidents",
      {
        p_cursor_created_at: cursor?.timestamp ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_limit: limit + 1,
        p_severity: enumValue(values, "severity", ["all", "P0", "P1", "P2", "P3"]),
        p_status: enumValue(values, "status", ["all", "open", "acknowledged", "resolved"]),
      },
      limit,
      "created_at",
      30,
    );
  }

  if (route === "/api/sync-jobs") {
    const values = parseQuery(
      searchParams,
      new Set(["cursor", "direction", "limit", "provider", "sort", "status", "userId"]),
    );
    fixedSort(values, "updated_at");
    const limit = limitValue(values);
    const cursor = decodeCursor(values);
    return await list(
      context,
      "admin_read_sync_jobs",
      {
        p_cursor_id: cursor?.id ?? null,
        p_cursor_updated_at: cursor?.timestamp ?? null,
        p_limit: limit + 1,
        p_provider: textValue(values, "provider", { max: 40 }),
        p_status: textValue(values, "status", { max: 40 }),
        p_user_id: uuidValue(values, "userId"),
      },
      limit,
      "updated_at",
      30,
    );
  }

  if (route === "/api/integrity") {
    const values = parseQuery(
      searchParams,
      new Set(["cursor", "direction", "findingType", "limit", "severity", "sort"]),
    );
    fixedSort(values, "created_at");
    const limit = limitValue(values);
    const cursor = decodeCursor(values);
    return await list(
      context,
      "admin_read_integrity",
      {
        p_cursor_created_at: cursor?.timestamp ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_finding_type: textValue(values, "findingType", { max: 80 }),
        p_limit: limit + 1,
        p_severity: enumValue(values, "severity", ["all", "high", "medium", "low"]),
      },
      limit,
      "created_at",
      30,
    );
  }

  if (route === "/api/reconciliation") {
    const values = parseQuery(searchParams, new Set(["tripId"]));
    const tripId = uuidValue(values, "tripId", true)!;
    const data = await rpc(context, "admin_read_reconciliation", { p_trip_id: tripId });
    if (data === null) throw new ReadFault("NOT_FOUND", 404, "Trip was not found");
    return success(context, data, { staleAfterSeconds: 30 });
  }

  if (route === "/api/audit") {
    const values = parseQuery(
      searchParams,
      new Set([
        "action",
        "cursor",
        "direction",
        "endAt",
        "limit",
        "requestId",
        "result",
        "risk",
        "sort",
        "startAt",
        "targetId",
        "targetType",
      ]),
    );
    fixedSort(values, "created_at");
    const limit = limitValue(values);
    const cursor = decodeCursor(values);
    return await list(
      context,
      "admin_read_audit",
      {
        p_action: textValue(values, "action", { max: 80 }),
        p_cursor_created_at: cursor?.timestamp ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_end_at: timestampValue(values, "endAt"),
        p_limit: limit + 1,
        p_request_id: textValue(values, "requestId", { max: 80 }),
        p_result: enumValue(values, "result", ["succeeded", "failed"]),
        p_risk: enumValue(values, "risk", ["R0", "R1", "R2", "R3"]),
        p_start_at: timestampValue(values, "startAt"),
        p_target_id: uuidValue(values, "targetId"),
        p_target_type: textValue(values, "targetType", { max: 80 }),
      },
      limit,
      "created_at",
    );
  }

  const installationsMatch = route.match(/^\/api\/accounts\/([^/]+)\/installations$/);
  if (installationsMatch && UUID_RE.test(installationsMatch[1])) {
    parseQuery(searchParams, new Set());
    return success(
      context,
      await rpc(context, "admin_read_account_installations", { p_id: installationsMatch[1] }),
    );
  }

  const accountMatch = route.match(/^\/api\/accounts\/([^/]+)$/);
  if (accountMatch && UUID_RE.test(accountMatch[1])) {
    parseQuery(searchParams, new Set());
    return await detail(context, "admin_read_account", accountMatch[1]);
  }

  const itineraryMatch = route.match(/^\/api\/trips\/([^/]+)\/itinerary$/);
  if (itineraryMatch && UUID_RE.test(itineraryMatch[1])) {
    parseQuery(searchParams, new Set());
    const raw = await rpc(context, "admin_read_trip_itinerary", { p_id: itineraryMatch[1] });
    if (raw === null) throw new ReadFault("NOT_FOUND", 404, "Trip itinerary was not found");
    const normalized = canonicalizeItinerary(raw);
    return success(context, normalized.data, { warnings: normalized.warnings });
  }

  const itineraryVersionsMatch = route.match(/^\/api\/trips\/([^/]+)\/itinerary\/versions$/);
  if (itineraryVersionsMatch && UUID_RE.test(itineraryVersionsMatch[1])) {
    const values = parseQuery(searchParams, new Set(["beforeVersion", "limit"]));
    const limit = limitValue(values);
    const beforeVersionRaw = textValue(values, "beforeVersion", { max: 20 });
    const beforeVersion = beforeVersionRaw === null ? null : Number(beforeVersionRaw);
    if (
      beforeVersionRaw !== null &&
      (!/^[1-9]\d*$/.test(beforeVersionRaw) || !Number.isSafeInteger(beforeVersion))
    ) validation();
    const raw = await rpc(context, "admin_read_trip_itinerary_versions", {
      p_before_version: beforeVersion,
      p_limit: limit,
      p_trip_id: itineraryVersionsMatch[1],
    });
    if (!isRecord(raw) || !Array.isArray(raw.items) || !raw.items.every(isRecord)) {
      throw new ReadFault(
        "UPSTREAM_UNAVAILABLE",
        502,
        "Admin data source returned invalid data",
        true,
      );
    }
    const total = Number(raw.total);
    if (!Number.isInteger(total) || total < 0) {
      throw new ReadFault(
        "UPSTREAM_UNAVAILABLE",
        502,
        "Admin data source returned invalid data",
        true,
      );
    }
    return success(context, { items: raw.items }, { total });
  }

  const tripMatch = route.match(/^\/api\/trips\/([^/]+)$/);
  if (tripMatch && UUID_RE.test(tripMatch[1])) {
    parseQuery(searchParams, new Set());
    return await detail(context, "admin_read_trip", tripMatch[1]);
  }

  const receiptMatch = route.match(/^\/api\/receipts\/([^/]+)$/);
  if (receiptMatch && UUID_RE.test(receiptMatch[1])) {
    parseQuery(searchParams, new Set());
    return await detail(context, "admin_read_receipt", receiptMatch[1]);
  }

  const auditMatch = route.match(/^\/api\/audit\/([^/]+)$/);
  if (auditMatch && UUID_RE.test(auditMatch[1])) {
    parseQuery(searchParams, new Set());
    return await detail(context, "admin_read_audit_event", auditMatch[1]);
  }

  return null;
}

export async function handleAdminReadRoute(context: ReadContext): Promise<AdminReadResult | null> {
  try {
    return await executeRoute(context);
  } catch (error) {
    if (error instanceof ReadFault) return failure(context, error);
    return failure(
      context,
      new ReadFault("INTERNAL_ERROR", 500, "Admin read request failed"),
    );
  }
}
