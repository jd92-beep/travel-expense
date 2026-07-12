import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { clearSession, currentSession, logoutAdmin } from "../lib/adminApi";
import type { AdminSession } from "../lib/types";

type SessionContextValue = {
  checking: boolean;
  session: AdminSession | null;
  setSession: (session: AdminSession | null) => void;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function AdminSessionProvider(
  { children }: { children: React.ReactNode },
) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    currentSession()
      .then((value) => {
        if (active) setSession(value);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unauthorized = () => setSession(null);
    window.addEventListener("admin:unauthorized", unauthorized);
    return () => window.removeEventListener("admin:unauthorized", unauthorized);
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    checking,
    session,
    setSession,
    logout: async () => {
      try {
        await logoutAdmin();
      } finally {
        clearSession();
        setSession(null);
      }
    },
  }), [checking, session]);

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

export function RequireAdminSession(
  { children }: { children: React.ReactNode },
) {
  const { checking, session } = useAdminSession();
  const location = useLocation();
  if (checking) return <SessionSplash />;
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
