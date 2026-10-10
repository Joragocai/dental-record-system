import { buildPgFoundationConfig } from "../postgres/config.js";
import { createPgPoolManager, type PgPoolManager } from "../postgres/pool.js";
import {
  createInAppNotificationService,
  type InAppNotificationService
} from "../services/inAppNotificationService.js";

export interface InAppNotificationRuntime {
  getService(): InAppNotificationService;
  shutdown(): Promise<void>;
}

export function createInAppNotificationRuntime(): InAppNotificationRuntime {
  let pool: PgPoolManager | null = null;
  let service: InAppNotificationService | null = null;

  function getService(): InAppNotificationService {
    if (service) return service;
    const config = buildPgFoundationConfig();
    pool = createPgPoolManager({ ...config, maxPoolSize: 1 });
    service = createInAppNotificationService(pool);
    return service;
  }

  return {
    getService,
    async shutdown() {
      service = null;
      if (!pool) return;
      const activePool = pool;
      pool = null;
      await activePool.shutdown();
    }
  };
}
