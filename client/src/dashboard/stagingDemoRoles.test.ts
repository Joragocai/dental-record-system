import assert from "node:assert/strict";
import test from "node:test";
import {demoRoleNames,demoRoleCards,isStagingDemoEnabled,demoTiles} from "./stagingDemoRoles.js";
test("demo tour ships exclusively in the staging build",()=>{
 assert.equal(isStagingDemoEnabled("staging",true),true);
 for(const mode of [undefined,"production","local","local-v2","test"])assert.equal(isStagingDemoEnabled(mode,true),false);
 assert.equal(isStagingDemoEnabled("staging",false),false);
});
test("six fictional roles have informational previews without credentials, protected URLs, or patient data",()=>{
 assert.equal(demoRoleNames.length,6);
 for(const role of demoRoleNames){
  const item=demoRoleCards[role];
  assert.ok(item.description.includes("fictional preview"));
  assert.ok(demoTiles(role).length>=4);
  assert.ok(!JSON.stringify(item).includes("/api/"));
  assert.ok(!JSON.stringify(item).includes("@"));
 }
});
