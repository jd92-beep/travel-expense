import {
  createBrowserRouter,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router";
import { LoginGate } from "../components/LoginGate";
import { EmptyState } from "../components/primitives/ConsolePrimitives";
import { AdminShell } from "./AdminShell";
import {
  RequireAdminSession,
  SessionBoundaryError,
  SessionSplash,
  useAdminSession,
} from "./session";

function LoginRoute() {
  const { checking, retrySession, session, sessionError, setSession } = useAdminSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = typeof location.state === "object" && location.state &&
      "from" in location.state
    ? String(location.state.from)
    : "/overview";
  if (checking) return <SessionSplash />;
  if (sessionError) return <SessionBoundaryError error={sessionError} retry={retrySession} />;
  if (session) return <Navigate to="/overview" replace />;
  return (
    <LoginGate
      onLogin={(value) => {
        setSession(value);
        navigate(from, { replace: true });
      }}
    />
  );
}

function ProtectedShell() {
  return (
    <RequireAdminSession>
      <AdminShell />
    </RequireAdminSession>
  );
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginRoute /> },
  {
    path: "/",
    element: <ProtectedShell />,
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
          <EmptyState title="找不到頁面" detail="此 route 不存在或已移除。" />
        ),
      },
    ],
  },
]);
