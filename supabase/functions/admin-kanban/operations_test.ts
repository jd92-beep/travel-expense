import { assertEquals, assertRejects } from "@std/assert";

import {
  AdminOperationError,
  canonicalJson,
  commitAdminOperation,
  detectReceiptPhotoMime,
  type OperationContext,
  previewAdminOperation,
  receiptPhotoMimeMatches,
  redactSupportText,
} from "./operations.ts";

function asClient(value: unknown): OperationContext["client"] {
  return value as OperationContext["client"];
}

Deno.test("canonical operation JSON is stable across object key order", () => {
  assertEquals(
    canonicalJson({ z: 1, nested: { b: 2, a: 1 }, a: [3, { y: 2, x: 1 }] }),
    canonicalJson({ a: [3, { x: 1, y: 2 }], nested: { a: 1, b: 2 }, z: 1 }),
  );
});

Deno.test("receipt photo MIME is derived from image magic bytes", () => {
  assertEquals(detectReceiptPhotoMime(new Uint8Array([0xff, 0xd8, 0xff, 0xdb])), "image/jpeg");
  assertEquals(
    detectReceiptPhotoMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/png",
  );
  assertEquals(
    detectReceiptPhotoMime(
      new Uint8Array([
        0x52,
        0x49,
        0x46,
        0x46,
        0,
        0,
        0,
        0,
        0x57,
        0x45,
        0x42,
        0x50,
      ]),
    ),
    "image/webp",
  );
  assertEquals(
    detectReceiptPhotoMime(
      new Uint8Array([
        0,
        0,
        0,
        0x18,
        0x66,
        0x74,
        0x79,
        0x70,
        0x68,
        0x65,
        0x69,
        0x63,
      ]),
    ),
    "image/heic",
  );
  assertEquals(detectReceiptPhotoMime(new TextEncoder().encode("<script>alert(1)</script>")), null);
});

Deno.test("receipt photo declared MIME must match detected content", () => {
  assertEquals(receiptPhotoMimeMatches("image/png", "image/png"), true);
  assertEquals(receiptPhotoMimeMatches("image/jpeg", "image/png"), false);
  assertEquals(receiptPhotoMimeMatches("image/heic", "image/heif"), true);
});

Deno.test("support bundle text redacts credentials, email addresses, and URLs", () => {
  const redacted = redactSupportText(
    [
      "Bearer",
      "abcdefghijklmnopqrstuvwxyz",
      "owner@example.invalid",
      "https://private.example/path?token=secret_value",
    ].join(" "),
  );
  assertEquals(redacted.includes("abcdefghijklmnopqrstuvwxyz"), false);
  assertEquals(redacted.includes("owner@example.invalid"), false);
  assertEquals(redacted.includes("private.example"), false);
  assertEquals(redacted.includes("[redacted-email]"), true);
  assertEquals(redacted.includes("[redacted-url]"), true);
});

Deno.test("provider preview is server-computed and stored through the operation RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "admin_operation_list") return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: { id: args.p_id, status: "previewed" }, error: null });
    },
  };
  const result = await previewAdminOperation({
    actor: "boss",
    brokerKey: "test-broker-key-that-is-not-a-secret",
    brokerUrl: "https://broker.example",
    client: asClient(client),
    requestId: "97000000-0000-4000-8000-000000000001",
    sessionHash: "a".repeat(64),
  }, {
    action: "provider_probe",
    idempotencyKey: "97100000-0000-4000-8000-000000000001",
    targetId: "volcano",
    payload: { model: "volcano/minimax-m2.7" },
  });

  assertEquals(result.status, "previewed");
  assertEquals(calls.map((call) => call.name), [
    "admin_operation_list",
    "admin_operation_preview_create",
  ]);
  assertEquals(calls[1].args.p_action, "provider_probe");
  assertEquals(calls[1].args.p_target_ref, "volcano");
  assertEquals(
    (calls[1].args.p_preview as Record<string, unknown>).model,
    "volcano/minimax-m2.7",
  );
  assertEquals(
    (calls[1].args.p_payload as Record<string, unknown>).model,
    "volcano/minimax-m2.7",
  );
  assertEquals(String(calls[1].args.p_preview_hash).length, 64);
});

