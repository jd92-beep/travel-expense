import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

import { BffVerificationError, verifySignedBffRequest } from "../_shared/admin_bff.ts";
import { authStateRpcFor, routeBindsSessionHash } from "./routes.ts";
import { recordAuthStateSignatureRejection } from "./security.ts";

export const config = { verify_jwt: false };

const MAX_BODY_BYTES = 16 * 1024;

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Admin auth state database is unavailable");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function signingKeys(): Record<string, string> {
  const currentId = Deno.env.get("ADMIN_BFF_KEY_ID") || "";
  const currentSecret = Deno.env.get("ADMIN_BFF_SIGNING_KEY") || "";
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(currentId) || currentSecret.length < 32) {
    throw new Error("Admin BFF signing key is unavailable");
  }
  const keys: Record<string, string> = { [currentId]: currentSecret };

  const rotationId = Deno.env.get("ADMIN_BFF_ROTATION_KEY_ID") || "";
  const rotationSecret = Deno.env.get("ADMIN_BFF_ROTATION_SIGNING_KEY") || "";
  const rotationNotAfter = Number(Deno.env.get("ADMIN_BFF_ROTATION_NOT_AFTER") || "0");
  const now = Math.floor(Date.now() / 1000);
  if (rotationId || rotationSecret || rotationNotAfter) {
    if (
      !/^[A-Za-z0-9._-]{1,64}$/.test(rotationId) || rotationSecret.length < 32 ||
      !Number.isInteger(rotationNotAfter) || rotationNotAfter <= now ||
      rotationNotAfter > now + 600
    ) {
      throw new Error("Admin BFF rotation key window is invalid");
    }
    keys[rotationId] = rotationSecret;
  }
  return keys;
}

function response(status: number, requestId: string, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Admin-Request-Id": requestId,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function safeMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]");
}

Deno.serve(async (req) => {
  let requestId: string = crypto.randomUUID();
  try {
    if (req.method !== "POST") {
      return response(405, requestId, {
        ok: false,
        error: {
          code: "ADMIN_METHOD_NOT_ALLOWED",
          message: "Method not allowed",
          retryable: false,
        },
      });
    }

    const supabase = serviceClient();
    const signed = await verifySignedBffRequest(req, {
      functionName: "admin-auth-state",
      keys: signingKeys(),
      maxBodyBytes: MAX_BODY_BYTES,
      consumeNonce: async (nonceHash, signedRequestId, expiresAt) => {
        const { data, error } = await supabase.rpc("admin_consume_request_nonce", {
          p_nonce_hash: nonceHash,
          p_request_id: signedRequestId,
          p_expires_at: new Date(expiresAt * 1000).toISOString(),
        });
        if (error) throw new Error("Admin nonce store unavailable");
        return data === true;
      },
    });
    requestId = signed.requestId;

    let body: unknown;
    try {
      body = signed.bodyBytes.byteLength
        ? JSON.parse(new TextDecoder().decode(signed.bodyBytes))
        : {};
    } catch {
      return response(400, requestId, {
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Invalid JSON body", retryable: false },
      });
    }

    const rpc = authStateRpcFor(signed.route, body, signed.actor);
    if (routeBindsSessionHash(signed.route)) {
      const bodyObject = body as Record<string, unknown>;
      const tokenHash = String(bodyObject.tokenHash || bodyObject.sessionHash || "");
      if (signed.sessionHash !== tokenHash) {
        return response(401, requestId, {
          ok: false,
          error: {
            code: "ADMIN_SESSION_BINDING_INVALID",
            message: "Session binding is invalid",
            retryable: false,
          },
        });
      }
    }

    const { data, error } = await supabase.rpc(rpc.rpc, rpc.args);
    if (error) throw new Error(`Admin auth state operation failed: ${error.code || "unknown"}`);
    return response(200, requestId, { ok: true, data, error: null });
  } catch (error) {
    if (error instanceof BffVerificationError) {
      console.warn(JSON.stringify({
        event: "admin_auth_signature_rejected",
        code: error.code,
        method: req.method.toUpperCase(),
        requestId,
      }));
      try {
        await recordAuthStateSignatureRejection(serviceClient(), {
          code: error.code,
          method: req.method,
          requestId,
        });
      } catch {
        console.error(JSON.stringify({
          event: "admin_security_event_store_failed",
          requestId,
        }));
      }
      return response(error.status, requestId, {
        ok: false,
        error: { code: error.code, message: error.message, retryable: false },
      });
    }
    return response(503, requestId, {
      ok: false,
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: safeMessage(error),
        retryable: true,
      },
    });
  }
});
