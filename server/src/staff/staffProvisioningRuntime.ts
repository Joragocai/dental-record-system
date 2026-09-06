import { buildPgFoundationConfig } from "../postgres/config.js";
import { createPgPoolManager, type PgPoolManager } from "../postgres/pool.js";
import {
  createStaffProvisioningService,
  type StaffProvisioningService
} from "../services/staffProvisioningService.js";
import { buildStaffProvisioningConfig } from "./staffProvisioningConfig.js";
import { createSupabaseStaffProvisioningProvider } from "./supabaseStaffProvisioningProvider.js";

export interface StaffProvisioningRuntime {
  getService(): StaffProvisioningService;
  shutdown(): Promise<void>;
}

export function createStaffProvisioningRuntime(): StaffProvisioningRuntime {
  let pool: PgPoolManager | null = null;
  let service: StaffProvisioningService | null = null;

  return {
    getService() {
      if (service) return service;
      const pgConfig = buildPgFoundationConfig();
      const provisioningConfig = buildStaffProvisioningConfig();
      pool = createPgPoolManager(pgConfig);
      const provider = createSupabaseStaffProvisioningProvider(provisioningConfig);
      service = createStaffProvisioningService(pool, provider, {
        inviteRedirectUrl: provisioningConfig.inviteRedirectUrl
      });
      return service;
    },
    async shutdown() {
      service = null;
      if (!pool) return;
      const activePool = pool;
      pool = null;
      await activePool.shutdown();
    }
  };
}
