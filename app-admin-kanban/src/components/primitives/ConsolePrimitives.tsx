import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronsLeft,
  Inbox,
  Info,
  RefreshCw,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { AdminApiError } from "../../lib/adminApi";
import type { AdminMeta } from "../../lib/contracts/admin";
import { Link, NavLink, useLocation } from "react-router";
import { useEffectsTier } from "../../lib/performance";
import { NumberTicker } from "../fx/NumberTicker";
import { BlurFade } from "../fx/BlurFade";

export function Breadcrumbs(
  { items }: { items: Array<{ label: string; to?: string }> },
) {
  return (
    <nav className="breadcrumbs" aria-label="麵包屑">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`}>
            {item.to && !last
              ? <Link to={item.to}>{item.label}</Link>
              : <span aria-current={last ? "page" : undefined}>{item.label}</span>}
            {!last && <span className="breadcrumb-sep" aria-hidden="true">/</span>}
          </span>
        );
      })}
    </nav>
  );
}

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
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  // Ex-layoutId: ONE underline per nav, positioned by the active link's layout offsets and
  // flown between tabs by the CSS left/width transition on .workspace-nav-underline. It
  // mounts only after the first measurement so there is no spurious 0→measured animation,
  // and a ResizeObserver re-measures when the nav's geometry changes without a navigation
  // (viewport reflow, grid re-flow on mobile, font load shifting tab widths).
  const [underline, setUnderline] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const active = nav.querySelector<HTMLAnchorElement>("a.active");
      setUnderline(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [location.pathname, items]);

  return (
    <nav ref={navRef} className="workspace-nav" aria-label="工作區導覽">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => isActive ? "active" : ""}
        >
          {item.label}
        </NavLink>
      ))}
      {tier !== "lite" && underline && (
        <span
          className="workspace-nav-underline"
          aria-hidden="true"
          style={{ left: underline.left, width: underline.width }}
        />
      )}
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
  "P2",
  "awaiting_heartbeat",
]);

const STATUS_LABELS: Record<string, string> = {
  outcome_unknown: "結果待確認",
  partially_failed: "部分失敗",
  failed_manual: "需人工處理",
  notion_only: "僅 Notion",
  previewed: "已預覽",
  authorized: "已授權",
  queued: "排隊中",
  executing: "執行中",
  compensating: "補償中",
  completed: "已完成",
  failed: "失敗",
  cancelled: "已取消",
  expired: "已過期",
  pending: "待處理",
  processing: "處理中",
  succeeded: "成功",
  healthy: "健康",
  active: "啟用",
  connected: "已連線",
  stale: "過期",
  degraded: "降級",
  unavailable: "不可用",
  awaiting_heartbeat: "待首次心跳",
  no_issues: "沒有問題",
  matched: "一致",
  blocked: "缺少識別資料",
  risk: "風險",
  deleted: "已刪除",
  issue: "有問題",
  invalid: "無效",
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3",
};

const SEVERITY = new Set(["P0", "P1", "P2", "P3"]);

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
  const text = label || STATUS_LABELS[normalized] || "未知狀態";
  return (
    <span className={`status-badge status-${tone}${SEVERITY.has(normalized) ? " status-severity" : ""}`}>
      <Icon size={13} />
      {text}
    </span>
  );
}

function blockingSourceLabels(meta: AdminMeta) {
  const labels: string[] = [];
  for (const [key, state] of Object.entries(meta.sources ?? {})) {
    if (state !== "live") labels.push(key);
  }
  if (meta.warnings.length > 0) labels.push("warnings");
  return labels;
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
  const blockers = partial ? blockingSourceLabels(meta) : [];
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
          ? `部分資料來源不可用（${blockers.join("、") || "unknown"}），寫入操作已停用`
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

type CursorStackSnapshot = { stack: string[]; cursor: string };

function readCursorStack(storageKey?: string): CursorStackSnapshot | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`admin-cursor-stack:${storageKey}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed && typeof parsed === "object" &&
      Array.isArray((parsed as CursorStackSnapshot).stack) &&
      typeof (parsed as CursorStackSnapshot).cursor === "string"
    ) {
      return parsed as CursorStackSnapshot;
    }
  } catch {
    // Corrupt or unavailable sessionStorage: fall back to an in-memory stack.
  }
  return null;
}

