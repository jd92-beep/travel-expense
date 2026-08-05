type SecurityAuditClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: unknown | null }>;
};

export async function recordAuthStateSignatureRejection(
  client: SecurityAuditClient,
  input: {
    code: string;
    method: string;
    requestId: string;
  },
) {
  const { error } = await client.rpc("admin_audit_record_security_event", {
    p_action: "admin_signature_rejected",
    p_actor: "unauthenticated",
    p_error_code: input.code.slice(0, 64),
    p_method: input.method.toUpperCase().slice(0, 16),
    p_request_id: input.requestId,
    p_route: "invalid",
    p_session_hash: "unauthenticated",
  });
  if (error) throw error;
}
