import path from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  assertPgMutationAllowed,
  buildPgFoundationConfig,
  formatPgTarget
} from "../postgres/config.js";
import { createPgPoolManager } from "../postgres/pool.js";
import { buildStaffProvisioningConfig } from "../staff/staffProvisioningConfig.js";
import { createSupabaseStaffProvisioningProvider } from "../staff/supabaseStaffProvisioningProvider.js";
import { createInitialOwnerBootstrapService } from "./initialOwnerBootstrapService.js";
import { InitialOwnerBootstrapError } from "./initialOwnerBootstrapErrors.js";

const confirmationPhrase = "BOOTSTRAP INITIAL OWNER";

export async function runInitialOwnerBootstrapCli(): Promise<void> {
  const pgConfig = buildPgFoundationConfig();
  assertPgMutationAllowed(pgConfig);
  const provisioningConfig = buildStaffProvisioningConfig();
  const pool = createPgPoolManager(pgConfig);
  const provider = createSupabaseStaffProvisioningProvider(provisioningConfig);
  const service = createInitialOwnerBootstrapService(pool, provider, {
    inviteRedirectUrl: provisioningConfig.inviteRedirectUrl
  });
  const rl = createInterface({ input, output });

  try {
    console.log(`[bootstrap] Database target: ${formatPgTarget(pool.describeTarget())}`);
    console.log("[bootstrap] This command can create the initial Clinic Administrator only once.");
    console.log("[bootstrap] The owner will receive DENTIST + CLINIC_ADMINISTRATOR and will choose their own password from the invitation email.");

    const branches = await service.listBranches();
    if (branches.length === 0) {
      throw new Error("No clinic branches exist. Create the approved branch before bootstrapping the owner.");
    }

    console.log("[bootstrap] Available branches:");
    for (const branch of branches) {
      console.log(`  ${branch.id}  ${branch.code} — ${branch.name}`);
    }

    const displayName = await rl.question("Owner display name: ");
    const email = await rl.question("Owner email address: ");
    const branchId = await rl.question("Branch UUID: ");
    console.log(`[bootstrap] Type exactly: ${confirmationPhrase}`);
    const confirmation = await rl.question("Confirmation: ");
    if (confirmation.trim() !== confirmationPhrase) {
      throw new Error("Bootstrap cancelled because the confirmation phrase did not match.");
    }

    const result = await service.bootstrap({ displayName, email, branchId });
    console.log(`[bootstrap] Pending owner account created: ${result.id}`);
    console.log("[bootstrap] Roles: DENTIST + CLINIC_ADMINISTRATOR");
    console.log("[bootstrap] Invitation sent. The owner must open the email, choose their own password, and complete activation.");
    console.log("[bootstrap] The owner remains pending until activation succeeds.");
  } finally {
    rl.close();
    await pool.shutdown();
  }
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) return false;
  return import.meta.url === pathToFileURL(path.resolve(entrypoint)).href;
}

if (isDirectExecution()) {
  runInitialOwnerBootstrapCli().catch((error) => {
    if (error instanceof InitialOwnerBootstrapError) {
      console.error(`[bootstrap] Failed safely: ${error.code}`);
    } else {
      const message = error instanceof Error ? error.message : "Bootstrap failed.";
      console.error(`[bootstrap] ${message}`);
    }
    process.exitCode = 1;
  });
}
