import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../postgres/pool.js";
import {
  auditExportMaxLimit,
  createAuditReviewRepository
} from "../repositories/auditReviewRepository.js";

class RecordingExecutor implements PgQueryExecutor {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<R>> {
    this.calls.push({ text, values });
    return {
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
      rows: []
    } as QueryResult<R>;
  }
}

test("audit review repository builds parameterized newest-first list queries", async () => {
  const executor = new RecordingExecutor();
  const repository = createAuditReviewRepository(executor);

  await repository.list({
    action: "USER_ACTIVATED",
    outcome: "SUCCESS",
    branchId: "11111111-1111-4111-8111-111111111111",
    actorUserId: "22222222-2222-4222-8222-222222222222",
    targetType: "APP_USER",
    occurredFrom: "2026-10-01T00:00:00.000Z",
    occurredTo: "2026-10-08T23:59:59.999Z",
    limit: 25,
    offset: 10
  });

  assert.equal(executor.calls.length, 1);
  const call = executor.calls[0]!;
  assert.match(call.text, /action = \$1/);
  assert.match(call.text, /outcome = \$2/);
  assert.match(call.text, /branch_id = \$3/);
  assert.match(call.text, /actor_user_id = \$4/);
  assert.match(call.text, /target_type = \$5/);
  assert.match(call.text, /occurred_at >= \$6/);
  assert.match(call.text, /occurred_at <= \$7/);
  assert.match(call.text, /ORDER BY occurred_at DESC, id DESC/);
  assert.match(call.text, /LIMIT \$8 OFFSET \$9/);
  assert.deepEqual(call.values, [
    "USER_ACTIVATED",
    "SUCCESS",
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "APP_USER",
    "2026-10-01T00:00:00.000Z",
    "2026-10-08T23:59:59.999Z",
    25,
    10
  ]);
  assert.doesNotMatch(call.text, /USER_ACTIVATED|11111111-1111-4111-8111-111111111111/);
});

test("audit review repository detail is parameterized by UUID", async () => {
  const executor = new RecordingExecutor();
  const repository = createAuditReviewRepository(executor);
  const id = "33333333-3333-4333-8333-333333333333";

  await repository.getById(id);

  assert.equal(executor.calls.length, 1);
  assert.match(executor.calls[0]!.text, /WHERE id = \$1/);
  assert.deepEqual(executor.calls[0]!.values, [id]);
  assert.doesNotMatch(executor.calls[0]!.text, new RegExp(id));
});

test("audit review repository independently enforces export bounds", async () => {
  const executor = new RecordingExecutor();
  const repository = createAuditReviewRepository(executor);

  await assert.rejects(
    repository.exportBounded({
      limit: auditExportMaxLimit + 1,
      offset: 0
    }),
    /bounds are invalid/
  );
  assert.equal(executor.calls.length, 0);
});
