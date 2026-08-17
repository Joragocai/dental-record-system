import type { QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../pool.js";

export interface BranchRecord {
  id: string;
  branchCode: string;
  branchName: string;
  createdAt: string;
  updatedAt: string;
}

interface BranchRow extends QueryResultRow {
  id: string;
  branch_code: string;
  branch_name: string;
  created_at: string | Date;
  updated_at: string | Date;
}

function toIsoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapBranchRow(row: BranchRow): BranchRecord {
  return {
    id: String(row.id),
    branchCode: String(row.branch_code),
    branchName: String(row.branch_name),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at)
  };
}

export async function insertBranch(executor: PgQueryExecutor, branch: BranchRecord): Promise<BranchRecord> {
  const result = await executor.query<BranchRow>(
    `INSERT INTO branches (id, branch_code, branch_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, branch_code, branch_name, created_at, updated_at`,
    [branch.id, branch.branchCode, branch.branchName, branch.createdAt, branch.updatedAt]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Branch insert did not return a row.");
  }

  return mapBranchRow(row);
}

export async function getBranchById(executor: PgQueryExecutor, branchId: string): Promise<BranchRecord | null> {
  const result = await executor.query<BranchRow>(
    `SELECT id, branch_code, branch_name, created_at, updated_at
     FROM branches
     WHERE id = $1`,
    [branchId]
  );

  return result.rows[0] ? mapBranchRow(result.rows[0]) : null;
}