export function useCursorPagination(
  searchParams: URLSearchParams,
  setSearchParams: (next: URLSearchParams) => void,
  storageKey?: string,
) {
  // Never navigate(-1): a remount or external back-entry desyncs the ref stack
  // and can eject the operator out of the SPA. Restore the previous cursor from
  // this mount's stack, or fall back to page 1. With a storageKey the stack
  // survives refresh/back within the tab (sessionStorage); a snapshot whose
  // cursor no longer matches the URL (e.g. a shared direct link) resets so
  // previous-page always lands on a page this tab actually visited.
  const cursor = searchParams.get("cursor") || "";
  const history = useRef<CursorStackSnapshot | null>(null);
  if (history.current === null) {
    const snapshot = readCursorStack(storageKey);
    history.current = snapshot && snapshot.cursor === cursor
      ? snapshot
      : { stack: [], cursor };
  }
  const persist = () => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        `admin-cursor-stack:${storageKey}`,
        JSON.stringify(history.current),
      );
    } catch {
      // Storage full or blocked: pagination keeps working in-memory.
    }
  };
  return {
    hasCursor: Boolean(cursor),
    first: () => {
      history.current = { stack: [], cursor: "" };
      const next = new URLSearchParams(searchParams);
      next.delete("cursor");
      setSearchParams(next);
      persist();
    },
    next: (nextCursor: string) => {
      history.current = {
        stack: [...history.current!.stack, cursor],
        cursor: nextCursor,
      };
      const next = new URLSearchParams(searchParams);
      next.set("cursor", nextCursor);
      setSearchParams(next);
      persist();
    },
    previous: () => {
      const stack = history.current!.stack;
      const previousCursor = stack[stack.length - 1] || "";
      history.current = { stack: stack.slice(0, -1), cursor: previousCursor };
      const next = new URLSearchParams(searchParams);
      if (previousCursor) next.set("cursor", previousCursor);
      else next.delete("cursor");
      setSearchParams(next);
      persist();
    },
  };
}

/**
 * Short zh-HK reason a canonical write is disabled, for the
 * data-disabled-reason tooltip contract. Returns undefined when writes are
 * allowed (callers then omit the attribute entirely).
 */
export function adminMutationDisabledReason(options: {
  meta?: AdminMeta;
  fetching: boolean;
  online: boolean;
  canWrite: boolean;
  policyLabel?: string;
}) {
  if (!options.canWrite) return options.policyLabel || "寫入操作已停用";
  if (!options.online) return "目前離線；寫入操作已停用";
  if (options.fetching) return "正在更新資料，請稍後";
  if (options.meta) {
    const { stale, partial } = adminMetaState(options.meta);
    if (stale) return "資料已過期；寫入操作已停用";
    if (partial) return "部分資料來源不可用；寫入操作已停用";
  }
  return undefined;
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
  { title, detail, action }: { title: string; detail?: string; action?: ReactNode },
) {
  return (
    <div className="state-panel state-empty">
      <Inbox size={24} />
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}

export function Pagination({
  hasCursor,
  nextCursor,
  onPrevious,
  onNext,
  onFirst,
  disabled,
}: {
  hasCursor: boolean;
  nextCursor?: string;
  onPrevious: () => void;
  onNext: (cursor: string) => void;
  onFirst?: () => void;
  disabled?: boolean;
}) {
  return (
    <nav className="pagination" aria-label="分頁">
      {onFirst && hasCursor && (
        <button
          className="icon-button"
          type="button"
          title="回第一頁"
          aria-label="回第一頁"
          disabled={disabled}
          onClick={onFirst}
        >
          <ChevronsLeft size={18} />
        </button>
      )}
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
  { label, value, tone = "neutral", delay = 0, href }: {
    label: string;
    value: string | number;
    tone?: string;
    delay?: number;
    href?: string;
  },
) {
  const numericValue = typeof value === "number"
    ? (Number.isFinite(value) ? value : null)
    : (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
    ? Number(value)
    : null;
  const content = (
    <>
      <span>{label}</span>
      <strong>{numericValue !== null ? <NumberTicker value={numericValue} /> : value}</strong>
    </>
  );
  if (href) {
    return (
      <BlurFade
        className={`metric-block metric-${tone}`}
        delay={delay}
      >
        <Link className="metric-link" to={href}>{content}</Link>
      </BlurFade>
    );
  }
  return (
    <BlurFade
      className={`metric-block metric-${tone}`}
      delay={delay}
    >
      {content}
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
  if (amount === null || amount === undefined || amount === "") return "未有金額";
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
