import { buildPgFoundationConfig } from "../postgres/config.js";
import { createPgPoolManager, type PgPoolManager } from "../postgres/pool.js";
import { createApplicationUserRepository } from "../repositories/applicationUserRepository.js";
import { createAuthorizationRepository } from "../repositories/authorizationRepository.js";
import { createApplicationUserService, type ApplicationUserService } from "../services/applicationUserService.js";
import { createAuthorizationService, type AuthorizationService } from "../services/authorizationService.js";

export interface AccessRuntimeServices {
  applicationUserService: ApplicationUserService;
  authorizationService: AuthorizationService;
}

export interface AccessRuntime {
  getServices(): AccessRuntimeServices;
  shutdown(): Promise<void>;
}

export function createAccessRuntime(): AccessRuntime {
  let pool: PgPoolManager | null = null;
  let services: AccessRuntimeServices | null = null;

  function getServices(): AccessRuntimeServices {
    if (services) return services;

    const config = buildPgFoundationConfig();
    pool = createPgPoolManager(config);
    const applicationUserRepository = createApplicationUserRepository(pool);
    const authorizationRepository = createAuthorizationRepository(pool);

    services = {
      applicationUserService: createApplicationUserService(applicationUserRepository),
      authorizationService: createAuthorizationService(authorizationRepository)
    };

    return services;
  }

  return {
    getServices,
    async shutdown() {
      services = null;
      if (!pool) return;
      const activePool = pool;
      pool = null;
      await activePool.shutdown();
    }
  };
}
