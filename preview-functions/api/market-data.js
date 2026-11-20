// Isolated preview-only public spot candles. No broker providers, credentials, or order endpoints.
const send=(body,status=200,cache='no-store')=>new Response(JSON.stringify(body),{status,headers:{
  'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff','cache-control':cache
}});
const pairs=Object.freeze({BTCUSDT:['B-BTC_USDT','USDT'],ETHUSDT:['B-ETH_USDT','USDT'],
  BTCINR:['I-BTC_INR','INR'],ETHINR:['I-ETH_INR','INR']});
const intervals=Object.freeze({'1min':'1m','15min':'15m','60min':'1h','daily':'1d'});
export async function onRequestGet({request}){
  const query=new URL(request.url).searchParams;
  const symbol=String(query.get('symbol')||'').toUpperCase(),type=query.get('type'),
    mode=query.get('mode')||'live',interval=query.get('interval')||'daily';
  if(type!=='crypto'||!Object.hasOwn(pairs,symbol)||!Object.hasOwn(intervals,interval)||mode!=='live')
    return send({error:'Preview supports only four CoinDCX spot crypto pairs and 1m,15m,1h,1d candles'},400);
  const url=new URL('https://api.coindcx.com/market_data/candles');
  url.searchParams.set('pair',pairs[symbol][0]);
  url.searchParams.set('interval',intervals[interval]);
  url.searchParams.set('limit','500');
  try{
    const upstream=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
    if(!upstream.ok)return send({error:'Public CoinDCX endpoint unavailable'},502);
    const values=await upstream.json();
    if(!Array.isArray(values)||values.length>2000)return send({error:'Malformed upstream response'},502);
    const seen=new Map();
    for(const v of values){
      const stamp=Number(v.time),open=Number(v.open),high=Number(v.high),low=Number(v.low),
        close=Number(v.close),volume=v.volume==null?null:Number(v.volume);
      if(!Number.isFinite(stamp)||stamp<1e12||!Number.isFinite(open)||!Number.isFinite(close)||
        !Number.isFinite(high)||!Number.isFinite(low)||low<=0||open<=0||close<=0||
        low>Math.min(open,close)||high<Math.max(open,close)||high<low||
        volume===null||!Number.isFinite(volume)||volume<0)continue;
      const date=new Date(stamp).toISOString();
      seen.set(date,{date,open,high,low,close,volume});
    }
    const rows=[...seen.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-500);
    if(rows.length<35)return send({error:'Not enough valid public candles'},502);
    return send({symbol,type:'crypto',mode:'live',interval,source:'CoinDCX public spot candles',
      currency:pairs[symbol][1],delay:'Public candles; exchange latency and formation unverified',
      quote:rows.at(-1).close,asOf:rows.at(-1).date,pe:null,rows},200,'public, max-age=30');
  }catch{return send({error:'CoinDCX public data fetch failed'},502)}
}
