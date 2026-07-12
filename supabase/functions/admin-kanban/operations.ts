import type { SupabaseClient } from "@supabase/supabase-js";

import { providerProbeSucceeded } from "./provider_status.ts";

type AdminClient = SupabaseClient;

export type OperationContext = {
  actor: string;
  brokerKey: string;
  brokerUrl: string;
  client: AdminClient;
  requestId: string;
  sessionHash: string;
};

type OperationResult = Record<string, unknown> & {
  actualModel?: string;
  message?: string;
  status?: string;
  testedAt?: string;
};

export type AdminOperationRecord = {
  action: string;
  createdAt?: string;
  error?: { message?: string } | null;
  id: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
  preview?: Record<string, unknown> & { provider?: string };
  requestId?: string;
  result?: OperationResult | null;
  risk?: string;
  status: string;
  targetHash?: string;
  targetRef?: string;
  targetType?: string;
  updatedAt?: string;
};

type R2CommitEnvelope = {
  expiresAt?: string | null;
  inviteToken?: string;
  operation: AdminOperationRecord;
};

type OperationStartResult =
  | AdminOperationRecord
  | { operation: AdminOperationRecord; reused: true };

export type OperationCommitResult = {
  bundle?: Record<string, unknown>;
  invite?: { expiresAt: string | null; link: string };
  operation: AdminOperationRecord;
  probe?: Record<string, unknown>;
  reused: boolean;
};

type ItineraryHistoryResult = {
  items?: Array<{
    end_date?: string;
    itinerary?: unknown[];
    start_date?: string;
    version?: number;
  }>;
};

type IntegrityReadResult = {
  run?: {
    completed_at?: string;
    completedAt?: string;
    id?: string;
    status?: string;
  } | null;
  state?: string;
};

type PreviewInput = {
  action:
    | "provider_probe"
    | "support_bundle"
    | "retry_sync_job"
    | "cancel_sync_job"
    | "run_integrity_scan"
    | "receipt_amend"
    | "receipt_trash"
    | "receipt_restore"
    | "trip_amend"
    | "itinerary_amend"
    | "itinerary_restore"
    | "member_add"
    | "member_role"
    | "member_remove";
  idempotencyKey: string;
  payload: Record<string, unknown>;
  targetId: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_RE = /^[0-9a-f]{64}$/;
const PROVIDERS = new Set(["notion", "kimi", "google", "weatherapi", "mimo"]);
const ACTIONS = new Set([
  "provider_probe",
  "support_bundle",
  "retry_sync_job",
  "cancel_sync_job",
  "run_integrity_scan",
  "receipt_amend",
  "receipt_trash",
  "receipt_restore",
  "trip_amend",
  "itinerary_amend",
  "itinerary_restore",
  "member_add",
  "member_role",
  "member_remove",
]);
const R2_ACTIONS = new Set([
  "receipt_amend",
  "receipt_trash",
  "receipt_restore",
  "trip_amend",
  "itinerary_amend",
  "itinerary_restore",
  "member_add",
  "member_role",
  "member_remove",
]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_MIME_RE = /^image\/(?:jpeg|png|webp|heic|heif)$/i;

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function detectReceiptPhotoMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand)) {
      return "image/heic";
    }
    if (["mif1", "msf1"].includes(brand)) return "image/heif";
  }
  return null;
}

export function receiptPhotoMimeMatches(declared: string, detected: string) {
  const declaredMime = declared.toLowerCase();
  const detectedMime = detected.toLowerCase();
  if (declaredMime === detectedMime) return true;
  const heifFamily = new Set(["image/heic", "image/heif"]);
  return heifFamily.has(declaredMime) && heifFamily.has(detectedMime);
}

