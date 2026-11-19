const assert=require('node:assert/strict');
const policy=require('../live-signal-policy.js');
const at='2026-11-20T04:20:00.000Z'; // 09:50 Asia/Kolkata, Friday
const now=Date.parse(at);
const rows=Array.from({length:42},(_,i)=>{
  const time=new Date(Date.parse('2026-11-20T03:15:00.000Z')+i*60000).toISOString();
  return {date:time,open:100+i,high:102+i,low:99+i,close:101+i,volume:100};
});
const entry={rows};
const recent=policy.inspect(entry,{broker:true,interval:'1min',now});
assert.equal(recent.status,'RECENT');
assert.equal(recent.rows.length,41);
assert.equal(recent.rows.at(-1).date,rows.at(-2).date);
assert.equal(recent.liveEligible,true);
const staleRows=rows.map(r=>({...r,date:new Date(Date.parse(r.date)-3600000).toISOString()}));
const stale=policy.inspect({rows:staleRows},{broker:true,interval:'1min',now});
assert.equal(stale.status,'STALE');
assert.equal(stale.liveEligible,false);
assert.equal(policy.inspect(entry,{broker:true,interval:'1min',now,failed:true}).status,'STALE');
assert.equal(policy.inspect(entry,{broker:true,interval:'daily',now}).status,'EOD');
assert.equal(policy.inspect(entry,{broker:false,interval:'1min',now}).status,'RESEARCH');
assert.equal(policy.inspect(entry,{broker:true,interval:'1min',now:Date.parse('2026-11-22T04:20:00Z')}).status,'CLOSED');
assert.equal(policy.inspect({rows:rows.map((r,i)=>i===4?{...r,close:999}:r)},
  {broker:true,interval:'1min',now}).status,'INVALID');
assert.equal(policy.inspect({rows:rows.map((r,i)=>i===4?{...r,date:rows[3].date}:r)},
  {broker:true,interval:'1min',now}).status,'INVALID');
assert.equal(policy.inspect({rows:rows.slice(0,15)},{broker:true,interval:'1min',now}).status,'INSUFFICIENT');
const naive=policy.toEpoch('2026-11-20 09:49:00');
assert.equal(naive,Date.parse('2026-11-20T04:19:00.000Z'));
console.log('NSE live-signal per-instrument freshness policy tests passed');
