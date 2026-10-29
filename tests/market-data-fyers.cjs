const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const source=fs.readFileSync(require.resolve('../functions/api/market-data.js'),'utf8');
  const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const env={MARKET_PROVIDER:'fyers',FYERS_APP_ID:'test-app',FYERS_ACCESS_TOKEN:'secret-token',MARKET_ACCESS_TOKEN:'separate-code'};
  const candles=Array.from({length:600},(_,i)=>[1700000000+i*60,100,110,90,105,1000]);
  let calls=[],history={s:'ok',candles},quote={s:'ok',d:[{n:'NSE:RELIANCE-EQ',s:'ok',v:{lp:106,tt:1700036000}}]},status=200,throws;
  const previous=global.fetch;
  global.fetch=async(url,options)=>{calls.push({url:new URL(url),options});if(throws)throw throws;return new Response(JSON.stringify(String(url).includes('/history?')?history:quote),{status})};
  async function request(query='',overrides={},access='separate-code'){
    calls=[];
    const params=new URLSearchParams({symbol:'RELIANCE',type:'stocks',mode:'live',interval:'15min',provider:'fyers',fyers_symbol:'NSE:RELIANCE-EQ'});
    for(const [key,value] of new URLSearchParams(query))params.set(key,value);
    const response=await onRequestGet({request:new Request(`https://example.test/api/market-data?${params}`,{headers:{'x-market-access':access}}),env:{...env,...overrides}});
    return {status:response.status,headers:response.headers,body:await response.json()};
  }
  try{
    for(const access of ['', 'wrong']){assert.equal((await request('',{},access)).status,401);assert.equal(calls.length,0)}
    for(const key of ['FYERS_APP_ID','FYERS_ACCESS_TOKEN','MARKET_ACCESS_TOKEN']){assert.equal((await request('',{[key]:''})).status,503);assert.equal(calls.length,0)}
    for(const query of ['provider=icici_breeze','type=crypto','interval=weekly','interval=monthly','fyers_symbol=https://evil.test','fyers_symbol=NSE:RELIANCE-EQ%26x=y']){assert.equal((await request(query)).status,400);assert.equal(calls.length,0)}
    for(const [interval,resolution] of Object.entries({'1min':'1','5min':'5','15min':'15','30min':'30','60min':'60',daily:'D'})){
      const result=await request(`interval=${interval}`);
      assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.headers.get('cache-control'),'no-store');
      assert.equal(result.body.rows.length,500);assert.equal(result.body.quote,106);assert.equal(result.body.source,'FYERS');assert.equal(result.body.currency,'INR');
      assert.equal(calls.length,2);assert.equal(calls[0].url.origin,'https://api-t1.fyers.in');assert.equal(calls[0].url.searchParams.get('resolution'),resolution);
      assert.equal(calls[0].options.headers.authorization,'test-app:secret-token');assert.equal(calls[0].url.searchParams.get('symbol'),'NSE:RELIANCE-EQ');
      const days=(Date.parse(calls[0].url.searchParams.get('range_to'))-Date.parse(calls[0].url.searchParams.get('range_from')))/86400000;
      assert.equal(days,interval==='daily'?365:28);assert.ok(!JSON.stringify(result.body).includes('secret-token'));
    }
    const eod=await request('mode=eod&interval=daily');assert.equal(eod.status,200);assert.equal(calls.length,1);assert.equal(eod.body.quote,105);
    history={s:'ok',candles:[...candles].reverse()};const sorted=await request();assert.equal(sorted.body.rows[0].date,new Date(candles[100][0]*1000).toISOString());
    for(const bad of [null,[],[[1,100,90,80,105,1]],candles.slice(0,34),[...candles,candles[0]],candles.map((c,i)=>i===0?[...c.slice(0,5),-1]:c),candles.map((c,i)=>i===0?[c[0],null,...c.slice(2)]:c)]){
      history={s:'ok',candles:bad};assert.equal((await request()).status,502);assert.equal(calls.length,1);
    }
    history={s:'error',message:'secret-token'};const rejected=await request();assert.equal(rejected.status,502);assert.ok(!JSON.stringify(rejected).includes('secret-token'));
    history={s:'ok',candles};status=429;assert.match((await request()).body.error,/rate limit/);assert.equal(calls.length,1);status=200;
    history={s:'error',code:-429};assert.match((await request()).body.error,/rate limit/);history={s:'ok',candles};
    quote={s:'ok',d:[{n:'NSE:TCS-EQ',s:'ok',v:{lp:106,tt:1700036000}}]};assert.equal((await request()).status,502);
    throws=new DOMException('Timeout','TimeoutError');assert.equal((await request()).body.error,'FYERS timed out');
    console.log('FYERS: access protection, 6 resolutions, snapshots, EOD, sorting, limits, malformed data, rate errors and timeout passed');
  }finally{global.fetch=previous}
})().catch(error=>{console.error(error);process.exit(1)});
