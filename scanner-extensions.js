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
  function aggregate(rows,source,target,sessionOffsetMinutes=330){
    if(!allowed.has(source)||!allowed.has(target))throw Error('Unsupported timeframe');
    const raw=verified(rows).filter(x=>x.complete);
    if(!raw.length)return [];
    const sourceM=minutes[source],targetM=minutes[target];
    if(!sourceM||!targetM||targetM<sourceM||targetM%sourceM)throw Error('Only integer intraday multiples can be aggregated');
    if(!Number.isInteger(sessionOffsetMinutes)||Math.abs(sessionOffsetMinutes)>840)throw Error('Invalid session offset');
    const result=[];
    for(const r of raw){
      const local=Date.parse(r.timestamp)+sessionOffsetMinutes*60000;
      const day=Math.floor(local/86400000);
      const mins=Math.floor((local-day*86400000)/60000);
      const bucket=day*86400000+Math.floor(mins/targetM)*targetM*60000-sessionOffsetMinutes*60000;
      const key=new Date(bucket).toISOString(),prev=result.at(-1);
      if(prev&&prev.timestamp===key){
        prev.high=Math.max(prev.high,r.high);prev.low=Math.min(prev.low,r.low);prev.close=r.close;
        prev.volume=prev.volume===null||r.volume===null?null:prev.volume+r.volume;prev.count++;
      }else result.push({...r,timestamp:key,count:1});
    }
    // Do not treat an incomplete bucket as an observed closed target bar.
    return result.filter(x=>x.count===targetM/sourceM).map(({count,...rest})=>rest);
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
  const api={aggregate,multiTimeframe,breakout,verified};
  root.TradeMindScannerExtensions=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
