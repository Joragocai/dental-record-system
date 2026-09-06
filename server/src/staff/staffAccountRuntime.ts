import { buildPgFoundationConfig } from "../postgres/config.js";
import { createPgPoolManager, type PgPoolManager } from "../postgres/pool.js";
import {
  createStaffAccountManagementService,
  type StaffAccountManagementService
} from "../services/staffAccountManagementService.js";

export interface StaffAccountRuntime {
  getService(): StaffAccountManagementService;
  shutdown(): Promise<void>;
}

export function createStaffAccountRuntime(): StaffAccountRuntime {
  let pool: PgPoolManager | null = null;
  let service: StaffAccountManagementService | null = null;

  function getService(): StaffAccountManagementService {
    if (service) return service;
    const config = buildPgFoundationConfig();
    pool = createPgPoolManager(config);
    service = createStaffAccountManagementService(pool);
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
