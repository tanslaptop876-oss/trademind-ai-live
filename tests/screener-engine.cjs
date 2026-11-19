const assert=require('node:assert/strict');
const {parse,scan}=require('../screener-engine.js');
const lines=['symbol,date,open,high,low,close,volume,cap'];
for(let i=0;i<90;i++){const day=new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),p=100+i;lines.push(`ABC,${day},${p},${p+2},${p-2},${p},${1000+i},mid`)}
const [entry]=parse(lines.join('\n')),result=scan(entry);
assert.equal(entry.rows.length,90);assert.equal(result.direction,'UP');assert.ok(result.samples>=5);assert.ok(result.hitRate>=0&&result.hitRate<=1);assert.equal(result.asOf,entry.rows.at(-1).date);
assert.throws(()=>parse(lines.join('\n')+'\n'+lines.at(-1)),/unique and oldest first/);
assert.throws(()=>parse(lines.join('\n').replace(',100,102,98,100,1000,',',0,102,98,100,1000,')),/Invalid open/);
console.log('Historical screener validation and outcome checks passed');

const {aggregate,multiTimeframe,breakout}=require('../scanner-extensions.js');
function sample(n, step=60000, delta=0.25){
  const start=Date.parse('2026-10-01T09:15:00+05:30');
  return Array.from({length:n},(_,i)=>{
    const p=100+i*delta;
    return {timestamp:new Date(start+i*step).toISOString(),open:p,high:p+1,low:p-1,close:p+0.2,volume:100,complete:true};
  });
}
const minute=sample(10);
const grouped=aggregate(minute,'1m','5m');
assert.equal(grouped.length,2);
assert.equal(grouped[0].volume,500);
assert.equal(grouped[0].timestamp,new Date('2026-10-01T09:15:00+05:30').toISOString());
assert.equal(aggregate(minute.slice(0,9),'1m','5m').length,1);
assert.equal(aggregate(minute.filter((_,i)=>i!==2),'1m','5m').length,1);
assert.equal(aggregate(minute.map((r,i)=>({...r,complete:i!==2})),'1m','5m').length,1);
assert.throws(()=>aggregate(minute,'5m','3m'),/integer intraday multiples/);
const rising=sample(40,86400000,0.5),falling=sample(40,86400000,-0.5);
assert.equal(multiTimeframe([{timeframe:'1d',rows:rising},{timeframe:'1w',rows:rising}]).direction,'UP');
assert.equal(multiTimeframe([{timeframe:'1d',rows:rising},{timeframe:'1w',rows:falling}]).direction,'WAIT');
assert.equal(multiTimeframe([{timeframe:'1d',rows:rising.slice(0,10)}]).direction,'WAIT');
const breakoutRows=sample(25,86400000,0);
breakoutRows[24]={...breakoutRows[24],open:101,high:107,low:100,close:106,volume:250};
const hit=breakout(breakoutRows);
assert.equal(hit.direction,'UP');
assert.equal(hit.volumeRatio,2.5);
assert.equal(breakout(breakoutRows.map((r,i)=>i===24?{...r,volume:110}:r)).direction,'WAIT');
assert.equal(breakout(breakoutRows.map((r,i)=>i===24?{...r,volume:null}:r)).volumeAvailable,false);
console.log('Scanner extensions checks passed');

const {candleFreshness}=require('../scanner-extensions.js');
const marketTime=Date.parse('2026-11-19T10:15:00+05:30');
assert.equal(candleFreshness('2026-11-19 10:10:00','5min',marketTime).status,'RECENT');
assert.equal(candleFreshness('2026-11-18 10:10:00','5min',marketTime).status,'STALE');
assert.equal(candleFreshness('2026-11-19','daily',marketTime).status,'EOD');
assert.equal(candleFreshness('bad timestamp','5min',marketTime).status,'UNKNOWN');
assert.equal(candleFreshness('2026-11-19 12:00:00','5min',marketTime).status,'FUTURE');
assert.equal(candleFreshness('2026-11-19 10:10:00','5min',Date.parse('2026-11-19T18:00:00+05:30')).fresh,false);
console.log('Broker candle freshness and fail-closed status checks passed');

const upward=sample(45,900000,0.7);
const downward=sample(45,900000,-0.7);
const threeUp=multiTimeframe([{timeframe:'15m',rows:upward},{timeframe:'1h',rows:upward},{timeframe:'1d',rows:upward}]);
assert.equal(threeUp.direction,'UP');
assert.equal(threeUp.total,3);
assert.equal(threeUp.agreement,1);
const conflict=multiTimeframe([{timeframe:'15m',rows:upward},{timeframe:'1h',rows:upward},{timeframe:'1d',rows:downward}]);
assert.equal(conflict.direction,'WAIT');
const insufficient=multiTimeframe([{timeframe:'15m',rows:upward},{timeframe:'1h',rows:upward.slice(0,20)},{timeframe:'1d',rows:upward}]);
assert.equal(insufficient.direction,'WAIT');
assert.throws(()=>multiTimeframe([{timeframe:'15m',rows:upward},{timeframe:'1h',rows:[upward[1],upward[0]]}]),/unique, and increasing/);
console.log('Three-timeframe consensus, conflict and incomplete-history checks passed');
