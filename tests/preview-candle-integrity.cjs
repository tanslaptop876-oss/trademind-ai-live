const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
const src=fs.readFileSync(require.resolve('../preview-functions/api/market-data.js'),'utf8');
const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const originalFetch=global.fetch,originalNow=Date.now;
const width=900000, now=Date.UTC(2026,10,26,12,7);
Date.now=()=>now;
const start=Math.floor(now/width)*width;
const candles=()=>Array.from({length:41},(_,i)=>({time:start-(40-i)*width,open:100,high:103,low:99,close:102,volume:10}));
const request=new Request('https://preview.invalid/api/market-data?symbol=BTCUSDT&type=crypto&mode=live&interval=15min');
async function run(values,status,message){
global.fetch=async()=>new Response(JSON.stringify(values));
const result=await onRequestGet({request}),body=await result.json();
assert.equal(result.status,status,JSON.stringify(body));
if(message)assert.match(body.error,message);
return body;
}
try{
let result=await run(candles(),200);
assert.equal(result.rows.length,40);
assert.equal(Date.parse(result.rows.at(-1).date),start-width);
assert.equal(result.closedCandlesOnly,true);
await run(candles().slice(0,-2),502,/stale/);
let gap=candles();gap.splice(20,1);await run(gap,502,/gaps/);
let duplicate=candles();duplicate.push({...duplicate[0]});await run(duplicate,502,/Duplicate/);
let future=candles();future.push({...future[0],time:1e20});result=await run(future,200);assert.equal(result.rows.length,40);
let malformed=candles();malformed[20].high=90;await run(malformed,502,/gaps/);
let boundary=candles();Date.now=()=>start;result=await run(boundary,200);assert.equal(result.rows.length,40);
Date.now=()=>start+width;await run(boundary.slice(0,-1),502,/stale/);
console.log('PASS: forming/future exclusion, stale and exact freshness boundary, gaps, duplicates, invalid OHLC and out-of-range timestamps');
}finally{global.fetch=originalFetch;Date.now=originalNow}
})().catch(error=>{console.error(error);process.exitCode=1});
