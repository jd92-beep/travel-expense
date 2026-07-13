import { AdminApiError } from "../adminApi";
import type { AdminEnvelope } from "../contracts/admin";

type QueryValue = string | number | boolean | null | undefined;

function buildQuery(values?: Record<string, QueryValue>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export async function adminGet<T>(
  path: string,
  query?: Record<string, QueryValue>,
  signal?: AbortSignal,
): Promise<AdminEnvelope<T>> {
  const response = await fetch(`/api/admin${path}${buildQuery(query)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const text = await response.text();
  let payload: any;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new AdminApiError(
      "伺服器回應格式無效",
      "UPSTREAM_UNAVAILABLE",
      response.status || 502,
      response.headers.get("x-admin-request-id") || undefined,
    );
  }

  if (!response.ok || payload?.ok !== true) {
    const error = payload?.error;
    const apiError = new AdminApiError(
      error?.message || "管理員 API 暫時不可用",
      error?.code || "UPSTREAM_UNAVAILABLE",
      response.status || 500,
      payload?.meta?.requestId || response.headers.get("x-admin-request-id") ||
        undefined,
      error?.retryAfterSeconds,
    );
    if (apiError.status === 401) {
      window.dispatchEvent(new Event("admin:unauthorized"));
    }
    throw apiError;
  }
  return payload as AdminEnvelope<T>;
}

function readableCookie(name: string) {
  const prefix = `${name}=`;
  for (const item of document.cookie.split(";")) {
    const cookie = item.trim();
    if (cookie.startsWith(prefix)) {
      return decodeURIComponent(cookie.slice(prefix.length));
    }
  }
  return "";
}

export async function adminPost<T>(
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<AdminEnvelope<T>> {
  const csrf = readableCookie("__Host-admin_csrf");
  if (!csrf) {
    throw new AdminApiError("管理員 CSRF session 已失效", "CSRF_REJECTED", 403);
  }
  const response = await fetch(`/api/admin${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Admin-CSRF": csrf,
    },
    body: JSON.stringify(body),
    signal,
  });
  const text = await response.text();
  let payload: any;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new AdminApiError(
      "伺服器回應格式無效",
      "UPSTREAM_UNAVAILABLE",
      response.status || 502,
      response.headers.get("x-admin-request-id") || undefined,
    );
  }
  if (!response.ok || payload?.ok !== true) {
    const error = payload?.error;
    const apiError = new AdminApiError(
      error?.message || "管理員操作暫時不可用",
      error?.code || "UPSTREAM_UNAVAILABLE",
      response.status || 500,
      payload?.meta?.requestId || response.headers.get("x-admin-request-id") ||
        undefined,
      error?.retryAfterSeconds,
    );
    if (apiError.status === 401) {
      window.dispatchEvent(new Event("admin:unauthorized"));
    }
    throw apiError;
  }
  return payload as AdminEnvelope<T>;
}

export function queryFromSearchParams(
  searchParams: URLSearchParams,
  allowed: string[],
) {
  const query: Record<string, string> = {};
  for (const key of allowed) {
    const value = searchParams.get(key);
    if (value) query[key] = value;
  }
  return query;
}
