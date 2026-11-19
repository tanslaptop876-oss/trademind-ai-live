// Free daily FX reference rates. NOT live tradable FX OHLC, not for intraday signals.
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff',...headers}});
export async function onRequestGet(context){
  const url=new URL(context.request.url);
  const pair=String(url.searchParams.get('pair')||'USDINR').toUpperCase();
  const pairs={USDINR:['USD','INR'],EURINR:['EUR','INR'],GBPINR:['GBP','INR'],EURUSD:['EUR','USD'],USDJPY:['USD','JPY']};
  if(!pairs[pair])return json({error:'Unsupported reference FX pair'},400,{'cache-control':'no-store'});
  const [base,quote]=pairs[pair];
  const upstream='https://api.frankfurter.dev/v2/rate/'+base+'/'+quote;
  try{
    const response=await fetch(upstream,{headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Reference-rate provider HTTP '+response.status);
    const data=await response.json(),rate=Number(data?.rate),date=String(data?.date||'');
    if(!Number.isFinite(rate)||rate<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Malformed FX reference rate');
    return json({pair,base,quote,rate,date,asOf:date,source:'Frankfurter v2 blended official reference rates',kind:'reference_rate',tradable:false,realtime:false,hasOHLC:false,signalEligible:false,delay:'Daily/reference; not a broker quote'},200,{'cache-control':'public, max-age=3600'});
  }catch(error){
    return json({error:error?.name==='TimeoutError'?'FX reference rate timed out':'FX reference rates unavailable'},502,{'cache-control':'no-store'});
  }
}
