/* TradeMind scanner extensions. Closed-candle research signals only; never submits orders. */
(function(root){'use strict';
  const allowed=new Set(['1m','3m','5m','15m','30m','1h','1d','1w','1mo']);
  const minutes={'1m':1,'3m':3,'5m':5,'15m':15,'30m':30,'1h':60};
  function verified(rows){
    if(!Array.isArray(rows)||!rows.length)throw Error('Nonempty OHLCV array required');
    let last=-Infinity;
    return rows.map((r,i)=>{
      const stamp=Date.parse(r.timestamp||r.date);
      if(!Number.isFinite(stamp)||stamp<=last)throw Error('Timestamps must be valid, unique, and increasing');
      last=stamp;
      const bar={timestamp:new Date(stamp).toISOString()};
      for(const field of ['open','high','low','close']){
        bar[field]=r[field];
        if(typeof bar[field]!=='number'||!Number.isFinite(bar[field])||bar[field]<=0)throw Error('Invalid '+field+' at bar '+i);
      }
      if(bar.low>Math.min(bar.open,bar.close)||bar.high<Math.max(bar.open,bar.close)||bar.high<bar.low)throw Error('Invalid OHLC at bar '+i);
      bar.volume=r.volume===null||r.volume===undefined?null:r.volume;
      if(bar.volume!==null&&(!Number.isFinite(bar.volume)||bar.volume<0))throw Error('Invalid volume at bar '+i);
      bar.complete=r.complete===true;
      return bar;
    });
  }
  function aggregate(rows,source,target,sessionOffsetMinutes=330,sessionOpenMinute=555){
    if(!allowed.has(source)||!allowed.has(target))throw Error('Unsupported timeframe');
    const sourceM=minutes[source],targetM=minutes[target];
    if(!sourceM||!targetM||targetM<sourceM||targetM%sourceM)throw Error('Only integer intraday multiples can be aggregated');
    if(!Number.isInteger(sessionOffsetMinutes)||Math.abs(sessionOffsetMinutes)>840)throw Error('Invalid session offset');
    if(!Number.isInteger(sessionOpenMinute)||sessionOpenMinute<0||sessionOpenMinute>=1440)throw Error('Invalid session open minute');
    const raw=verified(rows).filter(x=>x.complete);
    if(!raw.length)return [];
    const result=[],expected=targetM/sourceM,sourceMillis=sourceM*60000;
    for(const r of raw){
      const millis=Date.parse(r.timestamp),local=millis+sessionOffsetMinutes*60000;
      const day=Math.floor(local/86400000),minute=Math.floor((local-day*86400000)/60000);
      // Never blend bars across exchanges' trading-day boundaries or a different session.
      if(minute<sessionOpenMinute||(minute-sessionOpenMinute)%sourceM)continue;
      const bucketMinute=sessionOpenMinute+Math.floor((minute-sessionOpenMinute)/targetM)*targetM;
      const bucketStamp=day*86400000+bucketMinute*60000-sessionOffsetMinutes*60000;
      const key=new Date(bucketStamp).toISOString(),prev=result.at(-1);
      if(prev&&prev.timestamp===key){
        // A missing middle bar must not become an apparently closed aggregate.
        if(millis!==prev.lastMillis+sourceMillis)prev.contiguous=false;
        prev.high=Math.max(prev.high,r.high);prev.low=Math.min(prev.low,r.low);prev.close=r.close;
        prev.volume=prev.volume===null||r.volume===null?null:prev.volume+r.volume;
        prev.lastMillis=millis;prev.count++;
      }else result.push({...r,timestamp:key,count:1,lastMillis:millis,contiguous:millis===bucketStamp});
    }
    return result.filter(x=>x.contiguous&&x.count===expected)
      .map(({count,lastMillis,contiguous,...rest})=>rest);
  }
  function multiTimeframe(series){
    if(!Array.isArray(series)||!series.length)throw Error('Provide timeframe series');
    const outcomes=series.map(({timeframe,rows})=>{
      if(!allowed.has(timeframe))throw Error('Unsupported timeframe: '+timeframe);
      const bars=verified(rows).filter(x=>x.complete);
      if(bars.length<26)return {timeframe,direction:'WAIT',reason:'At least 26 closed candles required',bars:bars.length};
      const closes=bars.map(x=>x.close),last=closes.at(-1);
      const sma=n=>closes.slice(-n).reduce((a,b)=>a+b,0)/n;
      const fast=sma(9),slow=sma(21),previous=closes.at(-2);
      const direction=last>fast&&fast>slow&&last>previous?'UP':last<fast&&fast<slow&&last<previous?'DOWN':'WAIT';
      return {timeframe,direction,price:last,ma9:fast,ma21:slow,asOf:bars.at(-1).timestamp,bars:bars.length};
    });
    const actionable=outcomes.filter(x=>x.direction!=='WAIT'),up=actionable.filter(x=>x.direction==='UP').length,down=actionable.length-up;
    const direction=up&&up===outcomes.length?'UP':down&&down===outcomes.length?'DOWN':'WAIT';
    return {direction,agreement:outcomes.length?Math.max(up,down)/outcomes.length:0,up,down,total:outcomes.length,timeframes:outcomes,kind:'rule_based_not_probability'};
  }
  function breakout(rows,{lookback=20,volumeWindow=20,minVolumeRatio=1.5,atrWindow=14}={}){
    if(!Number.isInteger(lookback)||lookback<2||lookback>250||!Number.isInteger(volumeWindow)||volumeWindow<2||volumeWindow>250||!Number.isInteger(atrWindow)||atrWindow<2||atrWindow>250||!Number.isFinite(minVolumeRatio)||minVolumeRatio<0)throw Error('Invalid breakout parameters');
    const candles=verified(rows).filter(x=>x.complete),required=Math.max(lookback,volumeWindow,atrWindow)+1;
    if(candles.length<required)return {direction:'WAIT',reason:'Insufficient closed candles',required,available:candles.length};
    const last=candles.at(-1),prev=candles.slice(-lookback-1,-1),resistance=Math.max(...prev.map(x=>x.high)),support=Math.min(...prev.map(x=>x.low));
    const vWindow=candles.slice(-volumeWindow-1,-1),withVolume=last.volume!==null&&vWindow.every(x=>x.volume!==null);
    const averageVolume=withVolume?vWindow.reduce((s,x)=>s+x.volume,0)/volumeWindow:null;
    const volumeRatio=averageVolume>0?last.volume/averageVolume:null;
    const ranges=[];for(let i=candles.length-atrWindow;i<candles.length;i++){
      const r=candles[i],p=candles[i-1];ranges.push(Math.max(r.high-r.low,Math.abs(r.high-p.close),Math.abs(r.low-p.close)));
    }
    const atr=ranges.reduce((a,b)=>a+b,0)/atrWindow;
    const confirmed=volumeRatio!==null&&volumeRatio>=minVolumeRatio;
    const raw=last.close>resistance?'UP':last.close<support?'DOWN':'WAIT';
    return {direction:confirmed?raw:'WAIT',candidate:raw,volumeConfirmed:confirmed,volumeRatio,volumeAvailable:withVolume,lookback,atr,resistance,support,asOf:last.timestamp,price:last.close,reason:raw!=='WAIT'&&!confirmed?'Breakout needs valid volume confirmation':null,kind:'rule_based_not_probability'};
  }
  // Broker candle freshness guard. Never assert real-time status from date-only data.
  function candleFreshness(timestamp, interval, now=Date.now()){
    const durations={'1min':60000,'5min':300000,'15min':900000,'30min':1800000,'60min':3600000};
    if(!Object.prototype.hasOwnProperty.call(durations,interval))
      return {status:'EOD',fresh:false,reason:'Not an intraday live interval'};
    const raw=String(timestamp||'').trim();
    // For timezone-naive Indian exchange timestamps interpret wall-clock as Asia/Kolkata.
    const normalized=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw)&&!/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)
      ?raw.replace(' ','T')+'+05:30':raw;
    const ts=Date.parse(normalized),age=now-ts,span=durations[interval];
    if(!Number.isFinite(ts)||!Number.isFinite(now))return {status:'UNKNOWN',fresh:false,reason:'Invalid candle timestamp'};
    if(age < -span)return {status:'FUTURE',fresh:false,reason:'Candle time is in the future'};
    const marketMinutes=((Math.floor(now/60000)+330)%1440+1440)%1440;
    const day=new Date(now+330*60000).getUTCDay();
    const marketOpen=day>=1&&day<=5&&marketMinutes>=555&&marketMinutes<=930;
    const fresh=marketOpen&&age>=-span&&age<=2*span+300000;
    return {status:fresh?'RECENT':'STALE',fresh,ageMinutes:Math.round(age/60000),reason:fresh?'Recent broker candle; provider entitlement/delay unverified':marketOpen?'Last candle too old':'NSE trading session is not active'};
  }
  // Indicative ATR-based planning only. Entry is last *closed* candle close,
  // not a fill or live executable price. Costs, gaps and slippage can exceed stop.
  function planTrade(rows,direction,{atrWindow=14,stopAtr=1.5,targetR=2}={}){
    if(!['UP','DOWN','WAIT'].includes(direction))throw Error('Invalid signal direction');
    if(!Number.isInteger(atrWindow)||atrWindow<2||atrWindow>100||
      !Number.isFinite(stopAtr)||stopAtr<=0||stopAtr>10||
      !Number.isFinite(targetR)||targetR<1||targetR>10)throw Error('Invalid risk settings');
    if(direction==='WAIT')return {status:'WAIT',reason:'No directional consensus',executable:false};
    const bars=verified(rows).filter(x=>x.complete);
    if(bars.length<atrWindow+1)return {status:'WAIT',reason:'Not enough closed candles for ATR',executable:false};
    const recent=bars.slice(-atrWindow),prior=bars.at(-atrWindow-1),tr=[];
    for(const r of recent){
      tr.push(Math.max(r.high-r.low,Math.abs(r.high-prior.close),Math.abs(r.low-prior.close)));
      prior=r;
    }
    const atr=tr.reduce((a,b)=>a+b,0)/atrWindow,entry=bars.at(-1).close;
    const distance=stopAtr*atr;
    if(!(atr>0)||!(distance>0))return {status:'WAIT',reason:'Zero volatility / ATR',executable:false};
    const long=direction==='UP',stop=long?entry-distance:entry+distance,target=long?entry+distance*targetR:entry-distance*targetR;
    if(stop<=0||target<=0)return {status:'WAIT',reason:'Unusable price levels',executable:false};
    return {status:'PLAN',side:long?'LONG':'SHORT',entry,stop,target,atr,risk:distance,reward:distance*targetR,
      rewardRisk:targetR,asOf:bars.at(-1).timestamp,executable:false,
      caveat:'Indicative closed-candle levels; no orders, fills, slippage, leverage or fees modelled'};
  }
  const api={aggregate,multiTimeframe,breakout,verified,candleFreshness,planTrade};
  root.TradeMindScannerExtensions=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
