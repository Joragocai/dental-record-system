import { buildPgFoundationConfig } from "../postgres/config.js";
import { createPgPoolManager, type PgPoolManager } from "../postgres/pool.js";
import { buildAttachmentStorageConfig } from "./attachmentStorageConfig.js";
import { createSupabaseAttachmentStorageAdapter, type AttachmentStorageAdapter } from "./attachmentStorageAdapter.js";
import { createAttachmentService, type AttachmentService } from "../services/attachmentPrivateService.js";

export interface AttachmentRuntime {
  getService(): AttachmentService;
  getStorage(): AttachmentStorageAdapter;
  shutdown(): Promise<void>;
}

export function createAttachmentRuntime(): AttachmentRuntime {
  let pool: PgPoolManager | null = null;
  let storage: AttachmentStorageAdapter | null = null;
  let service: AttachmentService | null = null;

  function ensureRuntime() {
    if (!pool) pool = createPgPoolManager(buildPgFoundationConfig());
    if (!storage) storage = createSupabaseAttachmentStorageAdapter(buildAttachmentStorageConfig());
    if (!service) service = createAttachmentService(pool, storage);
  }

  return {
    getService() {
      ensureRuntime();
      return service!;
    },
    getStorage() {
      ensureRuntime();
      return storage!;
    },
    async shutdown() {
      service = null;
      storage = null;
      if (!pool) return;
      const active = pool;
      pool = null;
      await active.shutdown();
    }
  };
}
