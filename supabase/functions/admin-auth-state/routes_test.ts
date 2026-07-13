import { assertEquals, assertThrows } from "@std/assert";

import { authStateRpcFor, routeBindsSessionHash } from "./routes.ts";

Deno.test("auth-state routes map only to fixed RPCs", () => {
  assertEquals(
    authStateRpcFor(
      "/internal/session/verify",
      { tokenHash: "a".repeat(64), passphraseFingerprint: "b".repeat(64) },
      "boss",
    ),
    {
      rpc: "admin_auth_verify_session",
      args: {
        p_token_hash: "a".repeat(64),
        p_passphrase_fingerprint: "b".repeat(64),
      },
    },
  );
  assertThrows(
    () => authStateRpcFor("/internal/arbitrary", {}, "boss"),
    Error,
    "not allowed",
  );
});

Deno.test("session verify and revoke bind the signed session hash", () => {
  assertEquals(routeBindsSessionHash("/internal/session/verify"), true);
  assertEquals(routeBindsSessionHash("/internal/session/revoke"), true);
  assertEquals(routeBindsSessionHash("/internal/session/rotate"), true);
  assertEquals(routeBindsSessionHash("/internal/step-up/create"), true);
  assertEquals(routeBindsSessionHash("/internal/session/create"), false);
});

Deno.test("session rotation maps to one atomic RPC bound to the old session", () => {
  assertEquals(
    authStateRpcFor(
      "/internal/session/rotate",
      {
        tokenHash: "a".repeat(64),
        nextTokenHash: "b".repeat(64),
        csrfHash: "c".repeat(64),
        authMethod: "passphrase+passkey",
        passphraseFingerprint: "d".repeat(64),
      },
      "boss",
    ),
    {
      rpc: "admin_auth_rotate_session",
      args: {
        p_current_token_hash: "a".repeat(64),
        p_next_token_hash: "b".repeat(64),
        p_csrf_hash: "c".repeat(64),
        p_actor: "boss",
        p_auth_method: "passphrase+passkey",
        p_passphrase_fingerprint: "d".repeat(64),
      },
    },
  );
});

Deno.test("backup passkey registration is session-bound and audit-aware", () => {
  assertEquals(
    authStateRpcFor(
      "/internal/credential/register-backup",
      {
        credentialId: "credential-id-value",
        publicKey: "public-key-value",
        counter: 0,
        transports: ["internal"],
        deviceType: "multiDevice",
        backedUp: true,
        label: "Boss backup",
        sessionHash: "a".repeat(64),
        requestId: "97000000-0000-4000-8000-000000000001",
      },
      "boss",
    ),
    {
      rpc: "admin_auth_register_backup_credential",
      args: {
        p_credential_id: "credential-id-value",
        p_public_key: "public-key-value",
        p_counter: 0,
        p_transports: ["internal"],
        p_device_type: "multiDevice",
        p_backed_up: true,
        p_label: "Boss backup",
        p_actor: "boss",
        p_session_hash: "a".repeat(64),
        p_request_id: "97000000-0000-4000-8000-000000000001",
      },
    },
  );
  assertEquals(routeBindsSessionHash("/internal/credential/register-backup"), true);
});

Deno.test("passkey removal is fixed-route, session-bound, and carries only opaque context", () => {
  assertEquals(
    authStateRpcFor(
      "/internal/credential/remove",
      {
        selector: "a".repeat(64),
        setHash: "b".repeat(64),
        grantId: "97000000-0000-4000-8000-000000000001",
        sessionHash: "c".repeat(64),
        requestId: "97000000-0000-4000-8000-000000000002",
      },
      "boss",
    ),
    {
      rpc: "admin_auth_remove_backup_credential",
      args: {
        p_selector: "a".repeat(64),
        p_set_hash: "b".repeat(64),
        p_grant_id: "97000000-0000-4000-8000-000000000001",
        p_session_hash: "c".repeat(64),
        p_actor: "boss",
        p_request_id: "97000000-0000-4000-8000-000000000002",
      },
    },
  );
  assertEquals(routeBindsSessionHash("/internal/credential/remove"), true);
  assertThrows(
    () => authStateRpcFor("/internal/credential/remove", { credentialId: "raw" }, "boss"),
    Error,
    "selector",
  );
});

Deno.test("credential and session fields are bounded", () => {
  assertThrows(
    () =>
      authStateRpcFor(
        "/internal/credential/register",
        {
          credentialId: "x".repeat(1025),
          publicKey: "key",
          counter: 0,
          transports: [],
          deviceType: "singleDevice",
          backedUp: false,
        },
        "boss",
      ),
    Error,
    "credentialId",
  );
});
