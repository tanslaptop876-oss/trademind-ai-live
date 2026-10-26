const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff',...headers}});

async function alphaVantage({symbol,mode,interval,key}){
  const api='https://www.alphavantage.co/query';
  const seriesUrl=new URL(api);seriesUrl.searchParams.set('function',mode==='live'?'TIME_SERIES_INTRADAY':'TIME_SERIES_DAILY');seriesUrl.searchParams.set('symbol',symbol);seriesUrl.searchParams.set('outputsize','compact');seriesUrl.searchParams.set('apikey',key);if(mode==='live')seriesUrl.searchParams.set('interval',interval==='daily'?'15min':interval);
  const overviewUrl=new URL(api);overviewUrl.searchParams.set('function','OVERVIEW');overviewUrl.searchParams.set('symbol',symbol);overviewUrl.searchParams.set('apikey',key);
  const [seriesResponse,overviewResponse]=await Promise.all([fetch(seriesUrl,{signal:AbortSignal.timeout(8000)}),fetch(overviewUrl,{signal:AbortSignal.timeout(8000)})]);
  if(!seriesResponse.ok)throw new Error(`Alpha Vantage HTTP ${seriesResponse.status}`);
  const seriesData=await seriesResponse.json(),overview=overviewResponse.ok?await overviewResponse.json():{};
  const providerMessage=seriesData.Note||seriesData.Information||seriesData['Error Message'];if(providerMessage)throw new Error(String(providerMessage));
  const seriesKey=Object.keys(seriesData).find(keyName=>keyName.toLowerCase().includes('time series'));if(!seriesKey)throw new Error('Alpha Vantage returned no time series');
  const rows=Object.entries(seriesData[seriesKey]).map(([date,row])=>({date,open:Number(row['1. open']),high:Number(row['2. high']),low:Number(row['3. low']),close:Number(row['4. close']),volume:Number(row['5. volume']||0)})).sort((a,b)=>a.date.localeCompare(b.date));
  if(rows.length<35)throw new Error('Alpha Vantage returned fewer than 35 bars');
  const pe=Number(overview.PERatio),last=rows.at(-1);return {symbol,type:'stocks',mode,interval,source:'Alpha Vantage',delay:mode==='live'?'Provider entitlement / exchange delay applies':'End of day',currency:String(overview.Currency||''),pe:Number.isFinite(pe)?pe:null,quote:last.close,asOf:last.date,rows};
}

