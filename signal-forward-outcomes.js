/* TradeMind forward outcome reconciliation, research-only.
 * Evaluates an existing observation using subsequently available closed candles.
 * Does not execute, infer fills, or independently authenticate provider data. */
(function(root){'use strict';
  function evaluate(observation,candles,{horizonBars=5,feeBps=10,market=null,timeframe=null}={}){
    if(!observation||typeof observation!=='object'||!Array.isArray(candles))
      throw Error('Observation and candle history required');
    if(!Number.isInteger(horizonBars)||horizonBars<1||horizonBars>100||
      !Number.isFinite(feeBps)||feeBps<0||feeBps>500)throw Error('Invalid outcome settings');
    if(!['BUY','SELL','WAIT'].includes(observation.signal))throw Error('Invalid observation signal');
    if(!Number.isFinite(observation.candle_close)||observation.candle_close<=0)
      throw Error('Invalid observed candle close');
    const eventAt=Date.parse(observation.candle_at);
    if(!Number.isFinite(eventAt))throw Error('Invalid observation time');
    const expected=observation.candle_close;
    let lastTime=-Infinity;
    const rows=candles.map((r,i)=>{
      const time=Date.parse(r.date||r.timestamp);
      if(!Number.isFinite(time)||time<=lastTime)throw Error('Candle timestamps must increase');
      lastTime=time;
      for(const key of ['open','high','low','close']){
        if(typeof r[key]!=='number'||!Number.isFinite(r[key])||r[key]<=0)throw Error('Invalid '+key+' at '+i);
      }
      if(r.low>Math.min(r.open,r.close)||r.high<Math.max(r.open,r.close)||r.high<r.low)
        throw Error('Invalid candle OHLC at '+i);
      return {time,date:new Date(time).toISOString(),open:r.open,high:r.high,low:r.low,close:r.close,complete:r.complete===true};
    });
    const at=rows.findIndex(r=>r.time===eventAt);
    if(at<0)return {status:'PENDING',reason:'Observed candle absent from supplied history'};
    if(Math.abs(rows[at].close-expected)>Math.max(1e-7,expected*1e-7))
      return {status:'PENDING',reason:'Observed close conflicts with candidate provider history'};
    if(!rows[at].complete)return {status:'PENDING',reason:'Observed candle not closed'};
    if(observation.signal==='WAIT')return {status:'SKIPPED',reason:'WAIT is not a directional trade'};
    if(rows.length<=at+horizonBars)return {status:'PENDING',reason:'Forward horizon not yet observed'};
    const forward=rows.slice(at+1,at+horizonBars+1);
    if(forward.some(r=>!r.complete))return {status:'PENDING',reason:'Forward candles are not all closed'};
    // Contiguity and exchange session gaps cannot be inferred from timestamps alone;
    // provider-specific interval/session quality checks remain a deployment prerequisite.
    // Require explicit market and bar interval before scoring. Never let a missing
    // intraday candle count as an elapsed trading bar.
    const spans={'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000};
    const span=spans[timeframe];
    if(!['CRYPTO','NSE','BSE'].includes(market)||!span)
      return {status:'PENDING',reason:'No supported market/interval continuity policy'};
    const checked=[rows[at],...forward];
    for(let i=1;i<checked.length;i++){
      if(checked[i].time-checked[i-1].time!==span)
        return {status:'PENDING',reason:'Missing or noncontiguous source candles'};
    }
    if(market==='NSE'||market==='BSE'){
      // No holiday/auction/session calendar yet: intraday comparisons must
      // remain within a single regular weekday session (09:15–15:30 IST).
      const firstDay=new Date(checked[0].time+330*60000).toISOString().slice(0,10);
      for(const r of checked){
        const local=new Date(r.time+330*60000),minute=local.getUTCHours()*60+local.getUTCMinutes();
        if(local.toISOString().slice(0,10)!==firstDay||local.getUTCDay()===0||local.getUTCDay()===6||
           minute<555||minute>=930)
          return {status:'PENDING',reason:'Session boundary or regular-market calendar not verified'};
      }
    }
    const entry=forward[0],exit=forward.at(-1);
    const grossReturn=observation.signal==='BUY'
      ?exit.close/entry.open-1
      :entry.open/exit.close-1;
    const netReturn=grossReturn-feeBps/10000;
    return {status:'EVALUATED',evaluationVersion:'forward_contiguous_v2',horizonBars,
      entryAt:entry.date,exitAt:exit.date,entryOpen:entry.open,exitClose:exit.close,
      grossReturn,feeBps,netReturn,outcome:netReturn>0?'WIN':netReturn<0?'LOSS':'FLAT',
      verification:'HISTORICAL_PROVIDER_DATA_NOT_AUDITED',executable:false};
  }
  const api={evaluate};root.TradeMindForwardOutcomes=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
