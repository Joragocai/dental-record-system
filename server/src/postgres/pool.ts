import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { buildPgPoolConfig, type PgConnectionSummary, type PgFoundationConfig } from "./config.js";

export interface PgQueryExecutor {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<R>>;
}

export interface PgPoolClientLike extends PgQueryExecutor {
  release(): void;
}

export interface PgPoolLike extends PgQueryExecutor {
  connect(): Promise<PgPoolClientLike>;
  end(): Promise<void>;
}

export type PgPoolConstructor = new (config: PoolConfig) => PgPoolLike;

export interface PgPoolManager extends PgQueryExecutor {
  describeTarget(): PgConnectionSummary;
  isStarted(): boolean;
  shutdown(): Promise<void>;
  withTransaction<T>(callback: (executor: PgQueryExecutor) => Promise<T>): Promise<T>;
}

function cloneQueryValues(values?: readonly unknown[]): unknown[] {
  return values ? [...values] : [];
}

class NodePgPool extends Pool implements PgPoolLike {}

export function createPgPoolManager(
  config: PgFoundationConfig,
  PoolCtor: PgPoolConstructor = NodePgPool
): PgPoolManager {
  let pool: PgPoolLike | null = null;

  function getPool(): PgPoolLike {
    if (!pool) {
      pool = new PoolCtor(buildPgPoolConfig(config));
    }

    return pool;
  }

  return {
    describeTarget() {
      return {
        appEnv: config.appEnv,
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        sslMode: config.sslMode
      };
    },
    isStarted() {
      return pool !== null;
    },
    async query<R extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: readonly unknown[]
    ): Promise<QueryResult<R>> {
      return getPool().query<R>(text, cloneQueryValues(values));
    },
    async withTransaction<T>(callback: (executor: PgQueryExecutor) => Promise<T>): Promise<T> {
      const client = await getPool().connect();

      try {
        await client.query("BEGIN");
        const result = await callback({
          query<R extends QueryResultRow = QueryResultRow>(
            text: string,
            values?: readonly unknown[]
          ): Promise<QueryResult<R>> {
            return client.query<R>(text, cloneQueryValues(values));
          }
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original failure if rollback also fails.
        }
        throw error;
      } finally {
        client.release();
      }
    },
    async shutdown(): Promise<void> {
      if (!pool) {
        return;
      }

      const activePool = pool;
      pool = null;
      await activePool.end();
    }
  };
}
