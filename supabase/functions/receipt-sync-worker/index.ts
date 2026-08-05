import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { handleReceiptSyncRequest } from "./worker.ts";

export const config = { verify_jwt: false };

Deno.serve((request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const client = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    : {
      rpc: () =>
        Promise.resolve({ data: null, error: { message: "Receipt sync database unavailable" } }),
    };
  return handleReceiptSyncRequest(request, {
    client,
    env: {
      brokerKey: Deno.env.get("EDGE_BROKER_KEY") || "",
      brokerUrl: Deno.env.get("CREDENTIAL_BROKER_URL") ||
        "https://travel-expense-credential-broker.ftjdfr.workers.dev",
      deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID") || "local000",
      workerSecret: Deno.env.get("RECEIPT_SYNC_WORKER_SECRET") || "",
    },
  });
});
