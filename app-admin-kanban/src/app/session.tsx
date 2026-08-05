import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { LoaderCircle, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { AdminApiError, clearSession, currentSession, logoutAdmin } from "../lib/adminApi";
import type { AdminSession } from "../lib/types";

type SessionContextValue = {
  checking: boolean;
  sessionError: AdminApiError | null;
  logoutError: AdminApiError | null;
  session: AdminSession | null;
  retrySession: () => void;
  setSession: (session: AdminSession | null) => void;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function AdminSessionProvider(
  { children }: { children: React.ReactNode },
) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState<AdminApiError | null>(null);
  const [logoutError, setLogoutError] = useState<AdminApiError | null>(null);

  const checkSession = useCallback(() => {
    let active = true;
    setChecking(true);
    setSessionError(null);
    currentSession()
      .then((value) => {
        if (active) setSession(value);
      })
      .catch((error) => {
        if (!active) return;
        setSession(null);
        setSessionError(error instanceof AdminApiError
          ? error
          : new AdminApiError("管理員驗證服務暫時不可用", "UPSTREAM_UNAVAILABLE", 503));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return checkSession();
  }, [checkSession]);

  useEffect(() => {
    const unauthorized = () => {
      setSessionError(null);
      setSession(null);
    };
    window.addEventListener("admin:unauthorized", unauthorized);
    return () => window.removeEventListener("admin:unauthorized", unauthorized);
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    checking,
    sessionError,
    logoutError,
    session,
    retrySession: () => {
      checkSession();
    },
    setSession,
    logout: async () => {
      try {
        await logoutAdmin();
        clearSession();
        setSessionError(null);
        setSession(null);
        setLogoutError(null);
      } catch (error) {
        setLogoutError(error instanceof AdminApiError
          ? error
          : new AdminApiError("未能確認登出狀態", "UPSTREAM_UNAVAILABLE", 503));
      }
    },
  }), [checkSession, checking, logoutError, session, sessionError]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useAdminSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("AdminSessionProvider is missing");
  return value;
}

export function SessionSplash() {
  return (
    <main className="session-splash" aria-live="polite">
      <ShieldCheck size={28} />
      <div>
        <h1>Travel Expense Admin Console</h1>
        <p>
          <LoaderCircle className="spin" size={16} /> 正在驗證管理員工作階段
        </p>
      </div>
    </main>
  );
}

export function SessionBoundaryError(
  { error, retry }: { error: AdminApiError; retry: () => void },
) {
  return (
    <main className="session-splash">
      <section className="session-boundary-error" role="alert">
        <ShieldAlert size={28} />
        <div>
          <h1>管理員驗證服務暫時不可用</h1>
          <p>Console 已 fail closed；服務恢復前唔會顯示資料或接受操作。</p>
          <code>{error.code} · {error.requestId || "no-request-id"}</code>
          <button className="button secondary" type="button" onClick={retry}>
            <RefreshCw size={16} />重新檢查
          </button>
        </div>
      </section>
    </main>
  );
}

export function RequireAdminSession(
  { children }: { children: React.ReactNode },
) {
  const { checking, retrySession, session, sessionError } = useAdminSession();
  const location = useLocation();
  if (checking) return <SessionSplash />;
  if (sessionError) return <SessionBoundaryError error={sessionError} retry={retrySession} />;
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return children;
}
