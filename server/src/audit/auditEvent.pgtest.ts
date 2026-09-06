import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../postgres/pool.js";
import { createAuditEventRepository, type AuditEventRecord } from "../repositories/auditEventRepository.js";
import { AuditEventError, assertAuditMetadataSafe, createAuditEventService } from "../services/auditEventService.js";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const actorAuthUserId = "22222222-2222-4222-8222-222222222222";
const targetUserId = "33333333-3333-4333-8333-333333333333";
const branchA = "44444444-4444-4444-8444-444444444444";
const auditId = "55555555-5555-4555-8555-555555555555";

class RecordingExecutor implements PgQueryExecutor {
  readonly queries: Array<{ text: string; values: readonly unknown[] }> = [];

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<R>> {
    this.queries.push({ text, values });
    return { command: "INSERT", rowCount: 1, oid: 0, fields: [], rows: [] } as QueryResult<R>;
  }
}

test("audit service records safe deterministic staff-account creation metadata", async () => {
  const inserted: AuditEventRecord[] = [];
  const service = createAuditEventService(
    { async insert(event) { inserted.push(event); } },
    {
      createId: () => auditId,
      now: () => new Date("2026-09-06T07:00:00.000Z")
    }
  );

  await service.recordStaffAccountCreated({
    actorUserId,
    actorAuthUserId,
    targetUserId,
    roles: ["PERSONNEL", "DENTIST"],
    branchIds: [branchA]
  });

  assert.deepEqual(inserted, [{
    id: auditId,
    actorUserId,
    actorAuthUserId,
    action: "STAFF_ACCOUNT_CREATED",
    targetType: "APP_USER",
    targetId: targetUserId,
    branchId: null,
    outcome: "SUCCESS",
    metadata: {
      roles: ["DENTIST", "PERSONNEL"],
      branchIds: [branchA],
      status: "pending"
    },
    occurredAt: "2026-09-06T07:00:00.000Z"
  }]);
});

test("audit metadata safety rejects secret-shaped keys and obvious credential values recursively", () => {
  const unsafeValues = [
    { password: "example" },
    { nested: { refreshToken: "example" } },
    { nested: [{ service_role: "example" }] },
    { value: "Bearer abc.def.ghi" },
    { value: "postgresql://user:password@localhost/db" },
    { authorizationHeader: "anything" },
    { cookie: "session=value" }
  ];

  for (const value of unsafeValues) {
    assert.throws(() => assertAuditMetadataSafe(value), AuditEventError);
  }

  assert.doesNotThrow(() => assertAuditMetadataSafe({
    roles: ["PERSONNEL"],
    branchIds: [branchA],
    status: "pending"
  }));
});

test("audit repository uses one parameterized insert and serializes metadata without SQL interpolation", async () => {
  const executor = new RecordingExecutor();
  const repository = createAuditEventRepository(executor);
  const event: AuditEventRecord = {
    id: auditId,
    actorUserId,
    actorAuthUserId,
    action: "STAFF_ACCOUNT_CREATED",
    targetType: "APP_USER",
    targetId: targetUserId,
    branchId: null,
    outcome: "SUCCESS",
    metadata: { roles: ["PERSONNEL"], branchIds: [branchA], status: "pending" },
    occurredAt: "2026-09-06T07:00:00.000Z"
  };

  await repository.insert(event);

  assert.equal(executor.queries.length, 1);
  const query = executor.queries[0]!;
  assert.match(query.text, /INSERT INTO audit_events/);
  for (let index = 1; index <= 10; index += 1) {
    assert.match(query.text, new RegExp(`\\$${index}`));
  }
  assert.deepEqual(query.values.slice(0, 8), [
    auditId,
    actorUserId,
    actorAuthUserId,
    "STAFF_ACCOUNT_CREATED",
    "APP_USER",
    targetUserId,
    null,
    "SUCCESS"
  ]);
  assert.equal(typeof query.values[8], "string");
  assert.equal(query.values[9], "2026-09-06T07:00:00.000Z");
  assert.doesNotMatch(query.text, /PERSONNEL|Bearer|postgresql:\/\//i);
});