export class AdminOperationError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  retryAfterSeconds?: number;

  constructor(
    code: string,
    message: string,
    status: number,
    options: { retryable?: boolean; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "AdminOperationError";
    this.code = code;
    this.status = status;
    this.retryable = options.retryable === true;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

function objectValue(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminOperationError("VALIDATION_FAILED", message, 400);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>) {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new AdminOperationError("VALIDATION_FAILED", "Operation field is not allowed", 400);
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Operation number is invalid", 400);
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function redact(value: unknown, maxLength = 500): string {
  return String(value || "")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/(?:sk-|ntn_|secret_)[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/[A-Za-z0-9_-]{48,}/g, "[redacted-value]")
    .slice(0, maxLength);
}

export function redactSupportText(value: unknown, maxLength = 220): string {
  return redact(value, maxLength * 2)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]")
    .slice(0, maxLength);
}

function maskEmail(value: unknown): string | null {
  const email = String(value || "").trim();
  const at = email.lastIndexOf("@");
  if (at < 1) return email ? "masked" : null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}

function normalizePreviewInput(body: unknown): PreviewInput {
  const input = objectValue(body, "Operation request must be an object");
  exactKeys(input, new Set(["action", "idempotencyKey", "payload", "targetId"]));
  const action = String(input.action || "") as PreviewInput["action"];
  const idempotencyKey = String(input.idempotencyKey || "");
  const targetId = String(input.targetId || "");
  const payload = input.payload === undefined
    ? {}
    : objectValue(input.payload, "Operation payload must be an object");
  if (!ACTIONS.has(action) || !UUID_RE.test(idempotencyKey)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Operation context is invalid", 400);
  }
  return { action, idempotencyKey, payload, targetId };
}

function rpcResult<T>(result: { data: T | null; error?: unknown }, message: string): T {
  if (result.error) {
    const detail = typeof result.error === "object" && result.error !== null &&
        "message" in result.error
      ? (result.error as { message?: unknown }).message
      : result.error;
    const raw = redact(detail);
    if (/PREVIEW_STALE/i.test(raw)) {
      throw new AdminOperationError("PREVIEW_STALE", "Operation preview is stale", 409);
    }
    if (/MFA_STEP_UP_REQUIRED/i.test(raw)) {
      throw new AdminOperationError(
        "MFA_REQUIRED",
        "Fresh passphrase and passkey approval required",
        403,
      );
    }
    if (/PROTECTED_TARGET|trip owner/i.test(raw)) {
      throw new AdminOperationError(
        "PROTECTED_TARGET",
        "The protected owner target cannot be changed",
        403,
      );
    }
    if (/version conflict/i.test(raw)) {
      throw new AdminOperationError("VERSION_CONFLICT", "The record changed after preview", 409);
    }
    if (/not found/i.test(raw)) {
      throw new AdminOperationError("NOT_FOUND", message, 404);
    }
    if (/eligible|cannot be|expired|executing/i.test(raw)) {
      throw new AdminOperationError("DEPENDENCY_CONFLICT", raw || message, 409);
    }
    if (/active admin session|required|permission/i.test(raw)) {
      throw new AdminOperationError("UNAUTHORIZED", "Admin session is not authorized", 401);
    }
    if (/invalid|required|cannot be amended|already in trash|not in trash/i.test(raw)) {
      throw new AdminOperationError(
        "VALIDATION_FAILED",
        "Operation violates the current data contract",
        422,
      );
    }
    throw new AdminOperationError("INTERNAL_ERROR", message, 500);
  }
  return result.data as T;
}

function integerValue(value: unknown, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new AdminOperationError("VALIDATION_FAILED", `${label} is invalid`, 400);
  }
  return result;
}

function textValue(
  value: unknown,
  label: string,
  options: { allowEmpty?: boolean; max?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new AdminOperationError("VALIDATION_FAILED", `${label} is invalid`, 400);
  }
  const result = value.trim();
  if ((!options.allowEmpty && !result) || result.length > (options.max ?? 200)) {
    throw new AdminOperationError("VALIDATION_FAILED", `${label} is invalid`, 400);
  }
  return result;
}

function expectedVersionPayload(payload: Record<string, unknown>) {
  return integerValue(payload.expectedVersion, "Expected version");
}

async function receiptR2Preview(context: OperationContext, input: PreviewInput) {
  if (!UUID_RE.test(input.targetId)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Receipt target is invalid", 400);
  }
  const allowed = input.action === "receipt_amend"
    ? new Set(["expectedVersion", "patch"])
    : new Set(["expectedVersion"]);
  exactKeys(input.payload, allowed);
  const expectedVersion = expectedVersionPayload(input.payload);
  const { data: receipt, error } = await context.client.from("receipts")
    .select(
      "id,store,record_date,record_time,amount,currency,category,payment_method,record_kind,visibility,split_mode,person_id,beneficiary_id,version,deleted_at,updated_at",
    )
    .eq("id", input.targetId).maybeSingle();
  if (error || !receipt) {
    throw new AdminOperationError("NOT_FOUND", "Receipt was not found", 404);
  }
  if (Number(receipt.version) !== expectedVersion) {
    throw new AdminOperationError("VERSION_CONFLICT", "Receipt version changed", 409);
  }
  const current = {
    amount: Number(receipt.amount),
    category: receipt.category || null,
    currency: String(receipt.currency),
    deletedAt: receipt.deleted_at || null,
    paymentMethod: receipt.payment_method || null,
    recordDate: String(receipt.record_date),
    recordKind: String(receipt.record_kind),
    recordTime: receipt.record_time || null,
    store: String(receipt.store),
    splitMode: String(receipt.split_mode || "shared"),
    version: Number(receipt.version),
    visibility: String(receipt.visibility),
  };
  if (input.action === "receipt_trash" && current.deletedAt) {
    throw new AdminOperationError("DEPENDENCY_CONFLICT", "Receipt is already in Trash", 409);
  }
  if (input.action === "receipt_restore" && !current.deletedAt) {
    throw new AdminOperationError("DEPENDENCY_CONFLICT", "Receipt is not in Trash", 409);
  }
  let payload: Record<string, unknown> = { expectedVersion };
  let proposed: Record<string, unknown> = current;
  let fields: string[] = [];
  if (input.action === "receipt_amend") {
    if (current.deletedAt) {
      throw new AdminOperationError(
        "DEPENDENCY_CONFLICT",
        "Deleted receipt cannot be amended",
        409,
      );
    }
    const patch = objectValue(input.payload.patch, "Receipt amendment is invalid");
    exactKeys(
      patch,
      new Set([
        "amount",
        "category",
        "currency",
        "paymentMethod",
        "recordDate",
        "recordKind",
        "recordTime",
        "store",
        "visibility",
      ]),
    );
    if (Object.keys(patch).length === 0) {
      throw new AdminOperationError("VALIDATION_FAILED", "Receipt amendment is empty", 400);
    }
    const normalized: Record<string, unknown> = {};
    if (patch.store !== undefined) normalized.store = textValue(patch.store, "Store", { max: 300 });
    if (patch.recordDate !== undefined) {
      const date = textValue(patch.recordDate, "Record date", { max: 10 });
      if (!DATE_RE.test(date)) {
        throw new AdminOperationError("VALIDATION_FAILED", "Record date is invalid", 400);
      }
      normalized.recordDate = date;
    }
    if (patch.recordTime !== undefined) {
      const time = patch.recordTime === null
        ? ""
        : textValue(patch.recordTime, "Record time", { allowEmpty: true, max: 8 });
      if (time && !TIME_RE.test(time)) {
        throw new AdminOperationError("VALIDATION_FAILED", "Record time is invalid", 400);
      }
      normalized.recordTime = time;
    }
    if (patch.amount !== undefined) {
      const amount = Number(patch.amount);
      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) {
        throw new AdminOperationError("VALIDATION_FAILED", "Amount is invalid", 400);
      }
      normalized.amount = amount;
    }
    if (patch.currency !== undefined) {
      const currency = textValue(patch.currency, "Currency", { max: 3 }).toUpperCase();
      if (!CURRENCY_RE.test(currency)) {
        throw new AdminOperationError("VALIDATION_FAILED", "Currency is invalid", 400);
      }
      normalized.currency = currency;
    }
    for (const key of ["category", "paymentMethod"] as const) {
      if (patch[key] !== undefined) {
        normalized[key] = patch[key] === null
          ? ""
          : textValue(patch[key], key, { allowEmpty: true, max: 80 });
      }
    }
    if (patch.recordKind !== undefined) {
      const kind = String(patch.recordKind);
      if (!["expense", "settlement"].includes(kind)) {
        throw new AdminOperationError("VALIDATION_FAILED", "Record kind is invalid", 400);
      }
      normalized.recordKind = kind;
    }
    if (patch.visibility !== undefined) {
      const visibility = String(patch.visibility);
      if (!["trip", "private"].includes(visibility)) {
        throw new AdminOperationError("VALIDATION_FAILED", "Visibility is invalid", 400);
      }
      if (
        visibility === "private" && receipt.beneficiary_id &&
        String(receipt.beneficiary_id) !== String(receipt.person_id || "")
      ) {
        throw new AdminOperationError(
          "DEPENDENCY_CONFLICT",
          "Resolve the cross-person beneficiary before making this receipt private",
          409,
        );
      }
      normalized.visibility = visibility;
    }
    proposed = { ...current, ...normalized, version: expectedVersion + 1 };
    if (proposed.visibility === "private") proposed.splitMode = "private";
    if (proposed.recordKind === "settlement") proposed.category = null;
    payload = { expectedVersion, patch: normalized };
    fields = Object.keys(normalized);
  } else {
    proposed = {
      ...current,
      deletedAt: input.action === "receipt_trash" ? "will-be-set" : null,
      version: expectedVersion + 1,
    };
  }
  const title = input.action === "receipt_amend"
    ? "Amend receipt"
    : input.action === "receipt_trash"
    ? "Move receipt to Trash"
    : "Restore receipt";
  return {
    payload,
    preview: {
      affectedCount: 1,
      before: current,
      consequence: input.action === "receipt_amend"
        ? "Updates one canonical receipt and queues its eligible Notion mirror."
        : input.action === "receipt_trash"
        ? "Creates a durable tombstone and queues an eligible Notion archive."
        : "Creates a new active receipt version and queues an eligible Notion upsert.",
      fields,
      proposed,
      rollbackBoundary: input.action === "receipt_trash"
        ? "The receipt remains recoverable from Trash for 30 days."
        : "A later version or explicit restore can supersede this change.",
      title,
    },
    targetRef: input.targetId,
    targetType: "receipt",
    targetVersion: String(receipt.version),
  };
}

