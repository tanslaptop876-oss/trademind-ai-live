const assert = require('node:assert/strict');
const fs = require('node:fs');

async function load(path) {
  const source = fs.readFileSync(require.resolve(path),'utf8');
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
(async () => {
  const market=await load('../functions/api/market-data.js');
  const fx=await load('../functions/api/fx-reference.js');
  const original=global.fetch;
  let calls=[];
  try {
    global.fetch=async (url)=>{
      calls.push(String(url));
      return new Response(JSON.stringify(Array.from({length:40},(_,i)=>({
        time:Date.UTC(2026,10,1,0,i),open:100+i,high:102+i,low:99+i,close:101+i,volume:10
      }))),{status:200});
    };
    const req=new Request('https://example.test/api/market-data?symbol=BTCUSDT&type=crypto&mode=live&interval=1min');
    const result=await market.onRequestGet({request:req,env:{}});
    const data=await result.json();
    assert.equal(result.status,200,JSON.stringify(data));
    assert.equal(data.source,'CoinDCX public spot candles');
    assert.equal(data.rows.length,40);
    assert.equal(data.rows[0].close,101);
    assert.ok(calls[0].startsWith('https://api.coindcx.com/market_data/candles?'));
    assert.equal(new URL(calls[0]).searchParams.get('pair'),'B-BTC_USDT');
    const bad=await market.onRequestGet({request:new Request('https://example.test/api/market-data?symbol=BTCUSDT&type=crypto&mode=live&interval=5min'),env:{}});
    assert.equal(bad.status,502);
    assert.match((await bad.json()).error,/supports only/);

    global.fetch=async (url)=>{
      calls.push(String(url));
      return new Response(JSON.stringify({date:'2026-11-18',base:'USD',quote:'INR',rate:89.45}),{status:200});
    };
    const ref=await fx.onRequestGet({request:new Request('https://example.test/api/fx-reference?pair=USDINR')});
    const rate=await ref.json();
    assert.equal(ref.status,200,JSON.stringify(rate));
    assert.equal(rate.rate,89.45);
    assert.equal(rate.realtime,false);
    assert.equal(rate.tradable,false);
    assert.equal(rate.signalEligible,false);
    assert.equal(rate.hasOHLC,false);
    assert.ok(calls.at(-1).includes('/v2/rate/USD/INR'));
    const unsupported=await fx.onRequestGet({request:new Request('https://example.test/api/fx-reference?pair=UNKNOWN')});
    assert.equal(unsupported.status,400);
    console.log('No-key CoinDCX market candles and Frankfurter daily reference adapters passed');
  }finally{global.fetch=original}
})().catch(err=>{console.error(err);process.exit(1)});
