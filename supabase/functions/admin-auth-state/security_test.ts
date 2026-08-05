import { assertEquals } from "@std/assert";

import { recordAuthStateSignatureRejection } from "./security.ts";

Deno.test("auth-state signature rejection never trusts actor or session headers", async () => {
  let call: { name: string; args: Record<string, unknown> } | null = null;
  await recordAuthStateSignatureRejection({
    rpc: (name, args) => {
      call = { name, args };
      return Promise.resolve({ error: null });
    },
  }, {
    code: "ADMIN_SIGNATURE_INVALID",
    method: "post",
    requestId: "97000000-0000-4000-8000-000000000001",
  });

  assertEquals(call, {
    name: "admin_audit_record_security_event",
    args: {
      p_action: "admin_signature_rejected",
      p_actor: "unauthenticated",
      p_error_code: "ADMIN_SIGNATURE_INVALID",
      p_method: "POST",
      p_request_id: "97000000-0000-4000-8000-000000000001",
      p_route: "invalid",
      p_session_hash: "unauthenticated",
    },
  });
});
