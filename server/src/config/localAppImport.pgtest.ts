import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("plain Node can import the local app without V2 database or storage secrets", () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.TEST_DATABASE_URL;
  delete env.SUPABASE_URL;
  delete env.SUPABASE_SECRET_KEY;
  delete env.SUPABASE_ATTACHMENT_BUCKET;
  delete env.DATABASE_SSL_CA_FILE;
  env.DENTAL_SERVER_ENV = "local";

  const result = spawnSync(
    process.execPath,
    ["-e", "import('./src/app.js').then(()=>console.log('ok'))"],
    {
      cwd: new URL("../..", import.meta.url),
      env,
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ok/);
});
