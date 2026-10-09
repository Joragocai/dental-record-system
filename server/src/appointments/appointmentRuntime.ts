import { buildPgFoundationConfig } from "../postgres/config.js";
import { createPgPoolManager, type PgPoolManager } from "../postgres/pool.js";
import { createAppointmentDomainService, type AppointmentDomainService } from "../services/appointmentDomainService.js";

export interface AppointmentRuntime {
  getService(): AppointmentDomainService;
  shutdown(): Promise<void>;
}

export function createAppointmentRuntime(): AppointmentRuntime {
  let pool: PgPoolManager | null = null;
  let service: AppointmentDomainService | null = null;

  function getService(): AppointmentDomainService {
    if (service) return service;
    pool = createPgPoolManager(buildPgFoundationConfig());
    service = createAppointmentDomainService(pool);
    return service;
  }

  return {
    getService,
    async shutdown() {
      service = null;
      if (!pool) return;
      const active = pool;
      pool = null;
      await active.shutdown();
    }
  };
}
