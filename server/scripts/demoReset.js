import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(currentDir, scriptName)], {
      stdio: "inherit",
      env: { ...process.env, DENTAL_APP_MODE: "demo" }
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${scriptName} exited with signal ${signal}.`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${scriptName} exited with status ${code}.`));
        return;
      }

      resolve();
    });
  });
}

try {
  await runScript("demoCleanup.js");
  await runScript("demoPrepare.js");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