async function tripR2Preview(context: OperationContext, input: PreviewInput) {
  if (!UUID_RE.test(input.targetId)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Trip target is invalid", 400);
  }
  exactKeys(input.payload, new Set(["expectedVersion", "patch"]));
  const expectedVersion = expectedVersionPayload(input.payload);
  const patch = objectValue(input.payload.patch, "Trip amendment is invalid");
  exactKeys(
    patch,
    new Set([
      "archived",
      "budgetAmount",
      "budgetCurrency",
      "destinationSummary",
      "homeCurrency",
      "name",
      "tripCurrency",
    ]),
  );
  if (Object.keys(patch).length === 0) {
    throw new AdminOperationError("VALIDATION_FAILED", "Trip amendment is empty", 400);
  }
  const { data: trip, error } = await context.client.from("trips")
    .select(
      "id,name,destination_summary,home_currency,trip_currency,budget_amount,budget_currency,archived,version,updated_at",
    )
    .eq("id", input.targetId).maybeSingle();
  if (error || !trip) throw new AdminOperationError("NOT_FOUND", "Trip was not found", 404);
  if (Number(trip.version) !== expectedVersion) {
    throw new AdminOperationError("VERSION_CONFLICT", "Trip version changed", 409);
  }
  const normalized: Record<string, unknown> = {};
  if (patch.name !== undefined) normalized.name = textValue(patch.name, "Trip name", { max: 160 });
  if (patch.destinationSummary !== undefined) {
    normalized.destinationSummary = patch.destinationSummary === null
      ? null
      : textValue(patch.destinationSummary, "Destination", { allowEmpty: true, max: 240 });
  }
  for (const key of ["homeCurrency", "tripCurrency", "budgetCurrency"] as const) {
    if (patch[key] !== undefined) {
      const currency = textValue(patch[key], key, { max: 3 }).toUpperCase();
      if (!CURRENCY_RE.test(currency)) {
        throw new AdminOperationError("VALIDATION_FAILED", "Trip currency is invalid", 400);
      }
      normalized[key] = currency;
    }
  }
  if (patch.budgetAmount !== undefined) {
    if (patch.budgetAmount === null || patch.budgetAmount === "") normalized.budgetAmount = null;
    else {
      const amount = Number(patch.budgetAmount);
      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) {
        throw new AdminOperationError("VALIDATION_FAILED", "Trip budget is invalid", 400);
      }
      normalized.budgetAmount = amount;
    }
  }
  if (patch.archived !== undefined) {
    if (typeof patch.archived !== "boolean") {
      throw new AdminOperationError("VALIDATION_FAILED", "Archived state is invalid", 400);
    }
    normalized.archived = patch.archived;
  }
  const current = {
    archived: Boolean(trip.archived),
    budgetAmount: trip.budget_amount === null ? null : Number(trip.budget_amount),
    budgetCurrency: trip.budget_currency,
    destinationSummary: trip.destination_summary,
    homeCurrency: trip.home_currency,
    name: trip.name,
    tripCurrency: trip.trip_currency,
    version: Number(trip.version),
  };
  return {
    payload: { expectedVersion, patch: normalized },
    preview: {
      affectedCount: 1,
      before: current,
      consequence: "Updates trip metadata without changing dates or itinerary days.",
      fields: Object.keys(normalized),
      proposed: { ...current, ...normalized, version: expectedVersion + 1 },
      rollbackBoundary: "A later version can supersede this metadata update.",
      title: "Amend trip metadata",
    },
    targetRef: input.targetId,
    targetType: "trip",
    targetVersion: String(trip.version),
  };
}

function inclusiveDates(startDate: string, endDate: string): string[] {
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Itinerary date range is invalid", 400);
  }
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new AdminOperationError("VALIDATION_FAILED", "Itinerary date range is invalid", 400);
  }
  const dates: string[] = [];
  for (let value = start; value <= end; value += 86_400_000) {
    dates.push(new Date(value).toISOString().slice(0, 10));
    if (dates.length > 366) {
      throw new AdminOperationError("VALIDATION_FAILED", "Itinerary range is too large", 400);
    }
  }
  if (dates[0] !== startDate || dates.at(-1) !== endDate) {
    throw new AdminOperationError("VALIDATION_FAILED", "Itinerary date is invalid", 400);
  }
  return dates;
}

function canonicalRemovedDates(value: unknown, requiredDates: string[]): string[] {
  if (!Array.isArray(value) || value.length > 366) {
    throw new AdminOperationError(
      "VALIDATION_FAILED",
      "Itinerary removal manifest is invalid",
      400,
    );
  }
  const seen = new Set<string>();
  const dates = value.map((entry) => {
    const date = textValue(entry, "Removed itinerary date", { max: 10 });
    if (!DATE_RE.test(date) || inclusiveDates(date, date)[0] !== date || seen.has(date)) {
      throw new AdminOperationError(
        "VALIDATION_FAILED",
        "Itinerary removal manifest is invalid",
        400,
      );
    }
    seen.add(date);
    return date;
  }).sort();
  const required = [...requiredDates].sort();
  if (dates.length !== required.length || dates.some((date, index) => date !== required[index])) {
    throw new AdminOperationError(
      "VALIDATION_FAILED",
      "Itinerary date shrink requires explicit removal of every removed date",
      422,
    );
  }
  return dates;
}