Deno.test("unknown and high-risk actions fail before any RPC call", async () => {
  let called = false;
  await assertRejects(
    () =>
      previewAdminOperation({
        actor: "boss",
        brokerKey: "test-broker-key-that-is-not-a-secret",
        brokerUrl: "https://broker.example",
        client: asClient({
          rpc: () => {
            called = true;
          },
        }),
        requestId: "97000000-0000-4000-8000-000000000001",
        sessionHash: "a".repeat(64),
      }, {
        action: "reassign_data",
        idempotencyKey: "97100000-0000-4000-8000-000000000001",
        targetId: "97200000-0000-4000-8000-000000000001",
        payload: {},
      }),
    AdminOperationError,
    "Operation context is invalid",
  );
  assertEquals(called, false);
});

Deno.test("integrity scan uses its fixed preview and commit RPCs", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "admin_read_integrity") {
        return Promise.resolve({ data: { run: null, state: "never_run", items: [] }, error: null });
      }
      if (name === "admin_operation_get") {
        return Promise.resolve({
          data: {
            id: args.p_id,
            action: "run_integrity_scan",
            status: "previewed",
          },
          error: null,
        });
      }
      if (name === "admin_operation_commit_integrity_scan") {
        return Promise.resolve({
          data: { id: args.p_id, action: "run_integrity_scan", status: "completed" },
          error: null,
        });
      }
      return Promise.resolve({ data: { id: args.p_id, status: "previewed" }, error: null });
    },
  };
  const context = {
    actor: "boss",
    brokerKey: "test-broker-key-that-is-not-a-secret",
    brokerUrl: "https://broker.example",
    client: asClient(client),
    requestId: "97000000-0000-4000-8000-000000000001",
    sessionHash: "a".repeat(64),
  };

  const preview = await previewAdminOperation(context, {
    action: "run_integrity_scan",
    idempotencyKey: "97100000-0000-4000-8000-000000000001",
    targetId: "system",
    payload: {},
  });
  assertEquals(preview.status, "previewed");
  assertEquals(calls.map((call) => call.name), [
    "admin_read_integrity",
    "admin_operation_preview_integrity_create",
  ]);
  assertEquals(calls[1].args.p_target_version, null);

  const committed = await commitAdminOperation(
    context,
    "97200000-0000-4000-8000-000000000001",
  );
  assertEquals(committed.operation.status, "completed");
  assertEquals(calls.slice(-2).map((call) => call.name), [
    "admin_operation_get",
    "admin_operation_commit_integrity_scan",
  ]);
});

Deno.test("R2 receipt preview and rotated-session commit remain bound to the step-up grant", async () => {
  const receiptId = "97200000-0000-4000-8000-000000000001";
  const operationId = "97300000-0000-4000-8000-000000000001";
  const grantId = "97400000-0000-4000-8000-000000000001";
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      assertEquals(table, "receipts");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({
            data: {
              id: receiptId,
              store: "Dinner",
              record_date: "2026-04-20",
              record_time: "19:30:00",
              amount: 100,
              currency: "JPY",
              category: "food",
              payment_method: "cash",
              record_kind: "expense",
              visibility: "trip",
              version: 4,
              deleted_at: null,
              updated_at: "2026-07-11T00:00:00.000Z",
            },
            error: null,
          });
        },
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "admin_operation_preview_r2_create") {
        return Promise.resolve({
          data: { id: operationId, action: "receipt_amend", risk: "R2", status: "previewed" },
          error: null,
        });
      }
      if (name === "admin_operation_get") {
        return Promise.resolve({
          data: { id: operationId, action: "receipt_amend", risk: "R2", status: "previewed" },
          error: null,
        });
      }
      if (name === "admin_operation_commit_r2") {
        return Promise.resolve({
          data: { id: operationId, action: "receipt_amend", risk: "R2", status: "completed" },
          error: null,
        });
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const base = {
    actor: "boss",
    brokerKey: "test-broker-key-that-is-not-a-secret",
    brokerUrl: "https://broker.example",
    client: asClient(client),
    requestId: "97000000-0000-4000-8000-000000000001",
  };

  const preview = await previewAdminOperation({ ...base, sessionHash: "a".repeat(64) }, {
    action: "receipt_amend",
    idempotencyKey: "97100000-0000-4000-8000-000000000001",
    targetId: receiptId,
    payload: {
      expectedVersion: 4,
      patch: { amount: 250, store: "Nagoya dinner", visibility: "private" },
    },
  });
  assertEquals(preview.risk, "R2");
  assertEquals(calls[0].name, "admin_operation_preview_r2_create");
  assertEquals(calls[0].args.p_session_hash, "a".repeat(64));
  assertEquals(calls[0].args.p_target_version, "4");
  assertEquals(calls[0].args.p_payload, {
    expectedVersion: 4,
    patch: { amount: 250, store: "Nagoya dinner", visibility: "private" },
  });

  const committed = await commitAdminOperation(
    { ...base, sessionHash: "b".repeat(64) },
    operationId,
    { grantId },
  );
  assertEquals(committed.operation.status, "completed");
  assertEquals(calls.slice(-2).map((call) => call.name), [
    "admin_operation_get",
    "admin_operation_commit_r2",
  ]);
  assertEquals(calls.at(-1)?.args, {
    p_actor: "boss",
    p_grant_id: grantId,
    p_id: operationId,
    p_request_id: base.requestId,
    p_session_hash: "b".repeat(64),
  });
});