const isoDate=date=>date.toISOString().slice(0,10);
const isoTimestamp=date=>`${date.toISOString().slice(0,19)}.000Z`;
function aggregateBars(rows,interval){if(!['15min','60min','weekly','monthly'].includes(interval))return rows;
  const buckets=new Map();for(const row of rows){const stamp=String(row.date).replace('T',' '),day=stamp.slice(0,10);let key;
    if(interval==='weekly'){const d=new Date(`${day}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);key=d.toISOString().slice(0,10)}
    else if(interval==='monthly')key=day.slice(0,7);
    else {const parts=stamp.match(/(\d{2}):(\d{2})/);if(!parts)continue;const minute=Number(parts[1])*60+Number(parts[2]),width=interval==='15min'?15:60,start=555+Math.floor((minute-555)/width)*width;key=`${day} ${String(Math.floor(start/60)).padStart(2,'0')}:${String(start%60).padStart(2,'0')}:00`}
    const previous=buckets.get(key);if(previous){previous.high=Math.max(previous.high,row.high);previous.low=Math.min(previous.low,row.low);previous.close=row.close;previous.volume+=row.volume}else buckets.set(key,{...row,date:key})}
  return [...buckets.values()]
}

async function iciciBreeze({stockCode,mode,interval,apiKey,sessionToken}){
  const now=new Date(),from=new Date(now),breezeInterval=['daily','weekly','monthly'].includes(interval)?'1day':({'1min':'1minute','5min':'5minute','15min':'5minute','30min':'30minute','60min':'30minute'}[interval]||'5minute');
  from.setUTCDate(from.getUTCDate()-(interval==='monthly'?1460:interval==='weekly'?1000:interval==='daily'?365:interval==='1min'?2:interval==='5min'||interval==='15min'?7:28));
  const url=new URL('https://breezeapi.icicidirect.com/api/v2/historicalcharts');
  for(const [key,value] of Object.entries({stock_code:stockCode,exch_code:'NSE',from_date:isoTimestamp(from),to_date:isoTimestamp(now),interval:breezeInterval,product_type:'cash'}))url.searchParams.set(key,value);
  const response=await fetch(url,{method:'GET',headers:{accept:'application/json',apikey:apiKey,'x-sessiontoken':sessionToken},signal:AbortSignal.timeout(10000)});
  const payload=await response.json().catch(()=>({}));if(!response.ok||payload?.Error)throw Error(String(payload?.Error||`ICICI Breeze HTTP ${response.status}`));
  const candles=payload?.Success;if(!Array.isArray(candles))throw Error('ICICI Breeze returned no historical candles');
  const nativeRows=candles.map(row=>({date:String(row.datetime||row.date||''),open:Number(row.open),high:Number(row.high),low:Number(row.low),close:Number(row.close),volume:Number(row.volume||0)})).filter(row=>row.date&&[row.open,row.high,row.low,row.close].every(Number.isFinite)).sort((a,b)=>a.date.localeCompare(b.date));
  const rows=aggregateBars(nativeRows,interval);if(rows.length<35)throw Error(`ICICI Breeze returned only ${rows.length} ${interval} bars; at least 35 are needed`);
  const last=rows.at(-1),volumes=rows.slice(-20).map(row=>row.volume),averageVolume=volumes.reduce((a,b)=>a+b,0)/volumes.length;
  return{symbol:stockCode,type:'stocks',mode,interval,source:'ICICI Direct Breeze Historical V2',delay:'Last available candle; exchange/session delay applies',currency:'INR',pe:null,quote:last.close,averageVolume,asOf:last.date,rows};
}

async function upstox({instrumentKey,mode,interval,token}){
  const headers={accept:'application/json',authorization:`Bearer ${token}`},now=new Date(),from=new Date(now),minuteInterval=interval==='daily'?15:Math.max(1,Number.parseInt(interval,10)||15);from.setUTCDate(from.getUTCDate()-(mode==='live'?28:365));
  const encoded=encodeURIComponent(instrumentKey),historyUrl=mode==='live'?`https://api.upstox.com/v3/historical-candle/${encoded}/minutes/${minuteInterval}/${isoDate(now)}/${isoDate(from)}`:`https://api.upstox.com/v3/historical-candle/${encoded}/days/1/${isoDate(now)}/${isoDate(from)}`,quoteUrl=`https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encoded}`;
  const [historyResponse,quoteResponse]=await Promise.all([fetch(historyUrl,{headers,signal:AbortSignal.timeout(9000)}),fetch(quoteUrl,{headers,signal:AbortSignal.timeout(9000)})]);
  if(!historyResponse.ok)throw new Error(`Upstox history HTTP ${historyResponse.status}`);if(!quoteResponse.ok)throw new Error(`Upstox quote HTTP ${quoteResponse.status}`);
  const history=await historyResponse.json(),quotePayload=await quoteResponse.json(),candles=history?.data?.candles;if(!Array.isArray(candles))throw new Error(history?.errors?.[0]?.message||'Upstox returned no candles');
  const rows=candles.map(c=>({date:String(c[0]),open:Number(c[1]),high:Number(c[2]),low:Number(c[3]),close:Number(c[4]),volume:Number(c[5]||0)})).sort((a,b)=>a.date.localeCompare(b.date));if(rows.length<35)throw new Error('Upstox returned fewer than 35 bars');
  const quote=Object.values(quotePayload?.data||{})[0]||{},bid=Number(quote.depth?.buy?.[0]?.price),ask=Number(quote.depth?.sell?.[0]?.price),lastPrice=Number(quote.last_price)||rows.at(-1).close,spreadBps=bid>0&&ask>=bid?((ask-bid)/((ask+bid)/2))*10000:null,volumes=rows.slice(-20).map(r=>r.volume).filter(Number.isFinite),averageVolume=volumes.length?volumes.reduce((a,b)=>a+b,0)/volumes.length:null;
  return {symbol:instrumentKey,type:'stocks',mode,interval,source:'Upstox',delay:'Exchange snapshot; plan entitlement applies',currency:'INR',pe:null,quote:lastPrice,bid:Number.isFinite(bid)?bid:null,ask:Number.isFinite(ask)?ask:null,spreadBps:Number.isFinite(spreadBps)?spreadBps:null,averageVolume,asOf:String(quote.timestamp||rows.at(-1).date),rows};
}

export async function onRequestGet(context){
  const requestUrl=new URL(context.request.url);
  const symbol=(requestUrl.searchParams.get('symbol')||'').trim().toUpperCase();
  const type=(requestUrl.searchParams.get('type')||'').trim().toLowerCase();
  const mode=(requestUrl.searchParams.get('mode')||'eod').trim().toLowerCase();
  const interval=(requestUrl.searchParams.get('interval')||'daily').trim().toLowerCase();
  const upstoxKey=(requestUrl.searchParams.get('upstox_key')||'').trim().toUpperCase();
  const iciciCode=(requestUrl.searchParams.get('icici_code')||'').trim().toUpperCase();
  if(!/^[A-Z0-9./_-]{1,24}$/.test(symbol)||!['stocks','crypto','mcx','forex'].includes(type)||!['live','eod'].includes(mode)||!['1min','5min','15min','30min','60min','daily','weekly','monthly'].includes(interval))return json({error:'Invalid market-data request'},400);
  if(context.env.MARKET_PROVIDER==='upstox'&&type==='stocks'){
    if(!context.env.UPSTOX_ACCESS_TOKEN)return json({error:'UPSTOX_ACCESS_TOKEN is not configured',mode:'demo'},503);if(!/^NSE_EQ\|[A-Z0-9]{8,20}$/.test(upstoxKey))return json({error:'A valid NSE Upstox instrument key is required'},400);
    try{const data=await upstox({instrumentKey:upstoxKey,mode,interval,token:context.env.UPSTOX_ACCESS_TOKEN});return json({...data,rows:data.rows.slice(-500)},200,{'cache-control':mode==='live'?'private, max-age=10':'private, max-age=300'})}catch(error){return json({error:error?.name==='TimeoutError'?'Upstox timed out':error.message||'Upstox request failed'},502)}
  }
  if(context.env.MARKET_PROVIDER==='icici_breeze'&&type==='stocks'){
    if(!context.env.ICICI_BREEZE_API_KEY||!context.env.ICICI_BREEZE_SESSION_TOKEN)return json({error:'ICICI Breeze API key and session token are not configured',mode:'demo'},503);
    if(!context.env.MARKET_ACCESS_TOKEN)return json({error:'MARKET_ACCESS_TOKEN is required before enabling public broker data',mode:'demo'},503,{'cache-control':'no-store'});
    if(context.request.headers.get('x-market-access')!==context.env.MARKET_ACCESS_TOKEN)return json({error:'TradeMind access code is required',mode:'demo'},401,{'cache-control':'no-store'});
    if(!/^[A-Z0-9]{1,16}$/.test(iciciCode))return json({error:'A valid ICICI Breeze stock code is required'},400);
    try{const data=await iciciBreeze({stockCode:iciciCode,mode,interval,apiKey:context.env.ICICI_BREEZE_API_KEY,sessionToken:context.env.ICICI_BREEZE_SESSION_TOKEN});return json({...data,rows:data.rows.slice(-500)},200,{'cache-control':mode==='live'?'private, max-age=10':'private, max-age=300'})}catch(error){return json({error:error?.name==='TimeoutError'?'ICICI Breeze timed out':error.message||'ICICI Breeze request failed'},502)}
  }
  if(context.env.MARKET_PROVIDER==='alpha_vantage'&&type==='stocks'){
    if(!context.env.ALPHA_VANTAGE_API_KEY)return json({error:'ALPHA_VANTAGE_API_KEY is not configured',mode:'demo'},503);
    try{const data=await alphaVantage({symbol,mode,interval,key:context.env.ALPHA_VANTAGE_API_KEY});return json({...data,rows:data.rows.slice(-500)},200,{'cache-control':mode==='live'?'public, max-age=15':'public, max-age=300'})}catch(error){return json({error:error?.name==='TimeoutError'?'Alpha Vantage timed out':error.message||'Alpha Vantage request failed'},502)}
  }
  if(!context.env.MARKET_DATA_BASE_URL||!context.env.MARKET_API_KEY)return json({error:'Market-data provider is not configured',mode:'demo'},503);
  let providerBase;
  try{providerBase=new URL(context.env.MARKET_DATA_BASE_URL)}catch{return json({error:'Invalid provider configuration'},500)}
  if(providerBase.protocol!=='https:')return json({error:'Provider URL must use HTTPS'},500);
  providerBase.searchParams.set('symbol',symbol);providerBase.searchParams.set('type',type);providerBase.searchParams.set('mode',mode);providerBase.searchParams.set('interval',interval);
  try{
    const response=await fetch(providerBase,{headers:{authorization:`Bearer ${context.env.MARKET_API_KEY}`,accept:'application/json'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)return json({error:'Provider request failed',providerStatus:response.status},502);
    const data=await response.json();
    if(!data||!Array.isArray(data.rows)||data.rows.length<35)return json({error:'Provider response does not match the normalized OHLCV contract'},502);
    const rows=data.rows.slice(-500).map(row=>({date:String(row.date),open:Number(row.open),high:Number(row.high),low:Number(row.low),close:Number(row.close),volume:Number(row.volume||0)}));
    if(rows.some(row=>!row.date||!Number.isFinite(row.close)||row.high<Math.max(row.open,row.close)||row.low>Math.min(row.open,row.close)))return json({error:'Provider returned invalid OHLCV data'},502);
    const pe=data.pe==null?null:Number(data.pe),quote=data.quote==null?null:Number(data.quote);
    return json({symbol,type,mode,interval,source:String(data.source||'Configured provider'),delay:String(data.delay||'Unknown'),currency:String(data.currency||''),pe:Number.isFinite(pe)?pe:null,quote:Number.isFinite(quote)?quote:null,asOf:String(data.asOf||rows.at(-1).date),rows},200,{'cache-control':mode==='live'?'public, max-age=15':'public, max-age=300'});
  }catch(error){return json({error:error?.name==='TimeoutError'?'Provider timed out':'Provider connection failed'},504)}
}

