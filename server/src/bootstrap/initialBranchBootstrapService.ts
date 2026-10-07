import crypto from "node:crypto";
import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";
import { insertBranch, type BranchRecord } from "../postgres/batchA/branches.js";

const branchCodePattern = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;

export class InitialBranchBootstrapError extends Error {
  constructor(
    readonly code:
      | "INITIAL_BRANCH_INPUT_INVALID"
      | "INITIAL_BRANCH_ALREADY_EXISTS"
      | "INITIAL_BRANCH_PERSISTENCE_ERROR"
  ) {
    super(code);
    this.name = "InitialBranchBootstrapError";
  }
}

export interface InitialBranchBootstrapInput {
  branchCode: unknown;
  branchName: unknown;
}

export interface InitialBranchBootstrapServiceOptions {
  createId?: () => string;
  now?: () => Date;
}

function normalizeBranchCode(value: unknown): string {
  if (typeof value !== "string") {
    throw new InitialBranchBootstrapError("INITIAL_BRANCH_INPUT_INVALID");
  }

  const normalized = value.trim().toUpperCase();
  if (!branchCodePattern.test(normalized)) {
    throw new InitialBranchBootstrapError("INITIAL_BRANCH_INPUT_INVALID");
  }
  return normalized;
}

function normalizeBranchName(value: unknown): string {
  if (typeof value !== "string") {
    throw new InitialBranchBootstrapError("INITIAL_BRANCH_INPUT_INVALID");
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 160) {
    throw new InitialBranchBootstrapError("INITIAL_BRANCH_INPUT_INVALID");
  }
  return normalized;
}

async function countBranches(executor: PgQueryExecutor): Promise<number> {
  const result = await executor.query<{ branch_count: string | number }>(
    "SELECT COUNT(*) AS branch_count FROM branches"
  );
  return Number(result.rows[0]?.branch_count ?? 0);
}

export function createInitialBranchBootstrapService(
  pool: PgPoolManager,
  options: InitialBranchBootstrapServiceOptions = {}
) {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());

  return {
    async bootstrap(input: InitialBranchBootstrapInput): Promise<BranchRecord> {
      const branchCode = normalizeBranchCode(input.branchCode);
      const branchName = normalizeBranchName(input.branchName);

      try {
        return await pool.withTransaction(async (executor) => {
          await executor.query("SELECT pg_advisory_xact_lock($1)", [813001]);

          if (await countBranches(executor)) {
            throw new InitialBranchBootstrapError("INITIAL_BRANCH_ALREADY_EXISTS");
          }

          const timestamp = now().toISOString();
          return insertBranch(executor, {
            id: createId(),
            branchCode,
            branchName,
            createdAt: timestamp,
            updatedAt: timestamp
          });
        });
      } catch (error) {
        if (error instanceof InitialBranchBootstrapError) throw error;
        throw new InitialBranchBootstrapError("INITIAL_BRANCH_PERSISTENCE_ERROR");
      }
    }
  };
}
