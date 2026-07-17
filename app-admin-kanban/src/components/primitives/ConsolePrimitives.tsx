import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info,
  RefreshCw,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { motion } from "motion/react";
import { AdminApiError } from "../../lib/adminApi";
import type { AdminMeta } from "../../lib/contracts/admin";
import { NavLink, useNavigate } from "react-router";
import { useEffectsTier } from "../../lib/performance";
import { NumberTicker } from "../fx/NumberTicker";
import { BlurFade } from "../fx/BlurFade";

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
    <header className="page-header" data-augmented-ui="tl-clip br-clip border">
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
  const tier = useEffectsTier();
  return (
    <nav className="workspace-nav" aria-label="工作區導覽">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => isActive ? "active" : ""}
        >
          {({ isActive }) => (
            <>
              {item.label}
              {isActive && tier !== "lite" && (
                <motion.span
                  layoutId="workspace-active"
                  className="workspace-nav-underline"
                  aria-hidden="true"
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </>
          )}
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
  if (!meta) return null;
  const { partial, stale } = adminMetaState(meta);
  return (
    <div
      className={`freshness-banner hud-corners ${
        stale || partial ? "freshness-warning" : ""
      }`}
      role={stale || partial ? "status" : undefined}
    >
      <span>
        {fetching
          ? <RefreshCw className="spin" size={15} />
          : stale || partial
          ? <TriangleAlert size={15} />
          : <CheckCircle2 size={15} />}
        {placeholder
          ? "正在更新，暫時顯示上一頁資料"
          : fetching
          ? "正在更新資料"
          : stale
          ? "資料已過期，寫入操作已停用"
          : partial
          ? "部分資料來源不可用，寫入操作已停用"
          : "資料已更新"}
      </span>
      <span>
        產生時間 {formatDateTime(meta.generatedAt)} · Request{" "}
        {meta.requestId.slice(0, 8)}
      </span>
    </div>
  );
}

export function adminMetaState(meta: AdminMeta, now = Date.now()) {
  const generatedAt = Date.parse(meta.generatedAt);
  const staleAfter = Math.max(1, meta.staleAfterSeconds ?? 60) * 1000;
  const age = now - generatedAt;
  const stale = !Number.isFinite(generatedAt) || age > staleAfter || age < -60_000;
  const sources = Object.values(meta.sources ?? {});
  const partial = sources.length === 0 || sources.some((source) => source !== "live") ||
    meta.warnings.length > 0;
  return { partial, stale };
}

export function adminMetaAllowsMutation(
  meta: AdminMeta,
  fetching: boolean,
  online = typeof navigator !== "undefined" && navigator.onLine,
) {
  if (fetching || !online) return false;
  const { partial, stale } = adminMetaState(meta);
  return !partial && !stale;
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function useCursorPagination(
  searchParams: URLSearchParams,
  setSearchParams: (next: URLSearchParams) => void,
) {
  const navigate = useNavigate();
  const history = useRef<string[]>([]);
  const cursor = searchParams.get("cursor") || "";

  return {
    hasCursor: Boolean(cursor),
    next: (nextCursor: string) => {
      history.current.push(cursor);
      const next = new URLSearchParams(searchParams);
      next.set("cursor", nextCursor);
      setSearchParams(next);
    },
    previous: () => {
      if (history.current.length > 0) {
        history.current.pop();
        navigate(-1);
        return;
      }
      const next = new URLSearchParams(searchParams);
      next.delete("cursor");
      setSearchParams(next);
    },
  };
}

export function LoadingState({ label = "載入資料" }: { label?: string }) {
  return (
    <div className="state-panel" aria-live="polite">
      <div className="skeleton-stack" aria-hidden="true">
        <span className="shimmer-bar skeleton-bar" style={{ width: "78%" }} />
        <span className="shimmer-bar skeleton-bar" style={{ width: "52%" }} />
        <span className="shimmer-bar skeleton-bar" style={{ width: "64%" }} />
      </div>
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
  { label, value, tone = "neutral", delay = 0 }: {
    label: string;
    value: string | number;
    tone?: string;
    delay?: number;
  },
) {
  const numericValue = typeof value === "number"
    ? (Number.isFinite(value) ? value : null)
    : (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
    ? Number(value)
    : null;
  return (
    // BlurFade is the root element itself (not a wrapper around a separate div) so
    // .metric-block stays a direct child of .metric-strip — that preserves the grid
    // item count. Each metric now renders as its own chamfered HUD readout module
    // (metric-strip switched to a gapped grid — see components.css).
    <BlurFade
      className={`metric-block metric-${tone}`}
      delay={delay}
      augmentedUi="tl-clip br-clip border"
    >
      <span>{label}</span>
      <strong>{numericValue !== null ? <NumberTicker value={numericValue} /> : value}</strong>
    </BlurFade>
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