Deno.test("R2 receipt preview blocks a private transition with a cross-person beneficiary", async () => {
  let rpcCalled = false;
  const error = await assertRejects(
    () =>
      previewAdminOperation({
        actor: "boss",
        brokerKey: "test-broker-key-that-is-not-a-secret",
        brokerUrl: "https://broker.example",
        client: asClient({
          from() {
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              maybeSingle() {
                return Promise.resolve({
                  data: {
                    id: "97200000-0000-4000-8000-000000000001",
                    store: "Shared dinner",
                    record_date: "2026-04-20",
                    record_time: "19:30:00",
                    amount: 100,
                    currency: "JPY",
                    category: "food",
                    payment_method: "cash",
                    record_kind: "expense",
                    visibility: "trip",
                    split_mode: "shared",
                    person_id: "p_a",
                    beneficiary_id: "p_b",
                    version: 4,
                    deleted_at: null,
                    updated_at: "2026-07-11T00:00:00.000Z",
                  },
                  error: null,
                });
              },
            };
          },
          rpc() {
            rpcCalled = true;
            return Promise.resolve({ data: null, error: null });
          },
        }),
        requestId: "97000000-0000-4000-8000-000000000001",
        sessionHash: "a".repeat(64),
      }, {
        action: "receipt_amend",
        idempotencyKey: "97100000-0000-4000-8000-000000000001",
        targetId: "97200000-0000-4000-8000-000000000001",
        payload: { expectedVersion: 4, patch: { visibility: "private" } },
      }),
    AdminOperationError,
  );
  assertEquals(error.code, "DEPENDENCY_CONFLICT");
  assertEquals(rpcCalled, false);
});

Deno.test("processing sync jobs cannot be cancelled as if they were still queued", async () => {
  let rpcCalled = false;
  const error = await assertRejects(
    () =>
      previewAdminOperation({
        actor: "boss",
        brokerKey: "test-broker-key-that-is-not-a-secret",
        brokerUrl: "https://broker.example",
        client: asClient({
          from() {
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              maybeSingle() {
                return Promise.resolve({
                  data: {
                    id: "97200000-0000-4000-8000-000000000001",
                    provider: "notion",
                    operation: "upsert",
                    status: "processing",
                    attempts: 2,
                    next_attempt_at: "2026-07-11T00:00:00.000Z",
                    last_error: null,
                    updated_at: "2026-07-11T00:00:00.000Z",
                  },
                  error: null,
                });
              },
            };
          },
          rpc() {
            rpcCalled = true;
            return Promise.resolve({ data: null, error: null });
          },
        }),
        requestId: "97000000-0000-4000-8000-000000000001",
        sessionHash: "a".repeat(64),
      }, {
        action: "cancel_sync_job",
        idempotencyKey: "97100000-0000-4000-8000-000000000001",
        targetId: "97200000-0000-4000-8000-000000000001",
        payload: {},
      }),
    AdminOperationError,
  );
  assertEquals(error.code, "DEPENDENCY_CONFLICT");
  assertEquals(rpcCalled, false);
});

