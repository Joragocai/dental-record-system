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
import {
  createInitialBranchBootstrapService,
  InitialBranchBootstrapError
} from "./initialBranchBootstrapService.js";

const confirmationPhrase = "BOOTSTRAP INITIAL BRANCH";

export async function runInitialBranchBootstrapCli(): Promise<void> {
  const pgConfig = buildPgFoundationConfig();
  assertPgMutationAllowed(pgConfig);
  const pool = createPgPoolManager(pgConfig);
  const service = createInitialBranchBootstrapService(pool);
  const rl = createInterface({ input, output });

  try {
    console.log(`[branch-bootstrap] Database target: ${formatPgTarget(pool.describeTarget())}`);
    console.log("[branch-bootstrap] This command creates only the first clinic branch.");
    console.log("[branch-bootstrap] Future branches should be created through the approved Clinic Administrator workflow.");

    const branchCode = await rl.question("Branch code (example MAIN): ");
    const branchName = await rl.question("Branch name: ");
    console.log(`[branch-bootstrap] Type exactly: ${confirmationPhrase}`);
    const confirmation = await rl.question("Confirmation: ");

    if (confirmation.trim() !== confirmationPhrase) {
      throw new Error("Initial branch bootstrap cancelled because the confirmation phrase did not match.");
    }

    const branch = await service.bootstrap({ branchCode, branchName });
    console.log("[branch-bootstrap] Initial branch created successfully.");
    console.log(`[branch-bootstrap] Branch UUID: ${branch.id}`);
    console.log(`[branch-bootstrap] Branch code: ${branch.branchCode}`);
    console.log(`[branch-bootstrap] Branch name: ${branch.branchName}`);
    console.log("[branch-bootstrap] You may now run npm run bootstrap:owner.");
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
  runInitialBranchBootstrapCli().catch((error) => {
    if (error instanceof InitialBranchBootstrapError) {
      console.error(`[branch-bootstrap] Failed safely: ${error.code}`);
    } else {
      console.error(`[branch-bootstrap] ${error instanceof Error ? error.message : "Initial branch bootstrap failed."}`);
    }
    process.exitCode = 1;
  });
}
