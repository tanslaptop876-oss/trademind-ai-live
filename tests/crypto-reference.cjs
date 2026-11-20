const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const source=fs.readFileSync(require.resolve('../functions/api/crypto-reference.js'),'utf8');
  const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const base='https://example.test/api/crypto-reference';
  const call=async(query,env={ENABLE_PUBLIC_CRYPTO_RESEARCH:'true'})=>
    onRequestGet({request:new Request(base+query),env});
  const disabled=await call('?pair=BTCUSD&interval=1min',{});
  assert.equal(disabled.status,503);
  assert.equal((await disabled.json()).signalEligible,false);
  const invalid=await call('?pair=BTCINR&interval=1min');
  assert.equal(invalid.status,400);
  const original=global.fetch;
  let upstream='';
  try{
    const now=Math.floor(Date.now()/60000)*60;
    const rows=Array.from({length:41},(_,i)=>{
      const t=now-(41-i)*60;
      return [t,String(100+i),String(102+i),String(99+i),String(101+i),'101',String(i+1),1];
    });
    global.fetch=async url=>{
      upstream=String(url);
      return new Response(JSON.stringify({error:[],result:{XXBTZUSD:rows,last:0}}),{status:200});
    };
    const response=await call('?pair=BTCUSD&interval=1min');
    const data=await response.json();
    assert.equal(response.status,200,JSON.stringify(data));
    assert.equal(data.rows.length,40,'exclude last, still-open bar');
    assert.equal(data.quote,140,'only last closed price');
    assert.equal(data.rows[0].complete,true);
    assert.equal(data.signalEligible,false);
    assert.equal(data.commercialRightsVerified,false);
    assert.ok(upstream.includes('/0/public/OHLC?'));
    assert.equal(new URL(upstream).searchParams.get('interval'),'1');
    global.fetch=async ()=>new Response(JSON.stringify({error:['EQuery:Unknown asset pair']}),{status:200});
    const failed=await call('?pair=BTCUSD&interval=1min');
    assert.equal(failed.status,502);
    assert.equal((await failed.json()).signalEligible,false);
    console.log('Kraken research-only closed-candle adapter tests passed');
  }finally{global.fetch=original}
})().catch(err=>{console.error(err);process.exitCode=1});
