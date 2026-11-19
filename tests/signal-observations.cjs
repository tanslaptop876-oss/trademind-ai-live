const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
  const source=fs.readFileSync(require.resolve('../functions/api/signal-observations.js'),'utf8');
  const {onRequestPost,onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const TOKEN='test-only-token-that-is-at-least-24-chars';
  let saved=[],inserted=0;
  const database={
    prepare(sql){
      if(sql.includes('INSERT OR IGNORE'))return {bind(...values){return {async run(){
        if(saved.some(row=>row[0]===values[0]))return {meta:{changes:0}};
        saved.push(values);inserted++;return {meta:{changes:1}};
      }}}};
      if(sql.includes('SELECT'))return {bind(limit){return {async all(){return {results:saved.slice().reverse().slice(0,limit).map(v=>({
        event_key:v[0],symbol:v[1],market:v[2],timeframe:v[3],source:v[4],signal:v[5],
        candle_at:v[6],observed_at:v[7],candle_close:v[8],rule_version:v[9],evidence_json:v[10],status:'UNVERIFIED'
      }))}}}}}};
      throw Error('Unexpected SQL');
    }
  };
  const env={SIGNAL_LOG_TOKEN:TOKEN,SIGNAL_DB:database};
  const candleAt=new Date(Date.now()-60000).toISOString();
  const data={symbol:'RELIANCE',market:'NSE',timeframe:'15m',source:'ICICI_BREEZE',
    signal:'BUY',candleAt,candleClose:320.5,ruleVersion:'rules_v1',evidence:{rsi:55.3,emaAbove:true}};
  const request=(payload,token=TOKEN)=>new Request('https://example.test/api/signal-observations',{
    method:'POST',headers:{'content-type':'application/json','x-signal-log-token':token},
    body:JSON.stringify(payload)});
  const denied=await onRequestPost({request:request(data,'bad'),env});
  assert.equal(denied.status,401);
  assert.equal(inserted,0);
  const disabled=await onRequestPost({request:request(data),env:{SIGNAL_LOG_TOKEN:TOKEN}});
  assert.equal(disabled.status,503);
  const first=await onRequestPost({request:request(data),env}),a=await first.json();
  assert.equal(first.status,201,JSON.stringify(a));
  assert.equal(a.saved,true);assert.equal(a.status,'UNVERIFIED');
  const second=await onRequestPost({request:request(data),env});
  assert.equal(second.status,200);assert.equal((await second.json()).duplicate,true);
  assert.equal(inserted,1);
  const malformed=await onRequestPost({request:request({...data,signal:'EXECUTE_BUY'}),env});
  assert.equal(malformed.status,400);
  const future=await onRequestPost({request:request({...data,candleAt:new Date(Date.now()+3600000).toISOString()}),env});
  assert.equal(future.status,400);
  const get=await onRequestGet({request:new Request('https://example.test/api/signal-observations?limit=10',
    {headers:{'x-signal-log-token':TOKEN}}),env});
  assert.equal(get.status,200);const body=await get.json();
  assert.equal(body.records.length,1);assert.equal(body.records[0].evidence.rsi,55.3);
  assert.equal(body.records[0].status,'UNVERIFIED');assert.equal(body.noOrders,true);
  assert.equal((await onRequestGet({request:new Request('https://example.test/api/signal-observations'),env})).status,401);
  console.log('Authenticated signal ledger deduplication, schema, no-orders and failure checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
