import { assertEquals, assertRejects } from "@std/assert";

import {
  AdminOperationError,
  canonicalJson,
  commitAdminOperation,
  type OperationContext,
  previewAdminOperation,
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
    targetId: "google",
    payload: {},
  });

  assertEquals(result.status, "previewed");
  assertEquals(calls.map((call) => call.name), [
    "admin_operation_list",
    "admin_operation_preview_create",
  ]);
  assertEquals(calls[1].args.p_action, "provider_probe");
  assertEquals(calls[1].args.p_target_ref, "google");
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
