/* Live, read-only provider smoke test. No credentials, broker requests, or orders.
 * Runs separately from mocked unit tests; failures describe real network/provider conditions.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
async function load(path){
  const source=fs.readFileSync(require.resolve(path),'utf8');
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const deadline=18000;
(async()=>{
  const start=Date.now();
  const market=await load('../functions/api/market-data.js');
  const fx=await load('../functions/api/fx-reference.js');
  const cryptoRequest=new Request('https://trademind.test/api/market-data?symbol=BTCUSDT&type=crypto&mode=live&interval=15min');
  const cryptoResponse=await market.onRequestGet({request:cryptoRequest,env:{FREE_CRYPTO_SOURCE:'coindcx'}});
  const crypto=await cryptoResponse.json();
  assert.equal(cryptoResponse.status,200,'CoinDCX: '+JSON.stringify(crypto));
  assert.equal(crypto.source,'CoinDCX public spot candles');
  assert.ok(Array.isArray(crypto.rows)&&crypto.rows.length>=35);
  const last=crypto.rows.at(-1),lastAge=Date.now()-Date.parse(last.date);
  assert.ok(Number.isFinite(lastAge)&&lastAge>=-900000&&lastAge<7*86400000,'CoinDCX candles have invalid or stale timestamps');
  assert.ok(crypto.rows.every(r=>Number.isFinite(r.close)&&r.close>0));
  console.log('COINDCX LIVE PUBLIC PASS: candles='+crypto.rows.length+' asOf='+last.date+' ageMinutes='+Math.round(lastAge/60000));

  const fxRequest=new Request('https://trademind.test/api/fx-reference?pair=USDINR');
  const fxResponse=await fx.onRequestGet({request:fxRequest,env:{}});
  const reference=await fxResponse.json();
  assert.equal(fxResponse.status,200,'Frankfurter: '+JSON.stringify(reference));
  assert.equal(reference.signalEligible,false);
  assert.equal(reference.realtime,false);
  assert.ok(Number.isFinite(reference.rate)&&reference.rate>0);
  const fxAge=Date.now()-Date.parse(reference.date+'T00:00:00Z');
  assert.ok(Number.isFinite(fxAge)&&fxAge>=-86400000&&fxAge<=7*86400000);
  console.log('FRANKFURTER REFERENCE PASS: asOf='+reference.date+' pair='+reference.pair+' (NOT live trade data)');
  console.log('Read-only provider smoke checks passed, elapsedMs='+ (Date.now()-start));
})().catch(err=>{console.error('PUBLIC PROVIDER SMOKE FAILED:',err.message);process.exitCode=1});