Deno.test("R2 commit without a fresh grant fails before the mutation RPC", async () => {
  const calls: string[] = [];
  const error = await assertRejects(
    () =>
      commitAdminOperation(
        {
          actor: "boss",
          brokerKey: "test-broker-key-that-is-not-a-secret",
          brokerUrl: "https://broker.example",
          client: asClient({
            rpc(name: string) {
              calls.push(name);
              return Promise.resolve({
                data: {
                  id: "97300000-0000-4000-8000-000000000001",
                  action: "receipt_trash",
                  risk: "R2",
                  status: "previewed",
                },
                error: null,
              });
            },
          }),
          requestId: "97000000-0000-4000-8000-000000000001",
          sessionHash: "b".repeat(64),
        },
        "97300000-0000-4000-8000-000000000001",
        {},
      ),
    AdminOperationError,
  );
  assertEquals(error.code, "MFA_REQUIRED");
  assertEquals(calls, ["admin_operation_get"]);
});

Deno.test("R2 itinerary preview rejects a missing Nagoya day before it reaches SQL", async () => {
  let rpcCalled = false;
  await assertRejects(
    () =>
      previewAdminOperation({
        actor: "boss",
        brokerKey: "test-broker-key-that-is-not-a-secret",
        brokerUrl: "https://broker.example",
        client: asClient({
          from() {
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              maybeSingle() {
                return Promise.resolve({
                  data: {
                    id: "97200000-0000-4000-8000-000000000001",
                    name: "Nagoya",
                    start_date: "2026-04-20",
                    end_date: "2026-04-25",
                    itinerary: [],
                    itinerary_version: 3,
                    updated_at: "2026-07-11T00:00:00.000Z",
                  },
                  error: null,
                });
              },
            };
          },
          rpc() {
            rpcCalled = true;
          },
        }),
        requestId: "97000000-0000-4000-8000-000000000001",
        sessionHash: "a".repeat(64),
      }, {
        action: "itinerary_amend",
        idempotencyKey: "97100000-0000-4000-8000-000000000001",
        targetId: "97200000-0000-4000-8000-000000000001",
        payload: {
          expectedVersion: 3,
          startDate: "2026-04-20",
          endDate: "2026-04-25",
          itinerary: [
            { date: "2026-04-20", title: "Day 1", spots: [] },
            { date: "2026-04-21", title: "Day 2", spots: [] },
            { date: "2026-04-22", title: "Day 3", spots: [] },
            { date: "2026-04-24", title: "Day 5", spots: [] },
            { date: "2026-04-25", title: "Day 6", spots: [] },
          ],
        },
      }),
    AdminOperationError,
    "Every itinerary day is required",
  );
  assertEquals(rpcCalled, false);
});

Deno.test("R2 itinerary shrink requires an exact explicit removal manifest", async () => {
  const tripId = "97200000-0000-4000-8000-000000000001";
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const currentDays = [20, 21, 22, 23, 24, 25].map((day, index) => ({
    date: `2026-04-${day}`,
    title: day === 25 ? "Return day" : `Day ${index + 1}`,
    spots: [],
  }));
  const proposedDays = currentDays.slice(0, 5);
  const context = {
    actor: "boss",
    brokerKey: "test-broker-key-that-is-not-a-secret",
    brokerUrl: "https://broker.example",
    client: asClient({
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: tripId,
                name: "Nagoya",
                start_date: "2026-04-20",
                end_date: "2026-04-25",
                itinerary: currentDays,
                itinerary_version: 3,
                updated_at: "2026-07-11T00:00:00.000Z",
              },
              error: null,
            });
          },
        };
      },
      rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        return Promise.resolve({
          data: { id: args.p_id, action: "itinerary_amend", risk: "R2", status: "previewed" },
          error: null,
        });
      },
    }),
    requestId: "97000000-0000-4000-8000-000000000001",
    sessionHash: "a".repeat(64),
  };
  const base = {
    action: "itinerary_amend" as const,
    idempotencyKey: "97100000-0000-4000-8000-000000000001",
    targetId: tripId,
    payload: {
      expectedVersion: 3,
      startDate: "2026-04-20",
      endDate: "2026-04-24",
      itinerary: proposedDays,
    },
  };

  const missingManifest = await assertRejects(
    () => previewAdminOperation(context, base),
    AdminOperationError,
  );
  assertEquals(missingManifest.code, "VALIDATION_FAILED");
  assertEquals(calls.length, 0);

  await previewAdminOperation(context, {
    ...base,
    payload: { ...base.payload, removedDates: ["2026-04-25"] },
  });
  assertEquals(calls[0].name, "admin_operation_preview_r2_create");
  assertEquals(calls[0].args.p_payload, {
    ...base.payload,
    removedDates: ["2026-04-25"],
  });
});

