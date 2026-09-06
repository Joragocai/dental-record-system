import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../postgres/pool.js";
import { createStaffAccountRepository } from "../repositories/staffAccountRepository.js";

const userId = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";
const roleId = "33333333-3333-4333-8333-333333333333";

class RecordingExecutor implements PgQueryExecutor {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<R>> {
    this.calls.push({ text, values });
    let rows: QueryResultRow[] = [];
    if (text.includes("SELECT EXISTS")) rows = [{ exists: false }];
    if (text.includes("FROM roles")) rows = [{ id: roleId, code: "PERSONNEL" }];
    if (text.includes("FROM branches")) rows = [{ id: branchId }];
    return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows: rows as R[] };
  }
}

test("StaffAccountRepository parameterizes email, role, branch, and assignment writes", async () => {
  const executor = new RecordingExecutor();
  const repository = createStaffAccountRepository(executor);

  await repository.emailExists("staff@example.test");
  const roles = await repository.resolveRoleIds(["PERSONNEL"]);
  const branches = await repository.resolveExistingBranchIds([branchId]);
  await repository.insertPendingUser({ id: userId, email: "staff@example.test", displayName: "Fictional Staff", status: "pending" });
  await repository.insertRoleAssignments(userId, [roleId]);
  await repository.insertBranchAssignments(userId, [branchId]);

  assert.equal(roles.get("PERSONNEL"), roleId);
  assert.equal(branches.has(branchId), true);
  assert.equal(executor.calls.length, 6);
  for (const call of executor.calls) {
    assert.match(call.text, /\$1/);
    assert.ok(call.values.length >= 1);
  }
  assert.doesNotMatch(executor.calls[0]?.text ?? "", /staff@example\.test/);
  assert.doesNotMatch(executor.calls[3]?.text ?? "", /Fictional Staff|staff@example\.test/);
});
