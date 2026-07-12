export type AuthStateRpcRequest = {
  args: Record<string, unknown>;
  rpc: string;
};

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON object required");
  }
  return value as JsonObject;
}

function text(body: JsonObject, key: string, max = 4096): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new Error(`${key} is invalid`);
  }
  return value;
}

function optionalText(body: JsonObject, key: string, max = 256): string | null {
  const value = body[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new Error(`${key} is invalid`);
  return value;
}

function integer(body: JsonObject, key: string): number {
  const value = body[key];
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${key} is invalid`);
  return Number(value);
}

function boolean(body: JsonObject, key: string): boolean {
  if (typeof body[key] !== "boolean") throw new Error(`${key} is invalid`);
  return body[key] as boolean;
}

function textArray(body: JsonObject, key: string): string[] {
  const value = body[key];
  if (
    !Array.isArray(value) || value.length > 8 ||
    value.some((item) => typeof item !== "string" || item.length > 64)
  ) {
    throw new Error(`${key} is invalid`);
  }
  return value;
}

export function authStateRpcFor(
  route: string,
  input: unknown,
  actor: string,
): AuthStateRpcRequest {
  const body = object(input);
  switch (route) {
    case "/internal/rate/precheck":
      return {
        rpc: "admin_auth_rate_precheck",
        args: {
          p_bucket_key: text(body, "bucketKey", 64),
          p_bucket_kind: text(body, "bucketKind", 16),
        },
      };
    case "/internal/rate/record":
      return {
        rpc: "admin_auth_rate_record",
        args: {
          p_bucket_key: text(body, "bucketKey", 64),
          p_bucket_kind: text(body, "bucketKind", 16),
          p_succeeded: boolean(body, "succeeded"),
        },
      };
    case "/internal/credentials/list":
      return { rpc: "admin_auth_list_credentials", args: {} };
    case "/internal/challenge/create":
      return {
        rpc: "admin_auth_create_challenge",
        args: {
          p_id: text(body, "id", 36),
          p_kind: text(body, "kind", 32),
          p_challenge: text(body, "challenge", 512),
          p_context_hash: text(body, "contextHash", 64),
          p_payload:
            body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
              ? body.payload
              : {},
        },
      };
    case "/internal/challenge/consume":
      return {
        rpc: "admin_auth_consume_challenge",
        args: {
          p_id: text(body, "id", 36),
          p_kind: text(body, "kind", 32),
          p_context_hash: text(body, "contextHash", 64),
        },
      };
    case "/internal/credential/register":
      return {
        rpc: "admin_auth_register_credential",
        args: {
          p_credential_id: text(body, "credentialId", 1024),
          p_public_key: text(body, "publicKey", 8192),
          p_counter: integer(body, "counter"),
          p_transports: textArray(body, "transports"),
          p_device_type: text(body, "deviceType", 64),
          p_backed_up: boolean(body, "backedUp"),
          p_label: optionalText(body, "label"),
        },
      };
    case "/internal/credential/update":
      return {
        rpc: "admin_auth_update_credential",
        args: {
          p_credential_id: text(body, "credentialId", 1024),
          p_counter: integer(body, "counter"),
          p_device_type: text(body, "deviceType", 64),
          p_backed_up: boolean(body, "backedUp"),
        },
      };
    case "/internal/session/create":
      return {
        rpc: "admin_auth_create_session",
        args: {
          p_token_hash: text(body, "tokenHash", 64),
          p_csrf_hash: text(body, "csrfHash", 64),
          p_actor: actor,
          p_auth_method: text(body, "authMethod", 64),
          p_passphrase_fingerprint: text(body, "passphraseFingerprint", 64),
        },
      };
    case "/internal/session/verify":
      return {
        rpc: "admin_auth_verify_session",
        args: {
          p_token_hash: text(body, "tokenHash", 64),
          p_passphrase_fingerprint: text(body, "passphraseFingerprint", 64),
        },
      };
    case "/internal/session/revoke":
      return {
        rpc: "admin_auth_revoke_session",
        args: {
          p_token_hash: text(body, "tokenHash", 64),
          p_reason: optionalText(body, "reason") || "logout",
        },
      };
    case "/internal/session/revoke-all":
      return {
        rpc: "admin_auth_revoke_all_sessions",
        args: { p_reason: optionalText(body, "reason") || "security_incident" },
      };
    case "/internal/step-up/create":
      return {
        rpc: "admin_auth_create_step_up",
        args: {
          p_id: text(body, "id", 36),
          p_session_hash: text(body, "sessionHash", 64),
          p_action: text(body, "action", 64),
          p_target_hash: text(body, "targetHash", 64),
          p_preview_hash: text(body, "previewHash", 64),
        },
      };
    case "/internal/step-up/consume":
      return {
        rpc: "admin_auth_consume_step_up",
        args: {
          p_id: text(body, "id", 36),
          p_session_hash: text(body, "sessionHash", 64),
          p_action: text(body, "action", 64),
          p_target_hash: text(body, "targetHash", 64),
          p_preview_hash: text(body, "previewHash", 64),
        },
      };
    default:
      throw new Error("Auth state route is not allowed");
  }
}

export function routeBindsSessionHash(route: string): boolean {
  return route === "/internal/session/verify" || route === "/internal/session/revoke" ||
    route === "/internal/step-up/create" || route === "/internal/step-up/consume";
}
