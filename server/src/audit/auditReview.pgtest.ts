import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";
import { AuditReviewError } from "../services/auditReviewErrors.js";
import { createAuditReviewService } from "../services/auditReviewService.js";

const eventId = "11111111-1111-4111-8111-111111111111";
const actorUserId = "22222222-2222-4222-8222-222222222222";
const actorAuthUserId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const branchId = "55555555-5555-4555-8555-555555555555";

function result<R extends QueryResultRow>(rows: R[]): QueryResult<R> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

class FakePool implements PgPoolManager {
  transactionCalls = 0;
  readonly inserts: Array<readonly unknown[]> = [];
  readonly rows: Array<Record<string, unknown>> = [
    {
      id: eventId,
      actor_user_id: actorUserId,
      action: "STAFF_ACCOUNT_CREATED",
      target_type: "APP_USER",
      target_id: actorUserId,
      branch_id: branchId,
      outcome: "SUCCESS",
      metadata: { status: "pending" },
      occurred_at: "2026-10-08T01:00:00.000Z",
      request_id: requestId
    }
  ];

  describeTarget() {
    return {
      appEnv: "local" as const,
      host: "localhost",
      port: 5432,
      database: "test",
      username: "test",
      sslMode: "disable" as const
    };
  }

  isStarted() { return true; }
  async shutdown() {}

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<R>> {
    return this.execute<R>(text, values);
  }

  async withTransaction<T>(callback: (executor: PgQueryExecutor) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    return callback({
      query: <R extends QueryResultRow = QueryResultRow>(text: string, values: readonly unknown[] = []) =>
        this.execute<R>(text, values)
    });
  }

  private async execute<R extends QueryResultRow>(
    text: string,
    values: readonly unknown[]
  ): Promise<QueryResult<R>> {
    const normalized = text.replace(/\s+/g, " ").trim();

    if (normalized.startsWith("SELECT id, actor_user_id")) {
      if (normalized.includes("WHERE id = $1")) {
        return result(this.rows.filter((row) => row.id === values[0]) as unknown as R[]);
      }
      return result(this.rows as unknown as R[]);
    }

    if (normalized.startsWith("INSERT INTO audit_events")) {
      this.inserts.push(values);
      return result([] as R[]);
    }

    throw new Error(`Unexpected SQL: ${normalized}`);
  }
}

function actor() {
  return { userId: actorUserId, authUserId: actorAuthUserId, requestId };
}

test("audit review rejects malformed or unsupported filters before PostgreSQL access", async () => {
  const invalidInputs = [
    { branchId: "not-a-uuid" },
    { actorUserId: "not-a-uuid" },
    { outcome: "maybe" },
    { occurredFrom: "2026-10-08" },
    { occurredFrom: "2026-10-09T00:00:00Z", occurredTo: "2026-10-08T00:00:00Z" },
    { limit: 0 },
    { limit: "1.5" },
    { offset: -1 },
    { unsupported: "value" }
  ];

  for (const input of invalidInputs) {
    const pool = new FakePool();
    const service = createAuditReviewService(pool);
    await assert.rejects(
      service.list(input as never, actor()),
      (error) => error instanceof AuditReviewError && error.code === "AUDIT_REVIEW_INPUT_INVALID"
    );
    assert.equal(pool.transactionCalls, 0);
  }
});

test("audit list records AUDIT_LOG_VIEWED with trusted request correlation", async () => {
  const pool = new FakePool();
  const service = createAuditReviewService(pool);

  const response = await service.list({ limit: "25", outcome: "success" }, actor());

  assert.equal(response.items.length, 1);
  assert.equal(response.limit, 25);
  assert.equal(response.items[0]?.requestId, requestId);
  assert.equal(pool.inserts.length, 1);
  assert.equal(pool.inserts[0]?.[3], "AUDIT_LOG_VIEWED");
  assert.equal(pool.inserts[0]?.[10], requestId);
});

test("audit list and detail defensively redact unsafe historical metadata", async () => {
  const pool = new FakePool();
  pool.rows[0]!.metadata = {
    apiKey: "should-not-leak",
    nested: {
      credential: "should-not-leak-either",
      safeNote: "allowed"
    }
  };
  const service = createAuditReviewService(pool);

  const listed = await service.list({ limit: 10 }, actor());
  assert.deepEqual(listed.items[0]?.metadata, {
    apiKey: "[REDACTED]",
    nested: {
      credential: "[REDACTED]",
      safeNote: "allowed"
    }
  });

  const detailed = await service.detail(eventId, actor());
  assert.deepEqual(detailed.metadata, {
    apiKey: "[REDACTED]",
    nested: {
      credential: "[REDACTED]",
      safeNote: "allowed"
    }
  });
});

test("audit detail returns not found safely and does not create a view event", async () => {
  const pool = new FakePool();
  const service = createAuditReviewService(pool);
  const missing = "66666666-6666-4666-8666-666666666666";

  await assert.rejects(
    service.detail(missing, actor()),
    (error) => error instanceof AuditReviewError && error.code === "AUDIT_REVIEW_NOT_FOUND"
  );
  assert.equal(pool.inserts.length, 0);
});

test("audit export is bounded, records AUDIT_LOG_EXPORTED, and redacts unsafe metadata", async () => {
  const pool = new FakePool();
  pool.rows[0]!.metadata = {
    apiKey: "should-not-export",
    nested: { credential: "should-not-export-either" },
    safeNote: "allowed"
  };
  const service = createAuditReviewService(pool);

  await assert.rejects(
    service.exportCsv({ limit: 1001 }, actor()),
    (error) => error instanceof AuditReviewError && error.code === "AUDIT_REVIEW_INPUT_INVALID"
  );

  const csv = await service.exportCsv({ limit: 1000 }, actor());
  assert.equal(pool.transactionCalls, 1);
  assert.match(csv, /"request_id"/);
  assert.match(csv, /\[REDACTED\]/);
  assert.match(csv, /safeNote/);
  assert.doesNotMatch(csv, /should-not-export/);
  assert.doesNotMatch(csv, /actor_auth_user_id/i);
  assert.equal(pool.inserts.at(-1)?.[3], "AUDIT_LOG_EXPORTED");
  assert.equal(pool.inserts.at(-1)?.[10], requestId);
});

test("audit CSV neutralizes spreadsheet formula prefixes, including leading whitespace", async () => {
  const dangerousValues = ["=DANGEROUS", "+DANGEROUS", "-DANGEROUS", "@DANGEROUS", " \t=DANGEROUS"];

  for (const dangerousValue of dangerousValues) {
    const pool = new FakePool();
    pool.rows[0]!.action = dangerousValue;
    const service = createAuditReviewService(pool);

    const csv = await service.exportCsv({ limit: 10 }, actor());

    assert.ok(csv.includes(`"'${dangerousValue}"`));
    assert.equal(csv.includes(`"${dangerousValue}"`), false);
  }
});
