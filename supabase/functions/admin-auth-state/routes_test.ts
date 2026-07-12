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
  assertEquals(routeBindsSessionHash("/internal/step-up/create"), true);
  assertEquals(routeBindsSessionHash("/internal/session/create"), false);
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
