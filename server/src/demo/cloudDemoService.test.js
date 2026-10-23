import test from "node:test";
import assert from "node:assert/strict";
import { mutateCloudDemo, cloudDemoStatus } from "./cloudDemoService.js";

test("hosted Demo Fill and Reset fail closed with no database transaction when not opted in", async () => {
  let connections = 0;
  const pool = {connect: async () => {connections++; throw new Error("must not connect");}};
  for (const operation of ["fill", "clear"]) {
    await assert.rejects(mutateCloudDemo({pool, operation, env:{}}), /not enabled/);
  }
  assert.equal(connections, 0);
});

test("cloud runtime status hides demo tools when configuration is absent", async () => {
  const status = await cloudDemoStatus({query: async () => {throw new Error("unexpected query");}}, {});
  assert.equal(status.isDemoMode, false);
  assert.equal(status.automaticBackupEnabled, false);
});
