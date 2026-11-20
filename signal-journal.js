/* TradeMind signal outcome journal — historical, deterministic, read-only.
   Evaluation only: a signal at bar i is entered at the NEXT bar open and
   exited at the close of the horizon-th future bar; this is not a fill simulation. */
(function(root){'use strict';
  function evaluate(entry,{horizon=5,indicators=['sma','ema','momentum','rsi','macd','volume'],feeBps=0,maxRecords=200}={}){
    if(!entry||!Array.isArray(entry.rows)||typeof entry.symbol!=='string')throw Error('Symbol and OHLCV series required');
    if(!Number.isInteger(horizon)||horizon<1||horizon>100)throw Error('Invalid evaluation horizon');
    if(!Number.isFinite(feeBps)||feeBps<0||feeBps>500)throw Error('Invalid transaction cost assumption');
    if(!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>1000)throw Error('Invalid journal limit');
    const engine=root.TradeMindScreener||(typeof require==='function'?require('./screener-engine.js'):null);
    if(!engine||typeof engine.signal!=='function')throw Error('Scanner engine is not loaded');
    const rows=entry.rows;let previous=-Infinity;
    for(const [i,r] of rows.entries()){
      const timestamp=Date.parse(r.date||r.timestamp);
      if(!Number.isFinite(timestamp)||timestamp<=previous)throw Error('Invalid or non-ascending time at row '+i);
      previous=timestamp;
      if(![r.open,r.high,r.low,r.close,r.volume].every(Number.isFinite)||r.open<=0||r.close<=0||r.high<Math.max(r.open,r.close)||r.low>Math.min(r.open,r.close)||r.low<=0||r.volume<0)
        throw Error('Invalid OHLCV at row '+i);
    }
    const records=[];
    for(let i=29;i+horizon<rows.length;i+=horizon){
      const vote=engine.signal(rows,i,indicators);
      if(vote.direction==='WAIT')continue;
      const entryBar=rows[i+1],exitBar=rows[i+horizon],entryPrice=entryBar.open,exitPrice=exitBar.close;
      const directional=vote.direction==='UP'?exitPrice/entryPrice-1:entryPrice/exitPrice-1;
      // A fixed bps round-trip drag is illustrative; not an exact broker charge.
      const netReturn=directional-feeBps/10000;
      records.push({symbol:entry.symbol,signalAt:rows[i].date||rows[i].timestamp,
        enteredAt:entryBar.date||entryBar.timestamp,exitedAt:exitBar.date||exitBar.timestamp,
        direction:vote.direction,entryPrice,exitPrice,netReturn,
        outcome:netReturn>0?'WIN':netReturn<0?'LOSS':'FLAT',horizon,feeBps,
        executable:false});
    }
    const selectedRecords=records.slice(-maxRecords),wins=selectedRecords.filter(x=>x.outcome==='WIN').length,
      losses=selectedRecords.filter(x=>x.outcome==='LOSS').length,flats=selectedRecords.length-wins-losses;
    return {symbol:entry.symbol,horizon,feeBps,records:selectedRecords,samples:selectedRecords.length,
      wins,losses,flats,winRate:selectedRecords.length?wins/selectedRecords.length:null,
      kind:'historical_rule_outcomes_not_forecast',executable:false};
  }
  const api={evaluate};root.TradeMindSignalJournal=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
