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

const confirmationPhrase = "RESEND INITIAL OWNER INVITATION";

export async function runInitialOwnerInvitationResendCli(): Promise<void> {
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
    console.log(`[bootstrap-resend] Database target: ${formatPgTarget(pool.describeTarget())}`);
    console.log("[bootstrap-resend] This command sends a fresh activation-recovery email for the existing pending initial owner.");
    console.log("[bootstrap-resend] It does not create another owner or modify role assignments.");
    console.log(`[bootstrap-resend] Type exactly: ${confirmationPhrase}`);
    const confirmation = await rl.question("Confirmation: ");
    if (confirmation.trim() !== confirmationPhrase) {
      throw new Error("Invitation resend cancelled because the confirmation phrase did not match.");
    }

    const result = await service.resendPendingOwnerInvitation();
    console.log(`[bootstrap-resend] Activation-recovery email sent for pending owner: ${result.id}`);
    console.log("[bootstrap-resend] Open the newest recovery email on the computer running the local app.");
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
  runInitialOwnerInvitationResendCli().catch((error) => {
    if (error instanceof InitialOwnerBootstrapError) {
      console.error(`[bootstrap-resend] Failed safely: ${error.code}`);
    } else {
      const message = error instanceof Error ? error.message : "Invitation resend failed.";
      console.error(`[bootstrap-resend] ${message}`);
    }
    process.exitCode = 1;
  });
}
