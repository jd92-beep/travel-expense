import { useQuery } from "@tanstack/react-query";
import { adminGet } from "./api/adminClient";

export type AdminWritePolicy = {
  status: "allowlisted" | "provider_probe_only" | "deny_all";
  writable: boolean;
  r3UserPurge?: boolean;
};

const DEFAULT_POLICY: AdminWritePolicy = {
  status: "deny_all",
  writable: false,
  r3UserPurge: false,
};

type RuntimeData = {
  runtimePolicy?: AdminWritePolicy;
};

/**
 * Production write mode is intentionally restricted. Non-probe actions must be
 * disabled in the UI so operators do not hit server 503s that look like bugs.
 */
export function useAdminWritePolicy() {
  const query = useQuery({
    queryKey: ["admin", "runtime", "write-policy"],
    queryFn: ({ signal }) => adminGet<RuntimeData>("/runtime", undefined, signal),
    staleTime: 60_000,
    retry: 1,
  });

  const policy = query.data?.data.runtimePolicy ?? DEFAULT_POLICY;
  const writesEnabled = policy.writable || policy.status === "allowlisted";
  const probesOnly = policy.status === "provider_probe_only";
  const canProbe = writesEnabled || probesOnly || query.isLoading;
  const canMutateCanonical = writesEnabled && !query.isLoading;
  const canPurgeUsers = writesEnabled && Boolean(policy.r3UserPurge) && !query.isLoading;
  const policyLabel = policy.status === "allowlisted"
    ? policy.r3UserPurge
      ? "寫入已啟用（含用戶永久刪除）"
      : "寫入已啟用"
    : policy.status === "provider_probe_only"
    ? "目前只允許 provider probe；其他寫入已停用"
    : "目前為唯讀；寫入操作已停用";

  return {
    loading: query.isLoading,
    error: query.error,
    policy,
    policyLabel,
    canProbe,
    canMutateCanonical,
    canPurgeUsers,
  };
}
