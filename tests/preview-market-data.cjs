const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
  const src=fs.readFileSync(require.resolve('../preview-functions/api/market-data.js'),'utf8');
  const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
  const request=(params)=>new Request('https://preview.invalid/api/market-data?'+new URLSearchParams(params));
  const original=global.fetch;let calls=0;
  try{
    global.fetch=async url=>{
      calls++;const parsed=new URL(url);
      assert.equal(parsed.origin,'https://api.coindcx.com');
      assert.equal(parsed.searchParams.get('pair'),'B-BTC_USDT');
      return new Response(JSON.stringify(Array.from({length:40},(_,i)=>{
        const p=100+i;return {time:Math.floor(Date.now()/900000)*900000-(40-i)*900000,open:p,high:p+2,low:p-2,close:p+1,volume:100}
      })),{status:200});
    };
    for(const params of [
      {symbol:'RELIANCE',type:'stocks',interval:'15min',mode:'live'},
      {symbol:'BTCUSDT',type:'crypto',interval:'5min',mode:'live'},
      {symbol:'BTCUSDT',type:'crypto',interval:'15min',mode:'eod'},
      {symbol:'NOT_REAL',type:'crypto',interval:'15min',mode:'live'}
    ]){
      const res=await onRequestGet({request:request(params)});
      assert.equal(res.status,400);
    }
    assert.equal(calls,0,'rejected requests must not reach public provider');
    const result=await onRequestGet({request:request({symbol:'BTCUSDT',type:'crypto',interval:'15min',mode:'live'})});
    const body=await result.json();
    assert.equal(result.status,200,JSON.stringify(body));
    assert.equal(body.source,'CoinDCX public spot candles');
    assert.equal(body.rows.length,40);
    assert.equal(calls,1);
    assert.ok(!('apiKey' in body));
    console.log('Isolated public preview API restricts broker routes, validates CoinDCX candles and requires no secrets');
  }finally{global.fetch=original}
})().catch(err=>{console.error(err);process.exitCode=1});
