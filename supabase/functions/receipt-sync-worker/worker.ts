type JsonRecord = Record<string, unknown>;

type WorkerClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

type WorkerEnvironment = {
  brokerKey: string;
  brokerUrl: string;
  deploymentId: string;
  workerSecret: string;
};

type WorkerDependencies = {
  client: WorkerClient;
  env: WorkerEnvironment;
  fetcher?: typeof fetch;
};

type SyncJob = {
  attempts: number;
  databaseRef: string;
  id: string;
  notionOwnerUserId: string;
  notionTripId: string;
  operation: "upsert" | "delete";
  receipt: {
    address: string | null;
    amount: number;
    category: string | null;
    currency: string;
    deletedAt: string | null;
    id: string;
    itemsText: string | null;
    note: string | null;
    paymentMethod: string | null;
    recordDate: string;
    recordKind: string;
    recordTime: string | null;
    sourceId: string;
    store: string;
    version: number;
    visibility: string;
  };
};

type PropertyRef = { name: string; type: string };
type ReceiptSchema = {
  address?: PropertyRef;
  amount?: PropertyRef;
  category?: PropertyRef;
  currency?: PropertyRef;
  date?: PropertyRef;
  items?: PropertyRef;
  note?: PropertyRef;
  objectType?: PropertyRef;
  payment?: PropertyRef;
  sourceId: PropertyRef;
  store: PropertyRef;
  time?: PropertyRef;
  tripId: PropertyRef;
  version?: PropertyRef;
};

const SERVICE = "travel-expense-receipt-sync-worker";
const VERSION = "2026.07.11.1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOTION_ID_RE = /^[0-9a-f]{32}$/i;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const ALIASES = {
  address: ["🗺️ 地址", "地址", "Address", "🗺️ Address"],
  amount: ["金額", "💴 金額 ¥", "Amount", "Price", "Cost", "💰 金額", "💴 Amount"],
  category: ["類別", "🗂 類別", "Category"],
  currency: ["Currency", "幣種"],
  date: ["日期", "📅 日期", "Date", "📅 Date"],
  items: ["品項", "🧾 品項", "Items", "Order", "🧾 Items"],
  note: ["備註", "📝 備註", "Note", "Notes", "Memo", "📝 Note"],
  objectType: ["Object Type", "物件類型"],
  payment: ["支付", "💳 支付", "Payment", "Pay", "💳 Payment"],
  sourceId: ["SourceID", "🔑 SourceID", "Source ID"],
  store: ["店名", "🏪 店名", "Store", "Name"],
  time: ["⏰ 時間", "時間", "Time", "⏰ Time"],
  tripId: ["TripID", "Trip ID"],
  version: ["Receipt Version", "Version"],
} as const;

export class SyncWorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SyncWorkerError";
  }
}

