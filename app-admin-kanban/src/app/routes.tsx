import {
  createBrowserRouter,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router";
import { LoginGate } from "../components/LoginGate";
import { EmptyState } from "../components/primitives/ConsolePrimitives";
import {
  AccountDetailPage,
  AccountsPage,
} from "../features/data/accounts/AccountsPage";
import {
  ReceiptDetailPage,
  ReceiptsPage,
} from "../features/data/receipts/ReceiptsPage";
import {
  ItineraryPage,
  TripDetailPage,
  TripsPage,
} from "../features/data/trips/TripsPage";
import { OverviewPage } from "../features/overview/OverviewPage";
import {
  IncidentsPage,
  IntegrityPage,
  ReconciliationPage,
  SyncJobsPage,
} from "../features/reliability/ReliabilityPages";
import {
  InfrastructurePage,
  ProvidersPage,
  ReleasesPage,
} from "../features/system/SystemPages";
import { AuditDetailPage, AuditPage } from "../features/audit/AuditPages";
import { SearchPage } from "../features/search/SearchPage";
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
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", element: <OverviewPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "data/accounts", element: <AccountsPage /> },
      { path: "data/accounts/:accountId", element: <AccountDetailPage /> },
      { path: "data/trips", element: <TripsPage /> },
      { path: "data/trips/:tripId", element: <TripDetailPage /> },
      { path: "data/trips/:tripId/itinerary", element: <ItineraryPage /> },
      { path: "data/receipts", element: <ReceiptsPage /> },
      { path: "data/receipts/:receiptId", element: <ReceiptDetailPage /> },
      { path: "reliability/incidents", element: <IncidentsPage /> },
      { path: "reliability/sync", element: <SyncJobsPage /> },
      { path: "reliability/integrity", element: <IntegrityPage /> },
      { path: "reliability/reconciliation", element: <ReconciliationPage /> },
      { path: "system/providers", element: <ProvidersPage /> },
      { path: "system/releases", element: <ReleasesPage /> },
      { path: "system/infrastructure", element: <InfrastructurePage /> },
      { path: "audit", element: <AuditPage /> },
      { path: "audit/:eventId", element: <AuditDetailPage /> },
      {
        path: "*",
        element: (
          <EmptyState title="找不到頁面" detail="此 route 不存在或已移除。" />
        ),
      },
    ],
  },
]);
