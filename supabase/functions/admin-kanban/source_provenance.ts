// Build-time Edge provenance. Overwritten by deploy tooling before
// `supabase functions deploy` so readiness does not depend on secret
// propagation timing (which lagged behind every release SHA).
export const EDGE_SOURCE_SHA = "b6d57c44b9dcfb6ea267cf9da618ebbffe23acff" as string;
