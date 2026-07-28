import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const childProcesses = new Set();
let shuttingDown = false;

function terminateChildren() {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of childProcesses) {
    try {
      child.kill("SIGINT");
    } catch {
      // Best effort.
    }
  }

  setTimeout(() => {
    for (const child of childProcesses) {
      try {
        child.kill("SIGTERM");
      } catch {
        // Best effort.
      }
    }
  }, 1000).unref();
}

function spawnCommand(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    ...options
  });
  childProcesses.add(child);
  child.once("exit", () => childProcesses.delete(child));
  return child;
}

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal && !shuttingDown) {
        reject(new Error(`${label} exited with signal ${signal}.`));
        return;
      }

      resolve(code ?? 0);
    });
  });
}

async function runPrepare() {
  const prepareProcess = spawnCommand(npmCommand, ["run", "demo:prepare"]);
  const exitCode = await waitForExit(prepareProcess, "demo:prepare");
  if (exitCode !== 0) {
    throw new Error(`demo:prepare exited with status ${exitCode}.`);
  }
}

async function run() {
  await runPrepare();

  const serverProcess = spawnCommand(npmCommand, ["run", "dev", "--workspace", "server"], {
    env: { ...process.env, DENTAL_APP_MODE: "demo" }
  });
  const clientProcess = spawnCommand(npmCommand, ["run", "dev", "--workspace", "client"]);

  const serverExitPromise = waitForExit(serverProcess, "demo server");
  const clientExitPromise = waitForExit(clientProcess, "demo client");

  const [serverExitCode, clientExitCode] = await Promise.race([
    serverExitPromise.then((code) => [code, null]),
    clientExitPromise.then((code) => [null, code])
  ]);

  if (!shuttingDown) {
    terminateChildren();
  }

  const finalCode = serverExitCode ?? clientExitCode ?? 0;
  if (finalCode !== 0) {
    process.exitCode = finalCode;
  }
}

process.on("SIGINT", () => {
  terminateChildren();
  process.exitCode = 0;
});

process.on("SIGTERM", () => {
  terminateChildren();
  process.exitCode = 0;
});

try {
  await run();
} catch (error) {
  terminateChildren();
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
