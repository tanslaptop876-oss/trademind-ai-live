// TradeMind server-only outcome reconciliation. CoinDCX historical spot candles only.
// Authentication and D1 are required. Does not send broker orders.
import {onRequestGet as previewOutcome} from './outcome-preview.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'
}});
function authorized(req,env){
  const secret=env?.SIGNAL_LOG_TOKEN,got=req.headers.get('x-signal-log-token');
  if(typeof secret!=='string'||secret.length<24||typeof got!=='string'||got.length!==secret.length)return false;
  let diff=0;for(let i=0;i<got.length;i++)diff|=secret.charCodeAt(i)^got.charCodeAt(i);
  return diff===0;
}
export async function onRequestPost({request,env}){
  if(!authorized(request,env))return json({error:'Not authorized'},401);
  if(!env?.SIGNAL_DB||typeof env.SIGNAL_DB.prepare!=='function')
    return json({error:'D1 signal database is not configured'},503);
  let payload;
  try{
    if(Number(request.headers.get('content-length'))>1024)throw Error('Payload too large');
    const raw=await request.text();if(raw.length>1024)throw Error('Payload too large');
    payload=JSON.parse(raw);
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||
      typeof payload.eventKey!=='string'||payload.eventKey.length<1||payload.eventKey.length>256||
      !Number.isInteger(payload.horizon)||payload.horizon<1||payload.horizon>25||
      !Number.isFinite(payload.feeBps)||payload.feeBps<0||payload.feeBps>500)
      throw Error('Invalid reconciliation request');
  }catch(error){return json({error:String(error.message||error)},400)}
  const url=new URL('https://trademind.internal/api/outcome-preview');
  url.searchParams.set('event_key',payload.eventKey);
  url.searchParams.set('horizon',String(payload.horizon));
  url.searchParams.set('fee_bps',String(payload.feeBps));
  let evaluation;
  try{
    const preview=await previewOutcome({request:new Request(url,{headers:{'x-signal-log-token':env.SIGNAL_LOG_TOKEN}}),env});
    evaluation=await preview.json();
    if(!preview.ok)return json({error:'Outcome preview unavailable',reason:evaluation.error},preview.status);
  }catch{return json({error:'Trusted outcome preview failed'},503)}
  if(evaluation.status!=='EVALUATED')
    return json({status:evaluation.status==='SKIPPED'?'SKIPPED':'PENDING',
      reason:evaluation.reason||'No eligible completed forward candles',saved:false,noOrders:true});
  if(evaluation.verification!=='HISTORICAL_PROVIDER_DATA_NOT_AUDITED'||evaluation.persisted!==false||
      !['WIN','LOSS','FLAT'].includes(evaluation.outcome)||evaluation.eventKey!==payload.eventKey)
    return json({error:'Outcome validation failed'},503);
  try{
    const sql=`INSERT OR IGNORE INTO signal_outcomes
      (event_key,evaluation_version,horizon_bars,entry_at,exit_at,entry_open,exit_close,
       gross_return,fee_bps,net_return,outcome,checked_at,verification)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const result=await env.SIGNAL_DB.prepare(sql).bind(
      payload.eventKey,evaluation.evaluationVersion,evaluation.horizonBars,evaluation.entryAt,
      evaluation.exitAt,evaluation.entryOpen,evaluation.exitClose,evaluation.grossReturn,
      evaluation.feeBps,evaluation.netReturn,evaluation.outcome,new Date().toISOString(),
      'HISTORICAL_PROVIDER_DATA_NOT_AUDITED').run();
    return json({status:'EVALUATED',saved:!!result.meta?.changes,duplicate:!result.meta?.changes,
      eventKey:payload.eventKey,verification:'HISTORICAL_PROVIDER_DATA_NOT_AUDITED',noOrders:true},
      result.meta?.changes?201:200);
  }catch{return json({error:'Outcome database write failed; verify migration 0002'},503)}
}