function recordValue(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

function normalizedNotionId(value: unknown): string {
  const normalized = text(value, 80).replace(/-/g, "").toLowerCase();
  if (!NOTION_ID_RE.test(normalized)) {
    throw new SyncWorkerError("NOTION_BINDING_INVALID", "Notion binding is invalid");
  }
  return normalized;
}

function propertyRef(
  properties: JsonRecord,
  aliases: readonly string[],
  allowedTypes: readonly string[],
): PropertyRef | undefined {
  for (const name of aliases) {
    const property = recordValue(properties[name]);
    const type = text(property.type, 32);
    if (allowedTypes.includes(type)) return { name, type };
  }
  return undefined;
}

export function resolveReceiptSchema(database: unknown): ReceiptSchema {
  const properties = recordValue(recordValue(database).properties);
  const sourceId = propertyRef(properties, ALIASES.sourceId, ["rich_text", "title"]);
  const tripId = propertyRef(properties, ALIASES.tripId, ["rich_text", "title"]);
  const namedStore = propertyRef(properties, ALIASES.store, ["title"]);
  const fallbackStore = Object.entries(properties).find(([, property]) =>
    recordValue(property).type === "title"
  );
  const store = namedStore ||
    (fallbackStore ? { name: fallbackStore[0], type: "title" } : undefined);
  if (!sourceId) {
    throw new SyncWorkerError("NOTION_SOURCE_ID_PROPERTY_MISSING", "SourceID property is missing");
  }
  if (!tripId) {
    throw new SyncWorkerError("NOTION_TRIP_ID_PROPERTY_MISSING", "TripID property is missing");
  }
  if (!store) {
    throw new SyncWorkerError("NOTION_TITLE_PROPERTY_MISSING", "Receipt title property is missing");
  }
  return {
    address: propertyRef(properties, ALIASES.address, ["rich_text"]),
    amount: propertyRef(properties, ALIASES.amount, ["number"]),
    category: propertyRef(properties, ALIASES.category, ["select", "rich_text"]),
    currency: propertyRef(properties, ALIASES.currency, ["select", "rich_text"]),
    date: propertyRef(properties, ALIASES.date, ["date"]),
    items: propertyRef(properties, ALIASES.items, ["rich_text"]),
    note: propertyRef(properties, ALIASES.note, ["rich_text"]),
    objectType: propertyRef(properties, ALIASES.objectType, ["select", "rich_text"]),
    payment: propertyRef(properties, ALIASES.payment, ["select", "rich_text"]),
    sourceId,
    store,
    time: propertyRef(properties, ALIASES.time, ["rich_text"]),
    tripId,
    version: propertyRef(properties, ALIASES.version, ["number"]),
  };
}

function textValue(ref: PropertyRef, value: unknown) {
  const content = text(value, 1900);
  if (ref.type === "title") return { title: [{ text: { content } }] };
  if (ref.type === "select") return { select: content ? { name: content.slice(0, 100) } : null };
  return { rich_text: content ? [{ text: { content } }] : [] };
}

function addTextProperty(
  target: JsonRecord,
  ref: PropertyRef | undefined,
  value: unknown,
) {
  if (ref) target[ref.name] = textValue(ref, value);
}

export function buildReceiptProperties(schema: ReceiptSchema, job: SyncJob): JsonRecord {
  const receipt = job.receipt;
  const properties: JsonRecord = {};
  addTextProperty(properties, schema.store, receipt.store || "Unnamed receipt");
  addTextProperty(properties, schema.sourceId, receipt.sourceId);
  addTextProperty(properties, schema.tripId, job.notionTripId);
  addTextProperty(properties, schema.objectType, "receipt");
  addTextProperty(properties, schema.category, receipt.category);
  addTextProperty(properties, schema.payment, receipt.paymentMethod);
  addTextProperty(properties, schema.currency, receipt.currency);
  addTextProperty(properties, schema.time, receipt.recordTime);
  addTextProperty(properties, schema.address, receipt.address);
  addTextProperty(properties, schema.items, receipt.itemsText);
  addTextProperty(properties, schema.note, receipt.note);
  if (schema.amount) properties[schema.amount.name] = { number: Number(receipt.amount) || 0 };
  if (schema.date) properties[schema.date.name] = { date: { start: receipt.recordDate } };
  if (schema.version) properties[schema.version.name] = { number: Number(receipt.version) || 1 };
  return properties;
}

function exactFilter(ref: PropertyRef, value: string) {
  return ref.type === "title"
    ? { property: ref.name, title: { equals: value } }
    : { property: ref.name, rich_text: { equals: value } };
}

function safeError(error: unknown): SyncWorkerError {
  if (error instanceof SyncWorkerError) return error;
  return new SyncWorkerError("NOTION_UPSTREAM_UNAVAILABLE", "Notion is temporarily unavailable");
}

async function responsePayload(response: Response): Promise<JsonRecord> {
  const declared = Number(response.headers.get("Content-Length") || "0");
  if (declared > MAX_RESPONSE_BYTES) {
    throw new SyncWorkerError("NOTION_RESPONSE_TOO_LARGE", "Notion response is too large");
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).length > MAX_RESPONSE_BYTES) {
    throw new SyncWorkerError("NOTION_RESPONSE_TOO_LARGE", "Notion response is too large");
  }
  try {
    return recordValue(body ? JSON.parse(body) : {});
  } catch {
    throw new SyncWorkerError("NOTION_RESPONSE_INVALID", "Notion response is invalid");
  }
}

