// TradeMind admin-only read-only CoinDCX outcome preview.
// Uses server-fetched candles and existing fail-closed evaluator. No writes or orders.
import '../../signal-forward-outcomes.js';
import {onRequestGet as getMarketData} from './market-data.js';

const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const intervals={'1m':'1min','15m':'15min','1h':'60min','1d':'daily'};
const durations={'1m':60000,'15m':900000,'1h':3600000,'1d':86400000};
const symbols=new Set(['BTCUSDT','ETHUSDT','BTCINR','ETHINR']);
function authorized(request,env){
  const expected=env?.SIGNAL_LOG_TOKEN,got=request.headers.get('x-signal-log-token');
  if(typeof expected!=='string'||expected.length<24||typeof got!=='string'||got.length!==expected.length)return false;
  let mismatch=0;for(let i=0;i<got.length;i++)mismatch|=got.charCodeAt(i)^expected.charCodeAt(i);
  return mismatch===0;
}
export async function onRequestGet({request,env}){
  if(!authorized(request,env))return respond({error:'Not authorized'},401);
  if(!env?.SIGNAL_DB||typeof env.SIGNAL_DB.prepare!=='function')return respond({error:'Signal database unavailable'},503);
  const url=new URL(request.url),key=url.searchParams.get('event_key')||'';
  if(!key||key.length>256)return respond({error:'Valid event_key required'},400);
  const requestedHorizon=Number(url.searchParams.get('horizon')||5),feeBps=Number(url.searchParams.get('fee_bps')||10);
  if(!Number.isInteger(requestedHorizon)||requestedHorizon<1||requestedHorizon>25||!Number.isFinite(feeBps)||feeBps<0||feeBps>500)
    return respond({error:'Invalid preview horizon or cost'},400);
  let observation;
  try{
    observation=await env.SIGNAL_DB.prepare(`SELECT event_key,symbol,market,timeframe,source,signal,candle_at,candle_close,observed_at
      FROM signal_observations WHERE event_key=? LIMIT 1`).bind(key).first();
  }catch{return respond({error:'Signal observation query failed'},503)}
  if(!observation)return respond({error:'Observation not found'},404);
  if(observation.event_key!==key||observation.market!=='CRYPTO'||observation.source!=='COINDCX'||
      !symbols.has(observation.symbol)||!intervals[observation.timeframe])
    return respond({error:'Preview supports CoinDCX public spot observations at 1m/15m/1h/1d only'},422);
  if(observation.signal==='WAIT')return respond({status:'SKIPPED',reason:'No directional signal to reconcile',persisted:false});
  // This endpoint is a conservative preview; daily outcomes remain pending
  // until an exchange-specific trading-calendar and time-window policy exists.
  if(observation.timeframe==='1d')
    return respond({status:'PENDING',reason:'Daily candle calendar validation is not enabled',persisted:false});
  let data;
  try{
    const params=new URLSearchParams({symbol:observation.symbol,type:'crypto',mode:'live',interval:intervals[observation.timeframe]});
    const upstreamRequest=new Request('https://trademind.internal/api/market-data?'+params.toString());
    const response=await getMarketData({request:upstreamRequest,env:{...env,FREE_CRYPTO_SOURCE:'coindcx'}});
    data=await response.json();
    if(!response.ok||data.source!=='CoinDCX public spot candles'||!Array.isArray(data.rows))
      throw Error('Public candle data unavailable');
  }catch{return respond({status:'PENDING',reason:'Trusted public source fetch unavailable',persisted:false})}
  const now=Date.now(),duration=durations[observation.timeframe],rows=[];
  try{
    for(const r of data.rows){
      const stamp=Date.parse(r.date);
      if(!Number.isFinite(stamp)||typeof r.open!=='number'||typeof r.high!=='number'||
         typeof r.low!=='number'||typeof r.close!=='number'||stamp>now+60000)
        throw Error('Invalid source candles');
      // Candle timestamps are opening timestamps; only include fully elapsed intervals
      // with an extra 60-second guard against incomplete responses.
      rows.push({...r,complete:stamp+duration+60000<=now});
    }
    const result=globalThis.TradeMindForwardOutcomes.evaluate(observation,rows,{
      horizonBars:requestedHorizon,feeBps,market:'CRYPTO',timeframe:observation.timeframe});
    return respond({...result,eventKey:key,source:'CoinDCX public spot candles',persisted:false,
      kind:'provider_history_preview_not_independently_audited',noOrders:true});
  }catch{return respond({status:'PENDING',reason:'Source candles failed validation or reconciliation',persisted:false})}
}
