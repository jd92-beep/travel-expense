export type RuntimePolicy = {
  status: "allowlisted" | "provider_probe_only" | "deny_all";
  version: "admin-write-mode-v1";
  source: "ADMIN_WRITE_MODE" | "ADMIN_WRITE_MODE_INVALID" | "default";
  expiresAt: null;
  writable: boolean;
};

export function runtimePolicyFor(value: string | undefined): RuntimePolicy {
  const configured = value === "deny_all" || value === "provider_probe_only" ||
    value === "allowlisted";
  const status = value === "allowlisted" || value === "provider_probe_only" ? value : "deny_all";
  return {
    status,
    version: "admin-write-mode-v1",
    source: configured ? "ADMIN_WRITE_MODE" : value ? "ADMIN_WRITE_MODE_INVALID" : "default",
    expiresAt: null,
    writable: status === "allowlisted",
  };
}
