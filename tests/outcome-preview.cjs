const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const source=fs.readFileSync(require.resolve('../functions/api/outcome-preview.js'),'utf8');
  // The Cloudflare Pages endpoint imports the existing shared evaluator and proxy.
  // Load the proxy as data: module and replace static import paths only in this isolated test.
  const marketSource=fs.readFileSync(require.resolve('../functions/api/market-data.js'),'utf8');
  const marketUri='data:text/javascript;base64,'+Buffer.from(marketSource).toString('base64');
  const forwardUri='data:text/javascript;base64,'+
    Buffer.from(fs.readFileSync(require.resolve('../signal-forward-outcomes.js'),'utf8')).toString('base64');
  const patched=source.replace("import '../../signal-forward-outcomes.js';",'import '+JSON.stringify(forwardUri)+';')
    .replace("from './market-data.js'",'from '+JSON.stringify(marketUri));
  const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(patched).toString('base64'));
  const token='test-only-token-at-least-24-characters';
  const span=900000,base=Math.floor((Date.now()-42*span)/span)*span;
  const candles=Array.from({length:40},(_,i)=>{
    const n=100+i;
    return {time:base+i*span,open:n,high:n+2,low:n-2,close:n+1,volume:1000};
  });
  const observed=candles[2];
  const observation={event_key:'event-test',symbol:'BTCUSDT',market:'CRYPTO',timeframe:'15m',
    source:'COINDCX',signal:'BUY',candle_at:new Date(observed.time).toISOString(),
    candle_close:observed.close,observed_at:new Date().toISOString()};
  let reads=0,upstreams=0;
  const db={prepare(sql){assert.match(sql,/SELECT/);return {bind(key){
    assert.equal(key,'event-test');
    return {async first(){reads++;return observation}};
  }}}};
  const env={SIGNAL_LOG_TOKEN:token,SIGNAL_DB:db};
  const request=(headers={})=>new Request('https://example.test/api/outcome-preview?event_key=event-test&horizon=3',
    {headers});
  const original=global.fetch;
  try{
    global.fetch=async url=>{
      upstreams++;
      assert.equal(new URL(url).searchParams.get('pair'),'B-BTC_USDT');
      return new Response(JSON.stringify(candles),{status:200});
    };
    const denied=await onRequestGet({request:request(),env});
    assert.equal(denied.status,401);assert.equal(reads,0);assert.equal(upstreams,0);
    const absent=await onRequestGet({request:request({'x-signal-log-token':token}),env:{SIGNAL_LOG_TOKEN:token}});
    assert.equal(absent.status,503);assert.equal(upstreams,0);
    const result=await onRequestGet({request:request({'x-signal-log-token':token}),env});
    const body=await result.json();
    assert.equal(result.status,200,JSON.stringify(body));
    assert.equal(body.status,'EVALUATED',JSON.stringify(body));
    assert.equal(body.entryAt,new Date(candles[3].time).toISOString());
    assert.equal(body.exitAt,new Date(candles[5].time).toISOString());
    assert.equal(body.persisted,false);assert.equal(body.noOrders,true);
    assert.equal(body.verification,'HISTORICAL_PROVIDER_DATA_NOT_AUDITED');
    assert.equal(upstreams,1);
    observation.candle_close=1;
    const mismatch=await (await onRequestGet({request:request({'x-signal-log-token':token}),env})).json();
    assert.equal(mismatch.status,'PENDING');
    observation.candle_close=observed.close;
    observation.timeframe='1d';
    assert.equal((await (await onRequestGet({request:request({'x-signal-log-token':token}),env})).json()).status,'PENDING');
    observation.timeframe='15m';
    observation.source='OTHER';
    assert.equal((await onRequestGet({request:request({'x-signal-log-token':token}),env})).status,422);
    console.log('Read-only outcome preview authentication, provider fetch, pending and no-orders checks passed');
  }finally{global.fetch=original}
})().catch(e=>{console.error(e);process.exit(1)});