Deno.test("member add creates an invite preview when the email has no account", async () => {
  const tripId = "97200000-0000-4000-8000-000000000001";
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    auth: {
      admin: {
        listUsers() {
          return Promise.resolve({ data: { users: [] }, error: null });
        },
      },
    },
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          if (table === "trips") {
            return Promise.resolve({
              data: {
                id: tripId,
                name: "Nagoya",
                owner_id: "97000000-0000-4000-8000-000000000001",
                updated_at: "2026-07-11T00:00:00.000Z",
              },
              error: null,
            });
          }
          if (table === "trip_invites") return Promise.resolve({ data: null, error: null });
          throw new Error(`Unexpected table ${table}`);
        },
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({
        data: { id: args.p_id, action: "member_add", risk: "R2", status: "previewed" },
        error: null,
      });
    },
  };
  const preview = await previewAdminOperation({
    actor: "boss",
    brokerKey: "test-broker-key-that-is-not-a-secret",
    brokerUrl: "https://broker.example",
    client: asClient(client),
    requestId: "97000000-0000-4000-8000-000000000001",
    sessionHash: "a".repeat(64),
  }, {
    action: "member_add",
    idempotencyKey: "97100000-0000-4000-8000-000000000001",
    targetId: tripId,
    payload: { email: "future@example.invalid", role: "admin" },
  });

  assertEquals(preview.status, "previewed");
  assertEquals(calls[0].name, "admin_operation_preview_r2_create");
  assertEquals(calls[0].args.p_payload, {
    email: "future@example.invalid",
    role: "admin",
    userId: null,
  });
  assertEquals(calls[0].args.p_target_version, "invite-absent:2026-07-11T00:00:00.000Z");
});

Deno.test("member role preview binds the resolved membership primary key", async () => {
  const tripId = "97200000-0000-4000-8000-000000000001";
  const userId = "97200000-0000-4000-8000-000000000002";
  const membershipId = "97200000-0000-4000-8000-000000000003";
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          if (table === "trips") {
            return Promise.resolve({
              data: {
                id: tripId,
                name: "Nagoya",
                owner_id: "97000000-0000-4000-8000-000000000001",
              },
              error: null,
            });
          }
          if (table === "trip_members") {
            return Promise.resolve({
              data: {
                id: membershipId,
                trip_id: tripId,
                user_id: userId,
                role: "editor",
                status: "active",
                updated_at: "2026-07-11T00:00:00.000Z",
              },
              error: null,
            });
          }
          throw new Error(`Unexpected table ${table}`);
        },
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({
        data: { id: args.p_id, action: "member_role", risk: "R2", status: "previewed" },
        error: null,
      });
    },
  };

  await previewAdminOperation({
    actor: "boss",
    brokerKey: "test-broker-key-that-is-not-a-secret",
    brokerUrl: "https://broker.example",
    client: asClient(client),
    requestId: "97000000-0000-4000-8000-000000000001",
    sessionHash: "a".repeat(64),
  }, {
    action: "member_role",
    idempotencyKey: "97100000-0000-4000-8000-000000000001",
    targetId: tripId,
    payload: { role: "viewer", userId },
  });

  assertEquals(calls[0].name, "admin_operation_preview_r2_create");
  assertEquals(calls[0].args.p_target_type, "membership");
  assertEquals(calls[0].args.p_target_ref, membershipId);
  assertEquals(calls[0].args.p_target_version, "2026-07-11T00:00:00.000Z");
});

