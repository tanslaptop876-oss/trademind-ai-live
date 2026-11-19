/* TradeMind: browser-side conservative read-only signal eligibility policy.
   A provider response is NOT proof of a live quote or a closed last candle. */
(function(root){'use strict';
  const intradayMs=Object.freeze({'1min':60000,'5min':300000,'15min':900000,'30min':1800000,'60min':3600000});
  function toEpoch(value){
    const text=String(value||'').trim();
    // Exchange-local timestamps without an offset are Asia/Kolkata wall-clock.
    const local=/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/;
    if(local.test(text))return Date.parse(text.replace(' ','T')+'+05:30');
    // Explicit offsets and date-only EOD / month buckets.
    if(/^\d{4}-\d\d(?:-\d\d)?$/.test(text))return Date.parse(text);
    return Date.parse(text.replace(' ','T'));
  }
  function result(status,rows,reason,other={}){
    return {status,rows,reason,asOf:rows.at(-1)?.date||null,liveEligible:false,
      historicalEligible:rows.length>=35,...other};
  }
  function inspect(entry,{broker=false,failed=false,interval='daily',now=Date.now()}={}){
    const original=entry?.rows;
    if(!Array.isArray(original))return result('INVALID',[],'Missing price candles');
    // Always discard newest broker bar because provider does not mark it closed.
    const rows=(broker?original.slice(0,-1):original.slice());
    if(rows.length<35)return result('INSUFFICIENT',rows,'At least 35 completed candles are required');
    let lastTime=-Infinity;
    for(const candle of rows){
      const stamp=toEpoch(candle.date);
      if(!Number.isFinite(stamp)||stamp<=lastTime)
        return result('INVALID',[],'Candle timestamps are invalid, repeated or unordered');
      lastTime=stamp;
      const {open,high,low,close,volume}=candle;
      if([open,high,low,close,volume].some(x=>typeof x!=='number'||!Number.isFinite(x))||
        open<=0||high<=0||low<=0||close<=0||volume<0||
        high<Math.max(open,close)||low>Math.min(open,close)||high<low)
        return result('INVALID',[],'Candle OHLCV data failed validation');
    }
    if(!broker)return result('RESEARCH',rows,'Imported or demo history is not live');
    if(failed)return result('STALE',rows,'Previous broker refresh failed; old data is not live');
    const span=intradayMs[interval];
    if(!span)return result('EOD',rows,'Daily, weekly or monthly history is not a live quote');
    // Never accept a date-only broker candle as an intraday timestamp.
    if(!/[T ]\d\d:\d\d/.test(rows.at(-1).date))
      return result('UNKNOWN',rows,'Intraday candle has no clock time');
    const local=new Date(now+330*60000);
    const day=local.getUTCDay(),minutes=local.getUTCHours()*60+local.getUTCMinutes();
    const open=day>=1&&day<=5&&minutes>=555&&minutes<930;
    if(!open)return result('CLOSED',rows,'NSE regular session is not active');
    const age=now-lastTime;
    if(age<0)return result('FUTURE',rows,'Completed candle timestamp is in the future');
    if(age>2*span+300000)
      return result('STALE',rows,'Last completed candle is older than freshness threshold',
        {ageMinutes:Math.round(age/60000)});
    return result('RECENT',rows,'Recent closed broker candles; provider and exchange delays may still apply',
      {liveEligible:true,ageMinutes:Math.round(age/60000)});
  }
  const api={inspect,toEpoch};
  root.TradeMindLiveSignalPolicy=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