function canonicalItineraryPayload(startDate: string, endDate: string, value: unknown) {
  if (!Array.isArray(value)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Itinerary must be an array", 400);
  }
  const expectedDates = inclusiveDates(startDate, endDate);
  if (value.length !== expectedDates.length) {
    throw new AdminOperationError("VALIDATION_FAILED", "Every itinerary day is required", 422);
  }
  const seenDates = new Set<string>();
  const seenSpots = new Set<string>();
  const itinerary = value.map((rawDay, dayIndex) => {
    const day = objectValue(rawDay, "Itinerary day is invalid");
    exactKeys(day, new Set(["date", "location", "notes", "spots", "title"]));
    const date = textValue(day.date, "Itinerary date", { max: 10 });
    if (!DATE_RE.test(date) || date !== expectedDates[dayIndex] || seenDates.has(date)) {
      throw new AdminOperationError("VALIDATION_FAILED", "Itinerary day order is invalid", 422);
    }
    seenDates.add(date);
    if (!Array.isArray(day.spots)) {
      throw new AdminOperationError("VALIDATION_FAILED", "Itinerary spots are invalid", 422);
    }
    const spots = day.spots.map((rawSpot, spotIndex) => {
      const spot = objectValue(rawSpot, "Itinerary spot is invalid");
      exactKeys(spot, new Set(["address", "id", "name", "order", "time"]));
      const id = textValue(spot.id, "Spot ID", { max: 120 });
      const name = textValue(spot.name, "Spot name", { max: 240 });
      if (seenSpots.has(id)) {
        throw new AdminOperationError(
          "VALIDATION_FAILED",
          "A scenery spot appears on more than one day",
          422,
        );
      }
      seenSpots.add(id);
      const time = spot.time === undefined || spot.time === null
        ? undefined
        : textValue(spot.time, "Spot time", { allowEmpty: true, max: 8 });
      if (time && !TIME_RE.test(time)) {
        throw new AdminOperationError("VALIDATION_FAILED", "Spot time is invalid", 422);
      }
      const order = spot.order === undefined ? spotIndex : Number(spot.order);
      if (!Number.isInteger(order) || order < 0 || order > 10_000) {
        throw new AdminOperationError("VALIDATION_FAILED", "Spot order is invalid", 422);
      }
      return {
        id,
        name,
        ...(time ? { time } : {}),
        ...(spot.address === undefined || spot.address === null ? {} : {
          address: textValue(spot.address, "Spot address", {
            allowEmpty: true,
            max: 500,
          }),
        }),
        order,
      };
    });
    return {
      date,
      title: day.title === undefined || day.title === null
        ? `Day ${dayIndex + 1}`
        : textValue(day.title, "Day title", { allowEmpty: true, max: 160 }),
      ...(day.location === undefined || day.location === null ? {} : {
        location: textValue(day.location, "Day location", {
          allowEmpty: true,
          max: 240,
        }),
      }),
      ...(day.notes === undefined || day.notes === null
        ? {}
        : { notes: textValue(day.notes, "Day notes", { allowEmpty: true, max: 1900 }) }),
      spots,
    };
  });
  return { itinerary, spotCount: seenSpots.size };
}

async function itineraryR2Preview(context: OperationContext, input: PreviewInput) {
  if (!UUID_RE.test(input.targetId)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Trip target is invalid", 400);
  }
  const { data: trip, error } = await context.client.from("trips")
    .select("id,name,start_date,end_date,itinerary,itinerary_version,updated_at")
    .eq("id", input.targetId).maybeSingle();
  if (error || !trip) throw new AdminOperationError("NOT_FOUND", "Trip was not found", 404);
  const expectedVersion = expectedVersionPayload(input.payload);
  if (Number(trip.itinerary_version) !== expectedVersion) {
    throw new AdminOperationError("VERSION_CONFLICT", "Itinerary version changed", 409);
  }
  const currentDays = Array.isArray(trip.itinerary) ? trip.itinerary : [];
  if (input.action === "itinerary_restore") {
    exactKeys(input.payload, new Set(["expectedVersion", "restoreVersion"]));
    const restoreVersion = integerValue(input.payload.restoreVersion, "Restore version");
    const history = rpcResult<ItineraryHistoryResult>(
      await context.client.rpc("admin_read_trip_itinerary_versions", {
        p_before_version: restoreVersion + 1,
        p_limit: 1,
        p_trip_id: input.targetId,
      }),
      "Itinerary version could not be loaded",
    );
    const snapshot = Array.isArray(history?.items) ? history.items[0] : null;
    if (!snapshot || Number(snapshot.version) !== restoreVersion) {
      throw new AdminOperationError("NOT_FOUND", "Itinerary version was not found", 404);
    }
    const snapshotDays = Array.isArray(snapshot.itinerary) ? snapshot.itinerary : [];
    return {
      payload: { expectedVersion, restoreVersion },
      preview: {
        affectedCount: snapshotDays.length,
        before: {
          days: currentDays.length,
          endDate: trip.end_date,
          startDate: trip.start_date,
          version: expectedVersion,
        },
        consequence: "Restores a historical itinerary snapshot as a new version.",
        proposed: {
          days: snapshotDays.length,
          endDate: snapshot.end_date,
          restoreVersion,
          startDate: snapshot.start_date,
          version: expectedVersion + 1,
        },
        rollbackBoundary:
          "The current itinerary remains in version history and can be restored later.",
        title: "Restore itinerary version",
      },
      targetRef: input.targetId,
      targetType: "trip",
      targetVersion: String(trip.itinerary_version),
    };
  }
  exactKeys(
    input.payload,
    new Set(["endDate", "expectedVersion", "itinerary", "removedDates", "startDate"]),
  );
  const startDate = textValue(input.payload.startDate, "Start date", { max: 10 });
  const endDate = textValue(input.payload.endDate, "End date", { max: 10 });
  const canonical = canonicalItineraryPayload(startDate, endDate, input.payload.itinerary);
  const proposedDateSet = new Set(inclusiveDates(startDate, endDate));
  const removedDates = canonicalRemovedDates(
    input.payload.removedDates,
    inclusiveDates(String(trip.start_date), String(trip.end_date)).filter((date) =>
      !proposedDateSet.has(date)
    ),
  );
  return {
    payload: {
      endDate,
      expectedVersion,
      itinerary: canonical.itinerary,
      removedDates,
      startDate,
    },
    preview: {
      affectedCount: canonical.itinerary.length,
      before: {
        days: currentDays.length,
        endDate: trip.end_date,
        startDate: trip.start_date,
        version: expectedVersion,
      },
      consequence: "Replaces the canonical inclusive itinerary with a version-checked snapshot.",
      proposed: {
        days: canonical.itinerary.length,
        endDate,
        removedDates,
        spots: canonical.spotCount,
        startDate,
        version: expectedVersion + 1,
      },
      rollbackBoundary: "The previous snapshot remains available in version history.",
      title: "Amend itinerary",
    },
    targetRef: input.targetId,
    targetType: "trip",
    targetVersion: String(trip.itinerary_version),
  };
}

async function userByEmail(context: OperationContext, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await context.client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      throw new AdminOperationError(
        "UPSTREAM_UNAVAILABLE",
        "Account directory is unavailable",
        503,
        {
          retryable: true,
        },
      );
    }
    const users = data?.users || [];
    const match = users.find((user) => String(user.email || "").toLowerCase() === email);
    if (match) return match;
    if (users.length < 1000) break;
  }
  return null;
}

