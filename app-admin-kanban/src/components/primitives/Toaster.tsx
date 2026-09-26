import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

/**
 * Toast feedback layer on the toast.css contract: a single fixed
 * .toast-region (aria-live="polite") stacking up to three .toast--{variant}
 * items; entrance animation is CSS-only (toast-in), dismissal is automatic
 * after ~4s or manual via the dismiss button. Items deliberately carry no
 * role="status" — the live region itself handles announcements and a role
 * would collide with the workspace's own status landmarks in tests.
 */

export type ToastVariant = "success" | "error" | "info";

type ToastItem = { id: number; message: string; variant: ToastVariant };

const ToastContext = createContext<{
  push: (message: string, options?: { variant?: ToastVariant }) => void;
}>({ push: () => {} });

const TOAST_DURATION_MS = 4000;
const TOAST_LIMIT = 3;

const TOAST_ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((
    message: string,
    options?: { variant?: ToastVariant },
  ) => {
    const id = ++nextIdRef.current;
    setToasts((current) => [
      ...current.slice(-(TOAST_LIMIT - 1)),
      { id, message, variant: options?.variant ?? "info" },
    ]);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            toast={toast}
            onDismiss={dismiss}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast(
  { toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void },
) {
  useEffect(() => {
    const timer = window.setTimeout(
      () => onDismiss(toast.id),
      TOAST_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);
  const Icon = TOAST_ICONS[toast.variant];
  return (
    <div className={`toast toast--${toast.variant}`}>
      <Icon size={16} aria-hidden="true" />
      <span>{toast.message}</span>
      <button
        className="icon-button"
        type="button"
        aria-label="關閉通知"
        onClick={() => onDismiss(toast.id)}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
