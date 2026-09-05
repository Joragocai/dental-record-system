import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

// Keep the default `node --test` suite compatible while the focused TypeScript
// authentication suite runs through tsx as `auth.pgtest.ts`.
test("authentication focused test suite is present", () => {
  const focusedSuite = path.join(process.cwd(), "server", "src", "auth", "auth.pgtest.ts");
  assert.equal(fs.existsSync(focusedSuite), true);
});
