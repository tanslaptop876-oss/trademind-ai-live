// Optional public Kraken spot OHLC reference source for personal research only.
// No API key, no execution routes, no redistribution rights implied.
const reply=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff'}
});
const pairs=Object.freeze({BTCUSD:'XBTUSD',ETHUSD:'ETHUSD'});
const resolutions=Object.freeze({'1min':1,'5min':5,'15min':15,'30min':30,
  '60min':60,daily:1440,weekly:10080});

export async function onRequestGet({request,env={}}){
  if(env.ENABLE_PUBLIC_CRYPTO_RESEARCH!=='true'){
    return reply({error:'Kraken reference source is disabled until explicitly enabled for permitted research use',
      mode:'research',signalEligible:false},503);
  }
  const params=new URL(request.url).searchParams;
  const pair=String(params.get('pair')||'').toUpperCase();
  const interval=String(params.get('interval')||'').toLowerCase();
  if(!Object.hasOwn(pairs,pair)||!Object.hasOwn(resolutions,interval)){
    return reply({error:'Unsupported pair or interval',allowedPairs:Object.keys(pairs),
      allowedIntervals:Object.keys(resolutions)},400);
  }
  const url=new URL('https://api.kraken.com/0/public/OHLC');
  url.searchParams.set('pair',pairs[pair]);
  url.searchParams.set('interval',String(resolutions[interval]));
  try{
    const response=await fetch(url,{
      headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)
    });
    if(!response.ok)throw new Error('Kraken HTTP error');
    const payload=await response.json();
    if(!Array.isArray(payload?.error)||payload.error.length||
      !payload?.result||typeof payload.result!=='object'){
      throw new Error('Kraken API returned an error or invalid structure');
    }
    const series=Object.entries(payload.result).find(([key,value])=>key!=='last'&&Array.isArray(value))?.[1];
    if(!Array.isArray(series)||series.length<36)throw new Error('Not enough Kraken candles');
    // Kraken documents the final OHLC row as a still-forming candle.
    const completeRows=series.slice(0,-1);
    const byTime=new Map();
    for(const r of completeRows){
      if(!Array.isArray(r)||r.length<7)continue;
      const epoch=Number(r[0]),open=Number(r[1]),high=Number(r[2]),
        low=Number(r[3]),close=Number(r[4]),volume=Number(r[6]);
      if(!Number.isSafeInteger(epoch)||epoch<=0||
        [open,high,low,close,volume].some(x=>!Number.isFinite(x))||
        open<=0||high<=0||low<=0||close<=0||volume<0||
        low>Math.min(open,close)||high<Math.max(open,close)||high<low||
        epoch*1000>Date.now())continue;
      const date=new Date(epoch*1000).toISOString();
      byTime.set(date,{date,open,high,low,close,volume,complete:true});
    }
    const rows=[...byTime.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-500);
    if(rows.length<35)throw new Error('Fewer than 35 valid closed candles');
    return reply({pair,type:'crypto',mode:'research',interval,source:'Kraken public spot OHLC',
      delay:'Unverified public API latency; latest forming candle excluded',
      currency:'USD',asOf:rows.at(-1).date,quote:rows.at(-1).close,pe:null,
      readOnly:true,signalEligible:false,hasOHLC:true,commercialRightsVerified:false,
      caveat:'Research-only reference. Confirm provider permissions before commercial display or redistribution.',
      rows});
  }catch(error){
    const timeout=error?.name==='TimeoutError';
    return reply({error:timeout?'Public crypto reference request timed out':'Public crypto reference unavailable',
      mode:'research',signalEligible:false},502);
  }
}