Deno.test("invite commit exposes an ephemeral compact link without adding it to the operation", async () => {
  const operationId = "97300000-0000-4000-8000-000000000001";
  const token = "ab".repeat(32);
  const client = {
    rpc(name: string) {
      if (name === "admin_operation_get") {
        return Promise.resolve({
          data: { id: operationId, action: "member_add", risk: "R2", status: "previewed" },
          error: null,
        });
      }
      if (name === "admin_operation_commit_r2") {
        return Promise.resolve({
          data: {
            operation: {
              id: operationId,
              action: "member_add",
              risk: "R2",
              status: "completed",
              result: { inviteId: "97400000-0000-4000-8000-000000000001" },
            },
            inviteToken: token,
            expiresAt: "2026-07-25T00:00:00.000Z",
          },
          error: null,
        });
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const result = await commitAdminOperation(
    {
      actor: "boss",
      brokerKey: "test-broker-key-that-is-not-a-secret",
      brokerUrl: "https://broker.example",
      client: asClient(client),
      requestId: "97000000-0000-4000-8000-000000000001",
      sessionHash: "b".repeat(64),
    },
    operationId,
    {
      grantId: "97400000-0000-4000-8000-000000000001",
    },
  );

  assertEquals(result.operation.status, "completed");
  assertEquals(result.operation.result?.inviteToken, undefined);
  assertEquals(
    result.invite?.link,
    `https://travel-expense-compact.vercel.app/#accept-invite?token=${token}`,
  );
});

Deno.test("provider probe transport ambiguity is retained as outcome unknown", async () => {
  const operationId = "97300000-0000-4000-8000-000000000001";
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (_input, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    assertEquals(body, {
      provider: "google",
      model: "google/gemma-4-31b-it",
    });
    return Promise.reject(new Error("transport interrupted"));
  };
  try {
    const error = await assertRejects(
      () =>
        commitAdminOperation({
          actor: "boss",
          brokerKey: "test-broker-key-that-is-not-a-secret",
          brokerUrl: "https://broker.example",
          client: asClient({
            rpc(name: string, args: Record<string, unknown>) {
              calls.push({ name, args });
              if (name === "admin_operation_get") {
                return Promise.resolve({
                  data: {
                    action: "provider_probe",
                    id: operationId,
                    risk: "R1",
                    status: "previewed",
                  },
                  error: null,
                });
              }
              if (name === "admin_operation_begin_external") {
                return Promise.resolve({
                  data: {
                    action: "provider_probe",
                    id: operationId,
                    payload: { model: "google/gemma-4-31b-it" },
                    status: "executing",
                    targetRef: "google",
                  },
                  error: null,
                });
              }
              if (name === "admin_operation_finish_external") {
                return Promise.resolve({
                  data: { id: operationId, status: args.p_status },
                  error: null,
                });
              }
              throw new Error(`Unexpected RPC ${name}`);
            },
          }),
          requestId: "97000000-0000-4000-8000-000000000001",
          sessionHash: "b".repeat(64),
        }, operationId),
      AdminOperationError,
    );
    assertEquals(error.code, "OUTCOME_UNKNOWN");
    assertEquals(
      calls.find((call) => call.name === "admin_operation_finish_external")?.args.p_status,
      "outcome_unknown",
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

Deno.test("member add fails closed when the bounded account directory is incomplete", async () => {
  const fullPage = Array.from({ length: 1000 }, (_, index) => ({
    email: `member-${index}@example.invalid`,
  }));
  let directoryCalls = 0;
  let inviteLookup = false;
  const error = await assertRejects(
    () =>
      previewAdminOperation({
        actor: "boss",
        brokerKey: "test-broker-key-that-is-not-a-secret",
        brokerUrl: "https://broker.example",
        client: asClient({
          auth: {
            admin: {
              listUsers() {
                directoryCalls += 1;
                return Promise.resolve({ data: { users: fullPage }, error: null });
              },
            },
          },
          from(table: string) {
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              maybeSingle() {
                if (table === "trip_invites") inviteLookup = true;
                return Promise.resolve({
                  data: table === "trips"
                    ? { id: "97200000-0000-4000-8000-000000000001", owner_id: "owner" }
                    : null,
                  error: null,
                });
              },
            };
          },
        }),
        requestId: "97000000-0000-4000-8000-000000000001",
        sessionHash: "a".repeat(64),
      }, {
        action: "member_add",
        idempotencyKey: "97100000-0000-4000-8000-000000000001",
        targetId: "97200000-0000-4000-8000-000000000001",
        payload: { email: "missing@example.invalid", role: "viewer" },
      }),
    AdminOperationError,
  );
  assertEquals(error.code, "UPSTREAM_UNAVAILABLE");
  assertEquals(directoryCalls, 10);
  assertEquals(inviteLookup, false);
});
