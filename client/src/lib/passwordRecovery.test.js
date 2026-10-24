import test from "node:test";
import assert from "node:assert/strict";
import { readRecoveryCallback, validateNewPassword } from "./passwordRecovery.js";

test("recognizes a Supabase recovery session in URL fragment",()=>{
  assert.deepEqual(readRecoveryCallback({hash:"#access_token=abc123&refresh_token=refresh&type=recovery"}),{kind:"session",accessToken:"abc123"});
});
test("recognizes token_hash recovery links",()=>{
  assert.deepEqual(readRecoveryCallback({search:"?token_hash=hash123&type=recovery"}),{kind:"token",tokenHash:"hash123"});
});
test("rejects expired and unrelated callback links",()=>{
  assert.deepEqual(readRecoveryCallback({hash:"#error=access_denied&error_description=Expired"}),{kind:"error"});
  assert.deepEqual(readRecoveryCallback({hash:"#access_token=token&type=signup"}),{kind:"missing"});
  assert.deepEqual(readRecoveryCallback({search:"?token_hash=token&type=magiclink"}),{kind:"missing"});
  assert.deepEqual(readRecoveryCallback({}),{kind:"missing"});
});
test("new password validation rejects short, overly long and mismatched values",()=>{
  assert.match(validateNewPassword("short","short"),/8 characters/);
  assert.match(validateNewPassword("A".repeat(73),"A".repeat(73)),/72 characters/);
  assert.match(validateNewPassword("correct-long","incorrect"),/do not match/);
  assert.equal(validateNewPassword("correct-long","correct-long"),"");
});
