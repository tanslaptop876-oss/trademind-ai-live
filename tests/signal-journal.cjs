const assert=require('node:assert/strict');
const engine=require('../screener-engine.js');
global.TradeMindScreener=engine;
const {evaluate}=require('../signal-journal.js');
const start=Date.parse('2026-01-01T00:00:00Z');
const rows=Array.from({length:100},(_,i)=>({date:new Date(start+i*86400000).toISOString(),open:100+i,high:102+i,low:99+i,close:101+i,volume:1000+i}));
const result=evaluate({symbol:'TEST',rows},{horizon:5,feeBps:10});
assert.ok(result.samples>5);
assert.equal(result.kind,'historical_rule_outcomes_not_forecast');
assert.equal(result.executable,false);
assert.ok(result.winRate>=0&&result.winRate<=1);
for(const record of result.records){
  const signalIndex=rows.findIndex(r=>r.date===record.signalAt);
  assert.equal(record.enteredAt,rows[signalIndex+1].date,'entry must occur on next candle');
  assert.equal(record.entryPrice,rows[signalIndex+1].open);
  assert.equal(record.exitedAt,rows[signalIndex+5].date);
  assert.equal(record.executable,false);
}
const expensive=evaluate({symbol:'TEST',rows},{horizon:5,feeBps:200});
assert.ok(expensive.records[0].netReturn<result.records[0].netReturn);
const empty=evaluate({symbol:'TEST',rows:rows.slice(0,30)},{horizon:5});
assert.equal(empty.samples,0);
assert.equal(empty.winRate,null);
assert.throws(()=>evaluate({symbol:'TEST',rows:[rows[1],rows[0]]}),/non-ascending time/);
assert.throws(()=>evaluate({symbol:'TEST',rows},{horizon:0}),/Invalid evaluation horizon/);
assert.throws(()=>evaluate({symbol:'TEST',rows},{feeBps:-1}),/Invalid transaction cost/);
console.log('Signal journal chronological entry, fees and fail-closed checks passed');
