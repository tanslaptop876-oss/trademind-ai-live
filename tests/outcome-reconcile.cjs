const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
  const base=fs.readFileSync(require.resolve('../functions/api/outcome-reconcile.js'),'utf8');
  const source=fs.readFileSync(require.resolve('../functions/api/outcome-preview.js'),'utf8');
  const market=fs.readFileSync(require.resolve('../functions/api/market-data.js'),'utf8');
  const forward=fs.readFileSync(require.resolve('../signal-forward-outcomes.js'),'utf8');
  const asUri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
  const previewUri=asUri(source.replace("import '../../signal-forward-outcomes.js';","import "+JSON.stringify(asUri(forward))+";").replace("from './market-data.js'","from "+JSON.stringify(asUri(market))));
  const {onRequestPost}=await import(asUri(base.replace("from './outcome-preview.js'","from "+JSON.stringify(previewUri))));
  const token='test-only-dedicated-token-123456789';
  const unit=900000,origin=Math.floor((Date.now()-42*unit)/unit)*unit;
  const candles=Array.from({length:40},(_,i)=>{const p=100+i;return {time:origin+i*unit,open:p,high:p+2,low:p-2,close:p+1,volume:123};});
  const initial=candles[2];
  const observation={event_key:'crypto-btc-test',symbol:'BTCUSDT',market:'CRYPTO',timeframe:'15m',source:'COINDCX',signal:'BUY',candle_at:new Date(initial.time).toISOString(),candle_close:initial.close,observed_at:new Date().toISOString()};
  const writes=new Map(),counts={read:0,write:0,fetch:0};
  const db={prepare(sql){return {bind(...params){return {
    async first(){assert.match(sql,/SELECT/);counts.read++;return observation},
    async run(){assert.match(sql,/INSERT OR IGNORE/);counts.write++;
      const key=params[0];if(writes.has(key))return {meta:{changes:0}};
      writes.set(key,params);return {meta:{changes:1}};
    }
  }}}}};
  const env={SIGNAL_LOG_TOKEN:token,SIGNAL_DB:db};
  const make=(payload,authorization=token)=>new Request('https://test.invalid/api/outcome-reconcile',{method:'POST',headers:{'x-signal-log-token':authorization,'content-type':'application/json'},body:JSON.stringify(payload)});
  const payload={eventKey:'crypto-btc-test',horizon:3,feeBps:10};
  const original=global.fetch;
  try{
    global.fetch=async url=>{counts.fetch++;return new Response(JSON.stringify(candles),{status:200})};
    const unauthorized=await onRequestPost({request:make(payload,'nope'),env});
    assert.equal(unauthorized.status,401);assert.equal(counts.read,0);assert.equal(counts.fetch,0);assert.equal(counts.write,0);
    const invalid=await onRequestPost({request:make({...payload,horizon:1000}),env});
    assert.equal(invalid.status,400);assert.equal(counts.write,0);
    const first=await onRequestPost({request:make(payload),env}),a=await first.json();
    assert.equal(first.status,201,JSON.stringify(a));assert.equal(a.saved,true);assert.equal(a.noOrders,true);
    assert.equal(a.verification,'HISTORICAL_PROVIDER_DATA_NOT_AUDITED');assert.equal(writes.size,1);
    const dup=await onRequestPost({request:make(payload),env}),b=await dup.json();
    assert.equal(dup.status,200);assert.equal(b.duplicate,true);assert.equal(writes.size,1);
    observation.candle_close=3;
    const pending=await onRequestPost({request:make(payload),env}),p=await pending.json();
    assert.equal(pending.status,'PENDING'===p.status?200:pending.status);assert.equal(p.status,'PENDING');
    assert.equal(writes.size,1);
    observation.candle_close=initial.close;observation.signal='WAIT';
    const skip=await (await onRequestPost({request:make(payload),env})).json();
    assert.equal(skip.status,'SKIPPED');assert.equal(writes.size,1);
    assert.equal((await onRequestPost({request:make(payload),env:{SIGNAL_LOG_TOKEN:token}})).status,503);
    console.log('Trusted outcome reconciliation auth, D1 insert dedupe, pending and skip passed');
  }finally{global.fetch=original}
})().catch(e=>{console.error(e);process.exit(1)});
