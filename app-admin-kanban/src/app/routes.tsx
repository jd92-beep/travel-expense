import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router";
import { LoginGate } from "../components/LoginGate";
import { EmptyState } from "../components/primitives/ConsolePrimitives";
import {
  RequireAdminSession,
  SessionBoundaryError,
  SessionSplash,
  useAdminSession,
} from "./session";

// Lazy: the whole protected branch (AdminShell + QueryClientProvider + react-query) stays
// out of the entry chunk; RequireAdminSession below gates it while the session check is
// still pending.
const ProtectedShell = lazy(() => import("./ProtectedShell"));

function LoginRoute() {
  const { checking, retrySession, session, sessionError, setSession } = useAdminSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = typeof location.state === "object" && location.state &&
      "from" in location.state
    ? String(location.state.from)
    : "/overview";
  // Optimistic: render the login form while the session check is still in flight instead of
  // blocking it behind SessionSplash — the check is a serverless roundtrip that 401s for
  // logged-out visitors anyway. The heavy login decorations stay gated behind
  // `active={!checking && !session}` so they never start downloading during the check, and
  // a resolved session still wins via the Navigate below. An auth-state outage keeps the
  // console fail-closed (SessionBoundaryError, no form).
  if (sessionError) return <SessionBoundaryError error={sessionError} retry={retrySession} />;
  if (session) return <Navigate to="/overview" replace />;
  return (
    <LoginGate
      active={!checking && !session}
      onLogin={(value) => {
        setSession(value);
        navigate(from, { replace: true });
      }}
    />
  );
}

function Protected() {
  return (
    <RequireAdminSession>
      <Suspense fallback={<SessionSplash />}>
        <ProtectedShell />
      </Suspense>
    </RequireAdminSession>
  );
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginRoute /> },
  {
    path: "/",
    element: <Protected />,
    hydrateFallbackElement: <SessionSplash />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", lazy: async () => ({ Component: (await import("../features/overview/OverviewPage")).OverviewPage }) },
      { path: "search", lazy: async () => ({ Component: (await import("../features/search/SearchPage")).SearchPage }) },
      { path: "data/accounts", lazy: async () => ({ Component: (await import("../features/data/accounts/AccountsPage")).AccountsPage }) },
      { path: "data/accounts/:accountId", lazy: async () => ({ Component: (await import("../features/data/accounts/AccountsPage")).AccountDetailPage }) },
      { path: "data/trips", lazy: async () => ({ Component: (await import("../features/data/trips/TripsPage")).TripsPage }) },
      { path: "data/trips/:tripId", lazy: async () => ({ Component: (await import("../features/data/trips/TripsPage")).TripDetailPage }) },
      { path: "data/trips/:tripId/itinerary", lazy: async () => ({ Component: (await import("../features/data/trips/TripsPage")).ItineraryPage }) },
      { path: "data/receipts", lazy: async () => ({ Component: (await import("../features/data/receipts/ReceiptsPage")).ReceiptsPage }) },
      { path: "data/receipts/:receiptId", lazy: async () => ({ Component: (await import("../features/data/receipts/ReceiptsPage")).ReceiptDetailPage }) },
      { path: "reliability/incidents", lazy: async () => ({ Component: (await import("../features/reliability/ReliabilityPages")).IncidentsPage }) },
      { path: "reliability/sync", lazy: async () => ({ Component: (await import("../features/reliability/ReliabilityPages")).SyncJobsPage }) },
      { path: "reliability/integrity", lazy: async () => ({ Component: (await import("../features/reliability/ReliabilityPages")).IntegrityPage }) },
      { path: "reliability/reconciliation", lazy: async () => ({ Component: (await import("../features/reliability/ReliabilityPages")).ReconciliationPage }) },
      { path: "system/providers", lazy: async () => ({ Component: (await import("../features/system/SystemPages")).ProvidersPage }) },
      { path: "system/releases", lazy: async () => ({ Component: (await import("../features/system/SystemPages")).ReleasesPage }) },
      { path: "system/infrastructure", lazy: async () => ({ Component: (await import("../features/system/SystemPages")).InfrastructurePage }) },
      { path: "audit", lazy: async () => ({ Component: (await import("../features/audit/AuditPages")).AuditPage }) },
      { path: "audit/:eventId", lazy: async () => ({ Component: (await import("../features/audit/AuditPages")).AuditDetailPage }) },
      {
        path: "*",
        element: (
          <EmptyState
            title="找不到頁面"
            detail="此 route 不存在或已移除。"
            action={
              <Link className="button secondary" to="/overview">返回總覽</Link>
            }
          />
        ),
      },
    ],
  },
]);
