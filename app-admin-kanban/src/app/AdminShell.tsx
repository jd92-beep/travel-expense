import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  Bot,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  NavLink,
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigate,
} from "react-router";
import { useAdminSession } from "./session";
import { adminGet } from "../lib/api/adminClient";
import type { OperationListData } from "../lib/contracts/admin";
import {
  formatDateTime,
  StatusBadge,
} from "../components/primitives/ConsolePrimitives";

const PRIMARY_NAV = [
  { to: "/overview", match: "/overview", label: "總覽", icon: LayoutDashboard },
  { to: "/data/accounts", match: "/data", label: "資料", icon: Database },
  { to: "/reliability/incidents", match: "/reliability", label: "可靠性", icon: ShieldCheck },
  { to: "/system/providers", match: "/system", label: "AI 與系統", icon: Bot },
  { to: "/audit", match: "/audit", label: "審計紀錄", icon: ScrollText },
];

const MOBILE_NAV = PRIMARY_NAV.slice(0, 3);

function Navigation({ close }: { close?: () => void }) {
  const { pathname } = useLocation();
  return (
    <nav className="primary-nav" aria-label="主要導覽">
      {PRIMARY_NAV.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.match || pathname.startsWith(`${item.match}/`);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={close}
            aria-current={active ? "page" : undefined}
            className={active ? "nav-link active" : "nav-link"}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AdminShell() {
  const { session, logout } = useAdminSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [search, setSearch] = useState("");
  const operations = useQuery({
    queryKey: ["admin", "operations", "activity"],
    queryFn: ({ signal }) =>
      adminGet<OperationListData>(
        "/operations",
        { status: "all", limit: 20 },
        signal,
      ),
    refetchInterval: (query) =>
      query.state.data?.data.items.some((operation) =>
          ["previewed", "authorized", "queued", "executing", "compensating", "outcome_unknown"]
            .includes(operation.status)
        )
        ? 10_000
        : 60_000,
    staleTime: 10_000,
  });
  const operationItems = operations.data?.data.items ?? [];
  const activeCount = operationItems.filter((operation) =>
    ["previewed", "authorized", "queued", "executing", "compensating", "outcome_unknown"]
      .includes(operation.status)
  ).length;

  useEffect(() => {
    setDrawerOpen(false);
    setActivityOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="product-lockup">
          <span className="product-icon">
            <Activity size={21} />
          </span>
          <span>
            <strong>Travel Expense</strong>
            <small>Admin Console</small>
          </span>
        </div>
        <Navigation />
        <div className="sidebar-foot">
          <span className="environment-badge">
            <i />PRODUCTION
          </span>
          <span>Shared Cloud · Compact · Android</span>
        </div>
      </aside>

      {drawerOpen && (
        <button
          className="drawer-scrim"
          aria-label="關閉導覽"
          type="button"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <aside
        className={`mobile-drawer ${drawerOpen ? "open" : ""}`}
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <div className="drawer-head">
          <strong>Travel Expense</strong>
          <button
            className="icon-button activity-trigger"
            type="button"
            title="關閉"
            aria-label="關閉導覽"
            onClick={() => setDrawerOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <Navigation close={() => setDrawerOpen(false)} />
      </aside>

      <div className="shell-main">
        <header className="app-bar">
          <button
            className="icon-button mobile-menu"
            type="button"
            title="導覽"
            aria-label="開啟導覽"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={20} />
          </button>
          <form
            className="global-search"
            onSubmit={(event) => {
              event.preventDefault();
              const q = search.trim();
              if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
            }}
          >
            <Search size={17} />
            <label className="sr-only" htmlFor="admin-global-search">
              搜尋帳戶、行程或收據
            </label>
            <input
              id="admin-global-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜尋帳戶、行程或收據"
              autoComplete="off"
            />
          </form>
          <span className="top-environment">
            <i />Production
          </span>
          <button
            className="icon-button"
            type="button"
            title="Activity Center"
            aria-label="開啟 Activity Center"
            aria-expanded={activityOpen}
            onClick={() => setActivityOpen((value) => !value)}
          >
            <Bell size={18} />
            {activeCount > 0 && <span aria-label={`${activeCount} 個執行中操作`}>{activeCount}</span>}
          </button>
          <div className="session-summary">
            <span>
              <strong>{session?.adminSubject || "Boss"}</strong>
              <small>{session?.authMethod || "passphrase+passkey"}</small>
            </span>
            <button
              className="icon-button"
              type="button"
              title="登出"
              aria-label="登出管理員"
              onClick={() => void logout()}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {activityOpen && (
          <aside className="activity-center" aria-label="Activity Center">
            <header>
              <strong>Activity Center</strong>
              <button
                className="icon-button"
                type="button"
                title="關閉"
                aria-label="關閉 Activity Center"
                onClick={() =>
                  setActivityOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            {operations.isLoading
              ? (
                <div className="state-panel">
                  <Activity className="spin" size={22} />
                  <strong>載入操作狀態</strong>
                </div>
              )
              : operations.isError
              ? (
                <div className="state-panel state-error" role="alert">
                  <strong>未能載入操作狀態</strong>
                  <button className="button secondary" type="button" onClick={() => void operations.refetch()}>
                    重試
                  </button>
                </div>
              )
              : operationItems.length === 0
              ? (
                <div className="state-panel state-empty">
                  <Activity size={22} />
                  <strong>目前沒有管理員操作</strong>
                  <p>新操作會喺呢度顯示 server 驗證狀態。</p>
                </div>
              )
              : (
                <ol className="activity-operation-list">
                  {operationItems.map((operation) => (
                    <li key={operation.id}>
                      <div>
                        <strong>{operation.preview.title || operation.action}</strong>
                        <small>
                          {operation.targetType} · {operation.targetHash.slice(0, 10)}
                        </small>
                        {operation.error && <p>{operation.error.message}</p>}
                      </div>
                      <div>
                        <StatusBadge value={operation.status} />
                        <time>{formatDateTime(operation.updatedAt)}</time>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
          </aside>
        )}

        <main className="workspace" id="main-content">
          <Outlet />
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="流動版主要導覽">
        {MOBILE_NAV.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.match ||
            location.pathname.startsWith(`${item.match}/`);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={active ? "active" : ""}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <button type="button" onClick={() => setDrawerOpen(true)}>
          <Menu size={19} />
          <span>更多</span>
        </button>
      </nav>
      <ScrollRestoration />
    </div>
  );
}