async function brokerRequest(
  dependencies: WorkerDependencies,
  job: SyncJob,
  path: string,
  method: string,
  body?: unknown,
): Promise<JsonRecord> {
  if (!UUID_RE.test(job.notionOwnerUserId)) {
    throw new SyncWorkerError("NOTION_OWNER_INVALID", "Notion owner is invalid");
  }
  const databaseId = normalizedNotionId(job.databaseRef);
  const endpoint = new URL(
    "/notion/request",
    `${dependencies.env.brokerUrl.replace(/\/+$/, "")}/`,
  );
  if (endpoint.protocol !== "https:") {
    throw new SyncWorkerError("BROKER_URL_INVALID", "Credential Broker URL is invalid");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await (dependencies.fetcher ?? fetch)(endpoint, {
      body: JSON.stringify({
        body,
        databaseId,
        internalUserId: job.notionOwnerUserId,
        method,
        path,
      }),
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://travel-expense-compact.vercel.app",
        "X-Admin-Internal": dependencies.env.brokerKey,
      },
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    throw new SyncWorkerError("NOTION_UPSTREAM_UNAVAILABLE", "Notion is temporarily unavailable");
  } finally {
    clearTimeout(timer);
  }
  const payload = await responsePayload(response);
  if (response.status === 429) {
    throw new SyncWorkerError("NOTION_RATE_LIMITED", "Notion is rate limited");
  }
  if (response.status === 401) {
    throw new SyncWorkerError("NOTION_CREDENTIAL_UNAVAILABLE", "Notion credential is unavailable");
  }
  if (response.status === 403) {
    throw new SyncWorkerError("NOTION_SCOPE_REJECTED", "Notion database scope was rejected");
  }
  if (!response.ok || payload.ok === false) {
    throw new SyncWorkerError("NOTION_REQUEST_FAILED", "Notion request failed");
  }
  return recordValue(payload.data);
}

async function processJob(
  dependencies: WorkerDependencies,
  job: SyncJob,
  schemaCache: Map<string, ReceiptSchema>,
): Promise<{ notionPageId: string | null }> {
  if (
    job.receipt.visibility !== "trip" || !job.receipt.sourceId || !job.notionTripId ||
    job.receipt.recordKind === "settlement" && !job.receipt.store
  ) {
    throw new SyncWorkerError("SYNC_JOB_INVALID", "Receipt sync job is invalid");
  }
  const databaseId = normalizedNotionId(job.databaseRef);
  const schemaKey = `${job.notionOwnerUserId}:${databaseId}`;
  let schema = schemaCache.get(schemaKey);
  if (!schema) {
    schema = resolveReceiptSchema(
      await brokerRequest(dependencies, job, `/databases/${databaseId}`, "GET"),
    );
    schemaCache.set(schemaKey, schema);
  }
  const query = await brokerRequest(
    dependencies,
    job,
    `/databases/${databaseId}/query`,
    "POST",
    {
      filter: {
        and: [
          exactFilter(schema.sourceId, job.receipt.sourceId),
          exactFilter(schema.tripId, job.notionTripId),
        ],
      },
      page_size: 2,
    },
  );
  const pages = Array.isArray(query.results) ? query.results.map(recordValue) : [];
  if (pages.length > 1) {
    throw new SyncWorkerError("NOTION_DUPLICATE_SOURCE", "Notion contains duplicate receipt keys");
  }
  const existingId = pages[0] ? normalizedNotionId(pages[0].id) : null;
  if (job.operation === "delete") {
    if (!existingId) return { notionPageId: null };
    await brokerRequest(dependencies, job, `/pages/${existingId}`, "PATCH", { archived: true });
    return { notionPageId: existingId };
  }
  const properties = buildReceiptProperties(schema, job);
  if (existingId) {
    await brokerRequest(dependencies, job, `/pages/${existingId}`, "PATCH", { properties });
    return { notionPageId: existingId };
  }
  const created = await brokerRequest(dependencies, job, "/pages", "POST", {
    parent: { database_id: databaseId },
    properties,
  });
  return { notionPageId: normalizedNotionId(created.id) };
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return mismatch === 0;
}

function json(status: number, payload: JsonRecord) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizedJob(value: unknown): SyncJob {
  const job = recordValue(value);
  const receipt = recordValue(job.receipt);
  const normalized = {
    attempts: Number(job.attempts || 0),
    databaseRef: text(job.databaseRef, 80),
    id: text(job.id, 36),
    notionOwnerUserId: text(job.notionOwnerUserId, 36),
    notionTripId: text(job.notionTripId, 200),
    operation: text(job.operation, 16),
    receipt: {
      address: text(receipt.address, 1900) || null,
      amount: Number(receipt.amount || 0),
      category: text(receipt.category, 100) || null,
      currency: text(receipt.currency, 16),
      deletedAt: text(receipt.deletedAt, 40) || null,
      id: text(receipt.id, 36),
      itemsText: text(receipt.itemsText, 1900) || null,
      note: text(receipt.note, 1900) || null,
      paymentMethod: text(receipt.paymentMethod, 100) || null,
      recordDate: text(receipt.recordDate, 10),
      recordKind: text(receipt.recordKind, 32),
      recordTime: text(receipt.recordTime, 16) || null,
      sourceId: text(receipt.sourceId, 240),
      store: text(receipt.store, 500),
      version: Number(receipt.version || 1),
      visibility: text(receipt.visibility, 16),
    },
  };
  if (
    !UUID_RE.test(normalized.id) || !UUID_RE.test(normalized.receipt.id) ||
    !["upsert", "delete"].includes(normalized.operation)
  ) {
    throw new SyncWorkerError("SYNC_JOB_INVALID", "Receipt sync job is invalid");
  }
  return normalized as SyncJob;
}

async function finishJob(
  client: WorkerClient,
  workerId: string,
  jobId: string,
  status: "succeeded" | "failed",
  result: { code?: string; message?: string; notionPageId?: string | null },
) {
  const { error } = await client.rpc("finish_receipt_sync_job_worker", {
    p_error_code: status === "failed" ? result.code || "NOTION_SYNC_FAILED" : null,
    p_error_message: status === "failed" ? result.message || "Notion sync failed" : null,
    p_job_id: jobId,
    p_notion_page_id: result.notionPageId || null,
    p_status: status,
    p_worker: workerId,
  });
  if (error) throw new SyncWorkerError("SYNC_RESULT_UNKNOWN", "Sync result could not be stored");
}

export async function handleReceiptSyncRequest(
  request: Request,
  dependencies: WorkerDependencies,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method === "GET") {
    return json(200, { ok: true, requestId, service: SERVICE, version: VERSION });
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "METHOD_NOT_ALLOWED", requestId });
  }
  if (request.headers.has("Origin")) {
    return json(403, { ok: false, error: "BROWSER_REJECTED", requestId });
  }
  const providedSecret = request.headers.get("X-Sync-Worker-Key") || "";
  if (
    dependencies.env.workerSecret.length < 32 ||
    !constantTimeEqual(providedSecret, dependencies.env.workerSecret)
  ) {
    return json(401, { ok: false, error: "UNAUTHORIZED", requestId });
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > 1_024) {
    return json(413, { ok: false, error: "BODY_TOO_LARGE", requestId });
  }
  let body: JsonRecord = {};
  try {
    body = recordValue(rawBody ? JSON.parse(rawBody) : {});
  } catch {
    return json(400, { ok: false, error: "INVALID_JSON", requestId });
  }
  if (Object.keys(body).some((key) => key !== "limit")) {
    return json(400, { ok: false, error: "INVALID_REQUEST", requestId });
  }
  const limit = body.limit === undefined ? 10 : Number(body.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    return json(400, { ok: false, error: "INVALID_LIMIT", requestId });
  }
  const deployment = text(dependencies.env.deploymentId, 48).replace(/[^A-Za-z0-9._:-]/g, "-") ||
    "local000";
  const workerId = `receipt-sync:${deployment}:${requestId.slice(0, 8)}`;
  const claim = await dependencies.client.rpc("claim_receipt_sync_jobs_worker", {
    p_limit: limit,
    p_worker: workerId,
  });
  if (claim.error) {
    return json(503, { ok: false, error: "CLAIM_UNAVAILABLE", requestId });
  }
  const rawJobs = Array.isArray(claim.data) ? claim.data : [];
  const schemaCache = new Map<string, ReceiptSchema>();
  let succeeded = 0;
  let failed = 0;
  let outcomeUnknown = 0;
  let cursor = 0;
  const consume = async () => {
    while (cursor < rawJobs.length) {
      const rawJob = rawJobs[cursor++];
      let job: SyncJob;
      try {
        job = normalizedJob(rawJob);
      } catch (error) {
        const badJob = recordValue(rawJob);
        const jobId = text(badJob.id, 36);
        if (UUID_RE.test(jobId)) {
          try {
            const safe = safeError(error);
            await finishJob(dependencies.client, workerId, jobId, "failed", safe);
            failed += 1;
          } catch {
            outcomeUnknown += 1;
          }
        } else {
          outcomeUnknown += 1;
        }
        continue;
      }
      try {
        const result = await processJob(dependencies, job, schemaCache);
        await finishJob(dependencies.client, workerId, job.id, "succeeded", result);
        succeeded += 1;
      } catch (error) {
        const safe = safeError(error);
        try {
          await finishJob(dependencies.client, workerId, job.id, "failed", safe);
          failed += 1;
        } catch {
          outcomeUnknown += 1;
        }
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(3, Math.max(1, rawJobs.length)) }, () => consume()),
  );
  return json(200, {
    claimed: rawJobs.length,
    failed,
    ok: true,
    outcomeUnknown,
    requestId,
    succeeded,
  });
}
