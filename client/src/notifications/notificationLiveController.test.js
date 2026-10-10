import assert from "node:assert/strict";
import test from "node:test";
import { createLiveNotificationController } from "./notificationLiveController.js";

const tick = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
const note = (id, createdAt, readAt=null) => ({id,createdAt,readAt,title:"Fictional",body:"Test",category:"system",eventType:"TEST"});
function harness() {
  let recipient = true, token = "one", visible = true, currentTime=10000, intervals=new Map(), timeouts=new Map(), handlers=new Map(), serial=0;
  const events=[];
  const published=[];
  let rows=[],count=0, listFn=null;
  const environment = {
    visible:()=>visible, now:()=>currentTime,
    setInterval:(cb)=>{let id=++serial;intervals.set(id,cb);return id;},
    clearInterval:(id)=>intervals.delete(id),
    setTimeout:(cb)=>{let id=++serial;timeouts.set(id,cb);return id;},
    clearTimeout:(id)=>timeouts.delete(id),
    onFocus:(cb)=>{handlers.set("focus",cb);return ()=>handlers.delete("focus");},
    onVisibilityChange:(cb)=>{handlers.set("visibility",cb);return ()=>handlers.delete("visibility");}
  };
  const controller=createLiveNotificationController({
    environment,currentRecipient:()=>recipient,credentials:()=>({accessToken:token,apiBaseUrl:"https://api.example.test/api"}),
    list:async (opts)=>{events.push(["list",opts.accessToken]);return listFn?listFn():rows;},
    unreadCount:async (opts)=>{events.push(["count",opts.accessToken]);return count;},
    onState:(state)=>published.push(state)
  });
  return {controller,published,events,intervals,timeouts,handlers,setRows:(r,c)=>{rows=r;count=c;},setToken:v=>token=v,
    setRecipient:v=>recipient=v,setVisible:v=>visible=v,setTime:v=>currentTime=v,setListFn:v=>listFn=v,
    fire:(event)=>handlers.get(event)?.(),advance:()=>{for(const cb of [...intervals.values()])cb();},
    expireToast:()=>{for(const cb of [...timeouts.values()])cb();},last:()=>published.at(-1)};
}
test("initial load is baseline, new same-timestamp ID shows one generic alert",async()=>{
  const h=harness(), createdAt="2026-10-10T01:00:00.000Z";
  h.setRows([note("old",createdAt)],1);h.controller.start();await tick();
  assert.equal(h.last().toastCount,0);
  h.setRows([note("new",createdAt),note("old",createdAt)],2);
  h.advance();await tick();assert.equal(h.last().toastCount,1);
  h.advance();await tick();assert.equal(h.last().toastCount,1);
  h.controller.stop();
});
test("token rotation preserves baseline and uses current token",async()=>{
  const h=harness();h.setRows([note("old","2026-10-10T01:00:00Z")],1);h.controller.start();await tick();
  h.setToken("rotated");h.setRows([note("new","2026-10-10T01:01:00Z"),note("old","2026-10-10T01:00:00Z")],2);
  h.advance();await tick();assert.equal(h.last().toastCount,1);
  assert.equal(h.events.at(-2)[1],"rotated");h.controller.stop();
});
test("stop and recipient switch invalidate pending results and cleanup timers",async()=>{
  const h=harness();let resolveList;
  h.setListFn(()=>new Promise(resolve=>{resolveList=resolve;}));
  h.controller.start();await tick();h.setRecipient(false);h.controller.stop();
  resolveList([note("other","2026-10-10T01:01:00Z")]);await tick();
  assert.equal(h.published.length,1);assert.equal(h.intervals.size,0);
  assert.equal(h.handlers.size,0);assert.equal(h.timeouts.size,0);
  h.controller.start();h.controller.start();assert.equal(h.intervals.size,1);
  h.controller.stop();
});
test("read mutation clears toast and invalidates overlapping unread poll",async()=>{
  const h=harness();h.setRows([],0);h.controller.start();await tick();
  h.setRows([note("new","2026-10-10T01:01:00Z")],1);h.advance();await tick();
  assert.equal(h.last().toastCount,1);
  h.controller.afterRead();assert.equal(h.last().toastCount,0);
  h.setRows([note("new","2026-10-10T01:01:00Z","2026-10-10T01:02:00Z")],0);
  await tick();h.advance();await tick();
  assert.equal(h.last().unreadCount,0);assert.equal(h.last().toastCount,0);h.controller.stop();
});
test("focus and visibility events coalesce and hidden tab does not poll",async()=>{
  const h=harness();h.setRows([],0);h.controller.start();await tick();
  const prior=h.events.length;
  h.setVisible(false);h.advance();await tick();assert.equal(h.events.length,prior);
  h.setVisible(true);h.fire("visibility");h.fire("focus");await tick();
  assert.equal(h.events.length,prior+2);h.controller.stop();
});
test("incoherent list/count keeps unseen IDs eligible for next coherent toast",async()=>{
  const h=harness(); h.setRows([],0);h.controller.start();await tick();
  const newRow=note("arrived","2026-10-10T01:01:00Z");
  h.setRows([newRow],0);h.advance();await tick();
  assert.equal(h.last().toastCount,0);
  h.setRows([newRow],1);h.advance();await tick();
  assert.equal(h.last().toastCount,1);h.controller.stop();
});
test("incoherent zero-count snapshot dismisses an existing toast",async()=>{
  const h=harness();h.setRows([],0);h.controller.start();await tick();
  const arrived=note("arrived","2026-10-10T01:01:00Z");
  h.setRows([arrived],1);h.advance();await tick();
  assert.equal(h.last().toastCount,1);
  h.setRows([arrived],0);h.advance();await tick();
  assert.deepEqual(h.last(),{unreadCount:0,toastCount:0});
  assert.equal(h.timeouts.size,0);h.controller.stop();
});
test("refresh during a pending poll coalesces into one follow-up",async()=>{
  const h=harness();let release;let requested=0;
  h.setListFn(()=>{requested++; if(requested===1)return new Promise(resolve=>{release=resolve;});return [];});
  h.controller.start();await tick();
  h.controller.refresh();h.controller.refresh();
  release([]);await tick();
  assert.equal(requested,2);h.controller.stop();
});
test("read invalidates unresolved request and queues fresh state",async()=>{
  const h=harness();let release;let requested=0;
  h.setListFn(()=>{requested++;if(requested===1)return new Promise(resolve=>{release=resolve;});return [];});
  h.controller.start();await tick();h.controller.afterRead();
  release([note("stale","2026-10-10T01:01:00Z")]);await tick();
  assert.equal(requested,2);assert.equal(h.last().toastCount,0);h.controller.stop();
});
test("failed request hides unread count without inventing toast",async()=>{
  const h=harness();h.setListFn(()=>Promise.reject(new Error("offline")));
  h.controller.start();await tick();assert.deepEqual(h.last(),{unreadCount:null,toastCount:0});
  h.controller.stop();
});
