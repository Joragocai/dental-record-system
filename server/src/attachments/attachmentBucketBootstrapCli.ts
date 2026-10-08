import { buildAttachmentStorageConfig } from "./attachmentStorageConfig.js";
import { createSupabaseAttachmentStorageAdapter } from "./attachmentStorageAdapter.js";

async function main(): Promise<void> {
  const config = buildAttachmentStorageConfig();
  const storage = createSupabaseAttachmentStorageAdapter(config);
  await storage.ensurePrivateBucket({ createIfMissing: true });
  console.log(`[attachments] Private bucket verified: ${config.bucket}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown private storage error.";
  console.error(`[attachments] Bucket verification failed: ${message}`);
  process.exitCode = 1;
});
