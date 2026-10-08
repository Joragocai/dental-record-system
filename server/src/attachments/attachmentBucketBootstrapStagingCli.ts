import { assertSupabaseDatabaseIdentity } from "../config/hostedSafety.js";
import { buildPgFoundationConfig } from "../postgres/config.js";
import { buildAttachmentStorageConfig } from "./attachmentStorageConfig.js";
import { createSupabaseAttachmentStorageAdapter } from "./attachmentStorageAdapter.js";

async function main(): Promise<void> {
  if (process.env.DENTAL_SERVER_ENV !== "staging") {
    throw new Error("Staging storage bootstrap requires DENTAL_SERVER_ENV=staging.");
  }
  const database = buildPgFoundationConfig();
  const storage = buildAttachmentStorageConfig();
  if (database.appEnv !== "staging" || database.sslMode !== "require") {
    throw new Error("Staging storage bootstrap requires verified staging PostgreSQL TLS.");
  }
  assertSupabaseDatabaseIdentity(database.databaseUrl, storage.supabaseUrl);
  if (storage.bucket !== "dental-attachments-staging") {
    throw new Error("Staging storage bucket must be dental-attachments-staging.");
  }

  const adapter = createSupabaseAttachmentStorageAdapter(storage);
  await adapter.ensurePrivateBucket({ createIfMissing: true });
  // Recheck the complete private bucket policy after a create or idempotent verify.
  await adapter.ensurePrivateBucket();
  console.log(`[attachments] Staging private Storage bucket verified: ${storage.bucket}`);
}

main().catch((error: unknown) => {
  // Only emit our safe own messages; never log URL, provider credentials or headers.
  const message = error instanceof Error ? error.message : "Staging bucket validation failed.";
  console.error(`[attachments] Staging bootstrap failed: ${message}`);
  process.exitCode = 1;
});
