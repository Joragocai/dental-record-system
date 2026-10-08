import { buildPgFoundationConfig } from "../postgres/config.js";
import { createPgPoolManager, type PgPoolManager } from "../postgres/pool.js";
import { createAuditReviewService, type AuditReviewService } from "../services/auditReviewService.js";

export interface AuditReviewRuntime {
  getService(): AuditReviewService;
  shutdown(): Promise<void>;
}

export function createAuditReviewRuntime(): AuditReviewRuntime {
  let pool: PgPoolManager | null = null;
  let service: AuditReviewService | null = null;

  return {
    getService() {
      if (service) return service;
      pool = createPgPoolManager(buildPgFoundationConfig());
      service = createAuditReviewService(pool);
      return service;
    },
    async shutdown() {
      service = null;
      if (!pool) return;
      const active = pool;
      pool = null;
      await active.shutdown();
    }
  };
}
