// Optional D1-backed, client-reported signal observations (NOT independently verified).
// Never accepts execution instructions, secrets, or broker credentials as signal payloads.
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const allowedMarkets=new Set(['NSE','BSE','CRYPTO','MCX','FOREX','OTHER']);
const allowedTimeframes=new Set(['1m','3m','5m','15m','30m','1h','1d','1w','1mo']);
const allowedSources=new Set(['ICICI_BREEZE','UPSTOX','COINDCX','IMPORTED_CSV','OTHER']);
const digits=(n)=>typeof n==='number'&&Number.isFinite(n)&&n>0;
function authorized(request,env){
  // Separate dedicated token. Fail closed if unset. Never put token in query strings.
  const token=env?.SIGNAL_LOG_TOKEN;
  const supplied=request.headers.get('x-signal-log-token');
  return typeof token==='string'&&token.length>=24&&typeof supplied==='string'&&supplied.length===token.length&&
    // Constant work across equal-length tokens; enough for this internal control.
    (()=>{let diff=0;for(let i=0;i<token.length;i++)diff|=token.charCodeAt(i)^supplied.charCodeAt(i);return diff===0})();
}
function validate(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid observation payload');
  const symbol=String(value.symbol||'').trim().toUpperCase(),market=String(value.market||''),timeframe=String(value.timeframe||''),
    source=String(value.source||''),signal=String(value.signal||''),candleAt=String(value.candleAt||''),version=String(value.ruleVersion||'');
  if(!/^[A-Z0-9._/-]{1,24}$/.test(symbol)||!allowedMarkets.has(market)||!allowedTimeframes.has(timeframe)||
     !allowedSources.has(source)||!['BUY','SELL','WAIT'].includes(signal)||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(candleAt)||
     !Number.isFinite(Date.parse(candleAt))||!digits(value.candleClose)||!/^[a-zA-Z0-9._-]{1,40}$/.test(version))
    throw Error('Invalid signal observation fields');
  const evidence=value.evidence;
  if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))throw Error('Evidence object required');
  const keys=Object.keys(evidence);
  if(keys.length>15)throw Error('Too many evidence fields');
  for(const [k,v] of Object.entries(evidence)){
    if(!/^[a-zA-Z0-9_]{1,32}$/.test(k)||!(typeof v==='boolean'||v===null||(typeof v==='number'&&Number.isFinite(v))||
      (typeof v==='string'&&v.length<=80)))throw Error('Invalid evidence field');
  }
  const date=Date.parse(candleAt);
  if(date>Date.now()+120000||date<Date.now()-366*86400000)throw Error('Candle timestamp outside allowed range');
  const eventKey=[market,symbol,timeframe,source,candleAt,version].join('|');
  return {eventKey,symbol,market,timeframe,source,signal,candleAt,close:value.candleClose,version,evidence:JSON.stringify(evidence)};
}
function dbReady(env){return env?.SIGNAL_DB&&typeof env.SIGNAL_DB.prepare==='function'}
export async function onRequestPost({request,env}){
  if(!authorized(request,env))return respond({error:'Not authorized'},401);
  if(!dbReady(env))return respond({error:'Signal database is not configured'},503);
  if(Number(request.headers.get('content-length'))>8192)return respond({error:'Payload too large'},413);
  let record;
  try{
    const raw=await request.text();
    if(raw.length>8192)throw Error('Payload too large');
    record=validate(JSON.parse(raw));
  }catch(error){return respond({error:String(error.message||error)},400)}
  try{
    const observedAt=new Date().toISOString();
    const query=env.SIGNAL_DB.prepare(`INSERT OR IGNORE INTO signal_observations
      (event_key,symbol,market,timeframe,source,signal,candle_at,observed_at,candle_close,rule_version,evidence_json,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'UNVERIFIED')`);
    const result=await query.bind(record.eventKey,record.symbol,record.market,record.timeframe,record.source,record.signal,
      record.candleAt,observedAt,record.close,record.version,record.evidence).run();
    return respond({saved:!!result.meta?.changes,duplicate:!result.meta?.changes,status:'UNVERIFIED',eventKey:record.eventKey},result.meta?.changes?201:200);
  }catch{return respond({error:'Signal observation database operation failed'},503)}
}
export async function onRequestGet({request,env}){
  if(!authorized(request,env))return respond({error:'Not authorized'},401);
  if(!dbReady(env))return respond({error:'Signal database is not configured'},503);
  const url=new URL(request.url),limit=Number(url.searchParams.get('limit')||50);
  if(!Number.isInteger(limit)||limit<1||limit>200)return respond({error:'Limit must be 1–200'},400);
  try{
    const query=env.SIGNAL_DB.prepare(`SELECT event_key,symbol,market,timeframe,source,signal,candle_at,observed_at,candle_close,rule_version,evidence_json,status
      FROM signal_observations ORDER BY observed_at DESC,id DESC LIMIT ?`);
    const rows=(await query.bind(limit).all()).results||[];
    return respond({records:rows.map(({evidence_json,...row})=>({...row,evidence:JSON.parse(evidence_json)})),
      kind:'client_reported_unverified_signal_observations',noOrders:true});
  }catch{return respond({error:'Signal observation database operation failed'},503)}
}
