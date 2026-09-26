import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import { AdminShell } from "./AdminShell";

/**
 * Lazy-loaded protected branch (React.lazy in routes.tsx). Bundling the QueryClientProvider
 * together with AdminShell behind one dynamic import keeps @tanstack/react-query AND the
 * entire admin workspace tree (shell, dialogs, workspace prefetch) out of the entry chunk —
 * the /login critical path never downloads any of it. Only RequireAdminSession stays eager,
 * so an unauthenticated visit can be redirected without fetching the workspace first.
 */
export default function ProtectedShell() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminShell />
    </QueryClientProvider>
  );
}
