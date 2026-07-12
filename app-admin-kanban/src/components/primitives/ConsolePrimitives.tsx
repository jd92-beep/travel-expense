import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { AdminApiError } from "../../lib/adminApi";
import type { AdminMeta } from "../../lib/contracts/admin";
import { NavLink } from "react-router";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function WorkspaceNav(
  { items }: { items: Array<{ to: string; label: string }> },
) {
  return (
    <nav className="workspace-nav" aria-label="工作區導覽">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => isActive ? "active" : ""}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

const HEALTHY = new Set([
  "healthy",
  "active",
  "connected",
  "completed",
  "succeeded",
  "no_issues",
  "live",
  "matched",
]);
const DANGER = new Set([
  "danger",
  "error",
  "failed",
  "P0",
  "P1",
  "issue",
  "invalid",
  "deleted",
  "failed_manual",
  "partially_failed",
  "blocked",
  "duplicate_in_notion",
  "duplicate_in_supabase",
  "missing_in_notion",
  "unavailable",
]);
const WARNING = new Set([
  "warning",
  "stale",
  "degraded",
  "pending",
  "processing",
  "previewed",
  "authorized",
  "queued",
  "executing",
  "compensating",
  "outcome_unknown",
  "expired",
  "risk",
  "unknown",
  "notion_only",
  "partial",
]);

export function StatusBadge(
  { value, label }: { value: string | null | undefined; label?: string },
) {
  const normalized = value || "unknown";
  const tone = HEALTHY.has(normalized)
    ? "success"
    : DANGER.has(normalized)
    ? "danger"
    : WARNING.has(normalized)
    ? "warning"
    : "neutral";
  const Icon = tone === "success"
    ? CheckCircle2
    : tone === "danger"
    ? AlertCircle
    : tone === "warning"
    ? TriangleAlert
    : Info;
  return (
    <span className={`status-badge status-${tone}`}>
      <Icon size={13} />
      {label || normalized}
    </span>
  );
}

export function FreshnessBanner({
  meta,
  fetching,
  placeholder,
}: {
  meta?: AdminMeta;
  fetching?: boolean;
  placeholder?: boolean;
}) {
  const staleAfter = (meta?.staleAfterSeconds ?? 60) * 1000;
  const generatedAt = meta?.generatedAt ? Date.parse(meta.generatedAt) : 0;
  const stale = generatedAt > 0 && Date.now() - generatedAt > staleAfter;
  const unavailable = Object.values(meta?.sources ?? {}).some((value) =>
    value === "unavailable"
  );
  const partial = unavailable || (meta?.warnings.length ?? 0) > 0;
  if (!meta) return null;
  return (
    <div
      className={`freshness-banner ${
        stale || partial ? "freshness-warning" : ""
      }`}
      role={partial ? "status" : undefined}
    >
      <span>
        {fetching
          ? <RefreshCw className="spin" size={15} />
          : stale
          ? <TriangleAlert size={15} />
          : <CheckCircle2 size={15} />}
        {placeholder
          ? "正在更新，暫時顯示上一頁資料"
          : fetching
          ? "正在更新資料"
          : stale
          ? "資料已過期，寫入操作已停用"
          : partial
          ? "部分資料來源需要注意"
          : "資料已更新"}
      </span>
      <span>
        產生時間 {formatDateTime(meta.generatedAt)} · Request{" "}
        {meta.requestId.slice(0, 8)}
      </span>
    </div>
  );
}

export function LoadingState({ label = "載入資料" }: { label?: string }) {
  return (
    <div className="state-panel" aria-live="polite">
      <LoaderCircle className="spin" size={22} />
      <strong>{label}</strong>
    </div>
  );
}

export function ErrorState(
  { error, retry }: { error: unknown; retry?: () => void },
) {
  const apiError = error instanceof AdminApiError ? error : null;
  const offline = !navigator.onLine;
  return (
    <div className="state-panel state-error" role="alert">
      {offline ? <WifiOff size={24} /> : <AlertCircle size={24} />}
      <strong>{offline ? "目前離線" : "未能載入資料"}</strong>
      <p>{apiError?.message || "管理員服務暫時不可用。"}</p>
      {apiError && (
        <code>{apiError.code} · {apiError.requestId || "no-request-id"}</code>
      )}
      {retry && (
        <button className="button secondary" type="button" onClick={retry}>
          <RefreshCw size={15} />重試
        </button>
      )}
    </div>
  );
}

export function EmptyState(
  { title, detail }: { title: string; detail?: string },
) {
  return (
    <div className="state-panel state-empty">
      <CheckCircle2 size={24} />
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
    </div>
  );
}

export function Pagination({
  hasCursor,
  nextCursor,
  onPrevious,
  onNext,
  disabled,
}: {
  hasCursor: boolean;
  nextCursor?: string;
  onPrevious: () => void;
  onNext: (cursor: string) => void;
  disabled?: boolean;
}) {
  return (
    <nav className="pagination" aria-label="分頁">
      <button
        className="icon-button"
        type="button"
        title="上一頁"
        aria-label="上一頁"
        disabled={!hasCursor || disabled}
        onClick={onPrevious}
      >
        <ArrowLeft size={18} />
      </button>
      <span>{hasCursor ? "目前為後續頁" : "第 1 頁"}</span>
      <button
        className="icon-button"
        type="button"
        title="下一頁"
        aria-label="下一頁"
        disabled={!nextCursor || disabled}
        onClick={() => nextCursor && onNext(nextCursor)}
      >
        <ArrowRight size={18} />
      </button>
    </nav>
  );
}

export function Metric(
  { label, value, tone = "neutral" }: {
    label: string;
    value: string | number;
    tone?: string;
  },
) {
  return (
    <div className={`metric-block metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "未有資料";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(date);
}

export function formatMoney(
  amount: number | string | null | undefined,
  currency?: string | null,
) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "未有金額";
  try {
    return new Intl.NumberFormat("zh-HK", {
      style: "currency",
      currency: currency || "HKD",
    }).format(numeric);
  } catch {
    return `${numeric.toLocaleString("zh-HK")} ${currency || ""}`.trim();
  }
}

export function safeText(value: unknown, fallback = "未有資料") {
  return typeof value === "string" && value.trim() ? value : fallback;
}