async function membershipR2Preview(context: OperationContext, input: PreviewInput) {
  if (!UUID_RE.test(input.targetId)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Membership target is invalid", 400);
  }
  if (input.action === "member_add") {
    exactKeys(input.payload, new Set(["email", "role"]));
    const email = textValue(input.payload.email, "Email", { max: 254 }).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new AdminOperationError("VALIDATION_FAILED", "Email is invalid", 400);
    }
    const role = String(input.payload.role || "");
    if (!["admin", "editor", "viewer"].includes(role)) {
      throw new AdminOperationError("VALIDATION_FAILED", "Membership role is invalid", 400);
    }
    const [{ data: trip, error: tripError }, user] = await Promise.all([
      context.client.from("trips").select("id,name,owner_id,updated_at").eq("id", input.targetId)
        .maybeSingle(),
      userByEmail(context, email),
    ]);
    if (tripError || !trip) throw new AdminOperationError("NOT_FOUND", "Trip was not found", 404);
    if (!user) {
      const { data: existingInvite, error: inviteError } = await context.client
        .from("trip_invites")
        .select("id,role,status,expires_at,updated_at")
        .eq("trip_id", input.targetId)
        .eq("email_normalized", email)
        .eq("status", "pending")
        .maybeSingle();
      if (inviteError) {
        throw new AdminOperationError(
          "UPSTREAM_UNAVAILABLE",
          "Trip invitation state is unavailable",
          503,
          { retryable: true },
        );
      }
      return {
        payload: { email, role, userId: null },
        preview: {
          affectedCount: 1,
          before: {
            expiresAt: existingInvite?.expires_at || null,
            role: existingInvite?.role || null,
            status: existingInvite?.status || "absent",
          },
          consequence: existingInvite
            ? "Rotates the pending invitation token and refreshes its 14-day expiry."
            : "Creates a 14-day trip invitation link for this unregistered email.",
          identity: maskEmail(email),
          proposed: { role, status: "pending" },
          rollbackBoundary: "The pending invitation can be revoked or replaced before acceptance.",
          title: existingInvite ? "Replace pending trip invitation" : "Create trip invitation",
        },
        targetRef: input.targetId,
        targetType: "trip",
        targetVersion: existingInvite
          ? `invite:${existingInvite.updated_at}`
          : `invite-absent:${trip.updated_at}`,
      };
    }
    if (user.id === trip.owner_id) {
      throw new AdminOperationError(
        "PROTECTED_TARGET",
        "Trip owner membership cannot be changed",
        403,
      );
    }
    const { data: existing, error: memberError } = await context.client.from("trip_members")
      .select("id,role,status,updated_at").eq("trip_id", input.targetId).eq("user_id", user.id)
      .maybeSingle();
    if (memberError) {
      throw new AdminOperationError(
        "UPSTREAM_UNAVAILABLE",
        "Membership state is unavailable",
        503,
        {
          retryable: true,
        },
      );
    }
    return {
      payload: { role, userId: user.id },
      preview: {
        affectedCount: 1,
        before: { role: existing?.role || null, status: existing?.status || "absent" },
        consequence: existing?.status === "removed"
          ? "Reactivates this trip member with the selected role."
          : "Adds or updates one existing account in this trip.",
        identity: maskEmail(user.email),
        proposed: { role, status: "active" },
        rollbackBoundary:
          "The membership can later be removed; owner membership is always protected.",
        title: existing ? "Update trip member" : "Add trip member",
      },
      targetRef: input.targetId,
      targetType: "trip",
      targetVersion: existing ? `member:${existing.updated_at}` : `absent:${trip.updated_at}`,
    };
  }

  exactKeys(
    input.payload,
    input.action === "member_role" ? new Set(["role", "userId"]) : new Set(["userId"]),
  );
  const userId = String(input.payload.userId || "");
  if (!UUID_RE.test(userId)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Membership account is invalid", 400);
  }
  const [{ data: trip, error: tripError }, { data: member, error: memberError }] = await Promise
    .all([
      context.client.from("trips").select("owner_id,name").eq("id", input.targetId).maybeSingle(),
      context.client.from("trip_members")
        .select("id,trip_id,user_id,role,status,updated_at")
        .eq("trip_id", input.targetId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
  if (tripError || !trip) {
    throw new AdminOperationError("NOT_FOUND", "Trip was not found", 404);
  }
  if (memberError || !member) {
    throw new AdminOperationError("NOT_FOUND", "Membership was not found", 404);
  }
  if (member.role === "owner" || member.user_id === trip?.owner_id) {
    throw new AdminOperationError(
      "PROTECTED_TARGET",
      "Trip owner membership cannot be changed",
      403,
    );
  }
  const role = input.action === "member_role" ? String(input.payload.role || "") : member.role;
  if (input.action === "member_role" && !["admin", "editor", "viewer"].includes(role)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Membership role is invalid", 400);
  }
  return {
    payload: input.action === "member_role" ? { role } : {},
    preview: {
      affectedCount: 1,
      before: { role: member.role, status: member.status },
      consequence: input.action === "member_role"
        ? "Changes one active trip member role."
        : "Revokes this account's access to the trip on its next authoritative pull.",
      proposed: input.action === "member_role"
        ? { role, status: "active" }
        : { role: member.role, status: "removed" },
      rollbackBoundary: "A removed member can be reactivated later; owner membership is protected.",
      title: input.action === "member_role" ? "Change member role" : "Remove trip member",
    },
    targetRef: String(member.id),
    targetType: "membership",
    targetVersion: String(member.updated_at),
  };
}

async function syncJobPreview(
  context: OperationContext,
  input: PreviewInput,
) {
  if (!UUID_RE.test(input.targetId) || Object.keys(input.payload).length > 0) {
    throw new AdminOperationError("VALIDATION_FAILED", "Sync job target is invalid", 400);
  }
  const { data: job, error } = await context.client
    .from("receipt_sync_jobs")
    .select(
      "id,provider,operation,status,attempts,next_attempt_at,last_error,updated_at",
    )
    .eq("id", input.targetId)
    .maybeSingle();
  if (error || !job) {
    throw new AdminOperationError("NOT_FOUND", "Sync job was not found", 404);
  }
  const eligible = input.action === "retry_sync_job"
    ? ["failed", "cancelled"].includes(job.status)
    : job.status === "pending";
  if (!eligible) {
    throw new AdminOperationError(
      "DEPENDENCY_CONFLICT",
      input.action === "retry_sync_job"
        ? "This sync job is not eligible for retry"
        : "This sync job is not eligible for cancellation",
      409,
    );
  }
  return {
    payload: { jobId: input.targetId },
    preview: {
      title: input.action === "retry_sync_job" ? "Retry sync job" : "Cancel sync job",
      consequence: input.action === "retry_sync_job"
        ? "Queues this job for one new worker attempt without erasing attempt history."
        : "Cancels this queued job before a worker claims it and marks its receipt mirror as failed.",
      affectedCount: 1,
      provider: job.provider,
      operation: job.operation,
      currentStatus: job.status,
      proposedStatus: input.action === "retry_sync_job" ? "pending" : "cancelled",
      attempts: Number(job.attempts || 0),
      nextAttemptAt: job.next_attempt_at || null,
      rollbackBoundary: "A later retry can resume the Notion mirror job.",
    },
    targetRef: input.targetId,
    targetType: "sync_job",
    targetVersion: String(job.updated_at),
  };
}

async function providerPreview(context: OperationContext, input: PreviewInput) {
  if (!PROVIDERS.has(input.targetId) || Object.keys(input.payload).length > 0) {
    throw new AdminOperationError("VALIDATION_FAILED", "Provider is not allowlisted", 400);
  }
  const operations = rpcResult<AdminOperationRecord[]>(
    await context.client.rpc("admin_operation_list", { p_status: "all", p_limit: 50 }),
    "Provider cooldown could not be checked",
  ) || [];
  const recent = operations.find((operation) =>
    operation.action === "provider_probe" &&
    operation.preview?.provider === input.targetId &&
    operation.idempotencyKey !== input.idempotencyKey &&
    Date.parse(operation.createdAt || "") >= Date.now() - 60_000
  );
  if (recent) {
    throw new AdminOperationError(
      "RATE_LIMITED",
      "This provider was probed less than one minute ago",
      429,
      { retryAfterSeconds: 60 },
    );
  }
  return {
    payload: { provider: input.targetId },
    preview: {
      title: "Probe provider",
      consequence: "Sends one explicit credential test request through the Credential Broker.",
      affectedCount: 1,
      provider: input.targetId,
      cooldownSeconds: 60,
      rollbackBoundary: "The probe does not change provider configuration.",
    },
    targetRef: input.targetId,
    targetType: "provider",
    targetVersion: null,
  };
}

async function supportPreview(context: OperationContext, input: PreviewInput) {
  exactKeys(input.payload, new Set(["includeJobs", "tripId", "userId"]));
  const userId = input.payload.userId === undefined ? null : String(input.payload.userId);
  const tripId = input.payload.tripId === undefined ? null : String(input.payload.tripId);
  if ((userId && !UUID_RE.test(userId)) || (tripId && !UUID_RE.test(tripId))) {
    throw new AdminOperationError("VALIDATION_FAILED", "Support scope is invalid", 400);
  }
  if (input.targetId !== "system" && input.targetId !== userId && input.targetId !== tripId) {
    throw new AdminOperationError(
      "VALIDATION_FAILED",
      "Support target does not match its scope",
      400,
    );
  }
  if (userId) {
    const { data, error } = await context.client.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      throw new AdminOperationError("NOT_FOUND", "Support account was not found", 404);
    }
  }
  if (tripId) {
    const { data, error } = await context.client.from("trips").select("id").eq("id", tripId)
      .maybeSingle();
    if (error || !data) {
      throw new AdminOperationError("NOT_FOUND", "Support trip was not found", 404);
    }
  }
  const payload = { includeJobs: input.payload.includeJobs === true, tripId, userId };
  const targetRef = userId ? `account:${userId}` : tripId ? `trip:${tripId}` : "system";
  return {
    payload,
    preview: {
      title: "Generate redacted support bundle",
      consequence: "Reads a bounded diagnostic snapshot and returns it without persistent storage.",
      affectedCount: Number(Boolean(userId)) + Number(Boolean(tripId)),
      sections: [
        userId ? "account" : null,
        tripId ? "trip" : null,
        payload.includeJobs ? "syncJobs" : null,
        "runtime",
      ]
        .filter(Boolean),
      rowCap: 20,
      redaction: "Email and identifiers are masked; credentials and photo URLs are excluded.",
      rollbackBoundary: "No application data is changed.",
    },
    targetRef,
    targetType: "support_scope",
    targetVersion: null,
  };
}

async function integrityPreview(context: OperationContext, input: PreviewInput) {
  if (input.targetId !== "system" || Object.keys(input.payload).length > 0) {
    throw new AdminOperationError("VALIDATION_FAILED", "Integrity scan target is invalid", 400);
  }
  const latest = rpcResult<IntegrityReadResult>(
    await context.client.rpc("admin_read_integrity", {
      p_cursor_created_at: null,
      p_cursor_id: null,
      p_finding_type: null,
      p_limit: 1,
      p_severity: null,
    }),
    "Integrity scan state could not be loaded",
  );
  if (latest?.state === "running") {
    throw new AdminOperationError(
      "DEPENDENCY_CONFLICT",
      "An integrity scan is already running",
      409,
    );
  }
  const run = latest?.run && typeof latest.run === "object" ? latest.run : null;
  const targetVersion = run
    ? [run.id, run.status, run.completedAt || run.completed_at || ""].join(":")
    : null;
  return {
    payload: {},
    preview: {
      title: "Run data integrity scan",
      consequence:
        "Checks itinerary, receipt, membership, tombstone, Notion and sync invariants and stores a new bounded findings run.",
      affectedCount: 0,
      previousRun: run?.id || null,
      checkVersion: "admin-integrity-v1",
      rollbackBoundary:
        "The scan is read-only for app data; its run and findings remain as audit evidence.",
    },
    targetRef: "system:integrity",
    targetType: "integrity_scan",
    targetVersion,
  };
}

export async function previewAdminOperation(context: OperationContext, body: unknown) {
  const input = normalizePreviewInput(body);
  let resolved;
  if (input.action === "provider_probe") resolved = await providerPreview(context, input);
  else if (input.action === "support_bundle") resolved = await supportPreview(context, input);
  else if (input.action === "run_integrity_scan") resolved = await integrityPreview(context, input);
  else if (["receipt_amend", "receipt_trash", "receipt_restore"].includes(input.action)) {
    resolved = await receiptR2Preview(context, input);
  } else if (input.action === "trip_amend") resolved = await tripR2Preview(context, input);
  else if (["itinerary_amend", "itinerary_restore"].includes(input.action)) {
    resolved = await itineraryR2Preview(context, input);
  } else if (["member_add", "member_role", "member_remove"].includes(input.action)) {
    resolved = await membershipR2Preview(context, input);
  } else resolved = await syncJobPreview(context, input);
  const targetHash = await sha256Hex(resolved.targetRef);
  const payloadHash = await sha256Hex(canonicalJson(resolved.payload));
  const previewHash = await sha256Hex(canonicalJson({
    action: input.action,
    payloadHash,
    preview: resolved.preview,
    targetHash,
    targetVersion: resolved.targetVersion,
  }));
  const previewRpc = R2_ACTIONS.has(input.action)
    ? "admin_operation_preview_r2_create"
    : input.action === "run_integrity_scan"
    ? "admin_operation_preview_integrity_create"
    : "admin_operation_preview_create";
  const previewArgs = R2_ACTIONS.has(input.action)
    ? {
      p_action: input.action,
      p_actor: context.actor,
      p_id: crypto.randomUUID(),
      p_idempotency_key: input.idempotencyKey,
      p_payload: resolved.payload,
      p_payload_hash: payloadHash,
      p_preview: resolved.preview,
      p_preview_hash: previewHash,
      p_request_id: context.requestId,
      p_session_hash: context.sessionHash,
      p_target_hash: targetHash,
      p_target_ref: resolved.targetRef,
      p_target_type: resolved.targetType,
      p_target_version: resolved.targetVersion,
    }
    : input.action === "run_integrity_scan"
    ? {
      p_actor: context.actor,
      p_id: crypto.randomUUID(),
      p_idempotency_key: input.idempotencyKey,
      p_payload_hash: payloadHash,
      p_preview: resolved.preview,
      p_preview_hash: previewHash,
      p_request_id: context.requestId,
      p_session_hash: context.sessionHash,
      p_target_hash: targetHash,
      p_target_version: resolved.targetVersion,
    }
    : {
      p_action: input.action,
      p_actor: context.actor,
      p_id: crypto.randomUUID(),
      p_idempotency_key: input.idempotencyKey,
      p_payload: resolved.payload,
      p_payload_hash: payloadHash,
      p_preview: resolved.preview,
      p_preview_hash: previewHash,
      p_request_id: context.requestId,
      p_risk: "R1",
      p_session_hash: context.sessionHash,
      p_target_hash: targetHash,
      p_target_ref: resolved.targetRef,
      p_target_type: resolved.targetType,
      p_target_version: resolved.targetVersion,
    };
  return rpcResult<AdminOperationRecord>(
    await context.client.rpc(previewRpc, previewArgs),
    "Operation preview could not be stored",
  );
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, redirect: "manual", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeProvider(context: OperationContext, provider: string) {
  if (!PROVIDERS.has(provider) || context.brokerKey.length < 16) {
    throw new AdminOperationError(
      "UPSTREAM_UNAVAILABLE",
      "Credential Broker probe is unavailable",
      503,
      { retryable: true },
    );
  }
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${context.brokerUrl.replace(/\/+$/, "")}/credentials/test?provider=${
        encodeURIComponent(provider)
      }`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://travel-expense-compact.vercel.app",
          "X-Admin-Internal": context.brokerKey,
        },
        body: JSON.stringify({ provider }),
      },
      10_000,
    );
  } catch {
    throw new AdminOperationError(
      "UPSTREAM_UNAVAILABLE",
      "Credential Broker did not respond",
      503,
      { retryable: true },
    );
  }
  const payload = await response.json().catch(() => null);
  if (response.status === 429) {
    const retryAfter = Math.max(1, Number(response.headers.get("retry-after") || "60") || 60);
    throw new AdminOperationError(
      "RATE_LIMITED",
      "Provider probe was rate limited",
      429,
      { retryable: true, retryAfterSeconds: retryAfter },
    );
  }
  if (!providerProbeSucceeded(response.status, payload)) {
    throw new AdminOperationError(
      "UPSTREAM_UNAVAILABLE",
      redact(payload?.status?.message || payload?.error || "Provider probe failed", 220),
      response.ok ? 502 : Math.max(502, response.status),
      { retryable: response.status >= 500 },
    );
  }
  return {
    provider,
    status: String(payload?.status?.status || "healthy"),
    message: redact(payload?.status?.message || "Probe succeeded", 220),
    actualModel: payload?.status?.model ? String(payload.status.model).slice(0, 120) : null,
    testedAt: new Date().toISOString(),
  };
}

async function supportBundle(context: OperationContext, payload: Record<string, unknown>) {
  const userId = payload.userId ? String(payload.userId) : null;
  const tripId = payload.tripId ? String(payload.tripId) : null;
  const bundle: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    runtime: {
      contractVersion: "admin-operation-v1",
      edgeDeployment: Deno.env.get("DENO_DEPLOYMENT_ID") || "unknown",
      edgeSourceSha: Deno.env.get("ADMIN_EDGE_SOURCE_SHA") || "unknown",
      schemaVersion: Deno.env.get("ADMIN_EXPECTED_SCHEMA_VERSION") || "20260712122000",
    },
  };
  const rowCounts: Record<string, number> = {};

  if (userId) {
    const { data, error } = await context.client.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      throw new AdminOperationError("NOT_FOUND", "Support account was not found", 404);
    }
    const user = data.user as typeof data.user & { banned_until?: string | null };
    bundle.account = {
      idHash: await sha256Hex(userId),
      email: maskEmail(user.email),
      createdAt: user.created_at || null,
      lastSignInAt: user.last_sign_in_at || null,
      bannedUntil: user.banned_until || null,
    };
    rowCounts.account = 1;
  }

  if (tripId) {
    const { data, error } = await context.client.from("trips")
      .select("id,name,destination_summary,start_date,end_date,version,archived,updated_at")
      .eq("id", tripId).maybeSingle();
    if (error || !data) {
      throw new AdminOperationError("NOT_FOUND", "Support trip was not found", 404);
    }
    bundle.trip = {
      idHash: await sha256Hex(tripId),
      name: String(data.name || "").slice(0, 160),
      destination: String(data.destination_summary || "").slice(0, 160) || null,
      startDate: data.start_date || null,
      endDate: data.end_date || null,
      version: Number(data.version || 1),
      archived: Boolean(data.archived),
      updatedAt: data.updated_at || null,
    };
    rowCounts.trip = 1;
  }

  if (payload.includeJobs === true) {
    let query = context.client.from("receipt_sync_jobs")
      .select("id,provider,operation,status,attempts,last_error,created_at,updated_at")
      .order("updated_at", { ascending: false }).limit(20);
    if (userId) query = query.eq("owner_id", userId);
    if (tripId) query = query.eq("trip_id", tripId);
    const { data, error } = await query;
    if (error) {
      throw new AdminOperationError(
        "UPSTREAM_UNAVAILABLE",
        "Sync diagnostics are unavailable",
        503,
        {
          retryable: true,
        },
      );
    }
    bundle.syncJobs = await Promise.all((data || []).map(async (job) => ({
      idHash: await sha256Hex(String(job.id)),
      provider: job.provider,
      operation: job.operation,
      status: job.status,
      attempts: Number(job.attempts || 0),
      error: job.last_error ? redactSupportText(job.last_error) : null,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    })));
    rowCounts.syncJobs = (data || []).length;
  }

  const bundleHash = await sha256Hex(canonicalJson(bundle));
  return {
    bundle,
    persistedResult: {
      bundleHash,
      rowCounts,
      sections: Object.keys(bundle),
      stored: false,
    },
  };
}

async function finishExternal(
  context: OperationContext,
  operationId: string,
  status: "completed" | "failed" | "outcome_unknown",
  result: Record<string, unknown> | null,
  error?: AdminOperationError,
) {
  return rpcResult<AdminOperationRecord>(
    await context.client.rpc("admin_operation_finish_external", {
      p_error_code: error?.code || null,
      p_error_message: error?.message || null,
      p_id: operationId,
      p_request_id: context.requestId,
      p_result: result,
      p_status: status,
    }),
    "Operation result could not be verified",
  );
}

export async function commitAdminOperation(
  context: OperationContext,
  operationId: string,
  body: unknown = {},
): Promise<OperationCommitResult> {
  if (!UUID_RE.test(operationId)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Operation ID is invalid", 400);
  }
  const current = rpcResult<AdminOperationRecord>(
    await context.client.rpc("admin_operation_get", { p_id: operationId }),
    "Operation could not be loaded",
  );
  if (!current) throw new AdminOperationError("NOT_FOUND", "Operation was not found", 404);
  if (current.status === "completed") return { operation: current, reused: true };
  const commitInput = objectValue(body, "Operation commit must be an object");
  exactKeys(commitInput, new Set(["grantId"]));

  if (current.risk === "R2") {
    const grantId = String(commitInput.grantId || "");
    if (!UUID_RE.test(grantId)) {
      throw new AdminOperationError(
        "MFA_REQUIRED",
        "Fresh passphrase and passkey approval required",
        403,
      );
    }
    const committed = rpcResult<AdminOperationRecord | R2CommitEnvelope>(
      await context.client.rpc("admin_operation_commit_r2", {
        p_actor: context.actor,
        p_grant_id: grantId,
        p_id: operationId,
        p_request_id: context.requestId,
        p_session_hash: context.sessionHash,
      }),
      "R2 operation could not be committed",
    );
    if ("operation" in committed) {
      if (typeof committed.inviteToken !== "string") {
        throw new AdminOperationError("INTERNAL_ERROR", "Invitation token was not returned", 500);
      }
      const link = `https://travel-expense-compact.vercel.app/#accept-invite?token=${
        encodeURIComponent(committed.inviteToken)
      }`;
      return {
        operation: committed.operation,
        invite: { expiresAt: committed.expiresAt || null, link },
        reused: false,
      };
    }
    return { operation: committed, reused: false };
  }

  if (["retry_sync_job", "cancel_sync_job"].includes(current.action)) {
    const operation = rpcResult<AdminOperationRecord>(
      await context.client.rpc("admin_operation_commit_sync_job", {
        p_actor: context.actor,
        p_id: operationId,
        p_request_id: context.requestId,
        p_session_hash: context.sessionHash,
      }),
      "Sync job operation could not be committed",
    );
    return { operation, reused: false };
  }

  if (current.action === "run_integrity_scan") {
    const operation = rpcResult<AdminOperationRecord>(
      await context.client.rpc("admin_operation_commit_integrity_scan", {
        p_actor: context.actor,
        p_id: operationId,
        p_request_id: context.requestId,
        p_session_hash: context.sessionHash,
      }),
      "Integrity scan could not be committed",
    );
    return { operation, reused: false };
  }

  const started = rpcResult<OperationStartResult>(
    await context.client.rpc("admin_operation_begin_external", {
      p_actor: context.actor,
      p_id: operationId,
      p_request_id: context.requestId,
      p_session_hash: context.sessionHash,
    }),
    "Operation could not start",
  );
  if ("operation" in started) {
    return { operation: started.operation, reused: true };
  }

  try {
    if (started.action === "provider_probe") {
      const result = await probeProvider(context, String(started.targetRef));
      const operation = await finishExternal(context, operationId, "completed", result);
      return { operation, probe: result, reused: false };
    }
    if (started.action === "support_bundle") {
      const generated = await supportBundle(
        context,
        objectValue(started.payload, "Support payload is invalid"),
      );
      const operation = await finishExternal(
        context,
        operationId,
        "completed",
        generated.persistedResult,
      );
      return { operation, bundle: generated.bundle, reused: false };
    }
    throw new AdminOperationError("OPERATION_UNKNOWN", "Operation action is not implemented", 409);
  } catch (error) {
    const known = error instanceof AdminOperationError
      ? error
      : new AdminOperationError("UPSTREAM_UNAVAILABLE", "Operation dependency failed", 503, {
        retryable: true,
      });
    await finishExternal(context, operationId, "failed", null, known).catch(() => null);
    throw known;
  }
}

export async function getAdminOperation(context: OperationContext, operationId: string) {
  if (!UUID_RE.test(operationId)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Operation ID is invalid", 400);
  }
  const operation = rpcResult<AdminOperationRecord>(
    await context.client.rpc("admin_operation_get", { p_id: operationId }),
    "Operation could not be loaded",
  );
  if (!operation) throw new AdminOperationError("NOT_FOUND", "Operation was not found", 404);
  return operation;
}

export async function listAdminOperations(
  context: OperationContext,
  status: string,
  limit: number,
) {
  if (!["active", "terminal", "all"].includes(status) || ![10, 20, 50].includes(limit)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Operation list filter is invalid", 400);
  }
  return rpcResult<AdminOperationRecord[]>(
    await context.client.rpc("admin_operation_list", { p_status: status, p_limit: limit }),
    "Operations could not be loaded",
  ) || [];
}

export async function streamAdminReceiptPhoto(
  context: OperationContext,
  receiptId: string,
): Promise<Response> {
  if (!UUID_RE.test(receiptId)) {
    throw new AdminOperationError("VALIDATION_FAILED", "Receipt ID is invalid", 400);
  }
  const { data: rows, error } = await context.client.from("receipt_photos")
    .select("storage_bucket,storage_path,mime_type,file_size,created_at")
    .eq("receipt_id", receiptId)
    .order("created_at", { ascending: false })
    .limit(1);
  const photo = rows?.[0];
  if (error || !photo) {
    throw new AdminOperationError("NOT_FOUND", "Receipt photo was not found", 404);
  }
  const bucket = String(photo.storage_bucket || "receipt-photos");
  const path = String(photo.storage_path || "");
  const declaredSize = Number(photo.file_size || 0);
  if (
    bucket !== "receipt-photos" || !path || path.startsWith("/") || path.includes("..") ||
    path.length > 512 || (declaredSize && declaredSize > MAX_PHOTO_BYTES)
  ) {
    throw new AdminOperationError("UPSTREAM_UNAVAILABLE", "Receipt photo metadata is invalid", 502);
  }
  const { data: blob, error: downloadError } = await context.client.storage.from(bucket).download(
    path,
  );
  if (downloadError || !blob) {
    throw new AdminOperationError(
      "UPSTREAM_UNAVAILABLE",
      "Receipt photo could not be loaded",
      502,
      { retryable: true },
    );
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const declaredContentType = String(photo.mime_type || blob.type || "").split(";")[0].trim()
    .toLowerCase();
  const detectedContentType = detectReceiptPhotoMime(bytes);
  if (
    !PHOTO_MIME_RE.test(declaredContentType) || !detectedContentType ||
    !receiptPhotoMimeMatches(declaredContentType, detectedContentType) || bytes.length === 0 ||
    bytes.length > MAX_PHOTO_BYTES
  ) {
    throw new AdminOperationError("UPSTREAM_UNAVAILABLE", "Receipt photo content is invalid", 502);
  }
  const receiptHash = await sha256Hex(receiptId);
  if (!HASH_RE.test(receiptHash)) {
    throw new AdminOperationError("INTERNAL_ERROR", "Receipt audit hash failed", 500);
  }
  rpcResult(
    await context.client.rpc("admin_audit_record_photo_view", {
      p_actor: context.actor,
      p_receipt_hash: receiptHash,
      p_request_id: context.requestId,
      p_session_hash: context.sessionHash,
    }),
    "Receipt photo audit failed",
  );
  return new Response(bytes, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": "inline",
      "Content-Length": String(bytes.length),
      "Content-Type": detectedContentType,
      "X-Admin-Request-Id": context.requestId,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
