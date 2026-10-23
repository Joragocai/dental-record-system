import test from "node:test";
import assert from "node:assert/strict";
import { allocatePublicId, previewPublicId } from "./publicIds.js";
test("Atomic public ID insert uses an upsert for concurrent allocation",async()=>{
 const calls=[];const client={query:async(sql,params)=>{calls.push({sql,params});return{rows:[{last_value:42}]}}};
 assert.equal(await allocatePublicId(client,"P",2026),"P-2026-0042");
 assert.match(calls[0].sql,/ON CONFLICT/);
 assert.match(calls[0].sql,/RETURNING last_value/);
 assert.deepEqual(calls[0].params,["P",2026]);
});
test("Public ID preview is read-only",async()=>{
 const calls=[];const client={query:async(sql,params)=>{calls.push({sql,params});return{rows:[{last_value:42}]}}};
 assert.equal(await previewPublicId(client,"T",2026),"T-2026-0043");
 assert.match(calls[0].sql,/^SELECT/);
});
test("Reject unexpected prefixes and exhausted yearly allocations",async()=>{
 const client={query:async()=>({rows:[]})};
 await assert.rejects(allocatePublicId(client,"P",2026),/limit/);
 await assert.rejects(allocatePublicId(client,"X",2026),/prefix/);
 await assert.rejects(previewPublicId(client,"T",1999),/request/);
});
