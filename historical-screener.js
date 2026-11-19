(()=>{'use strict';
const $=id=>document.getElementById(id),engine=window.TradeMindScreener;
let entries=[],results=[],source='NO DATA',lastScan=0,cryptoIntervalLoaded=null,cryptoLastFetch=0;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function template(){const rows=['symbol,date,open,high,low,close,volume,cap'];for(const [symbol,cap,offset] of [['DEMO-MID','mid',0],['DEMO-SMALL','small',7],['DEMO-LARGE','large',13]])for(let i=0;i<120;i++){const date=new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),close=+(100+offset+i*.35+Math.sin(i/5+offset)*3).toFixed(2),open=+(close+Math.sin(i)*.5).toFixed(2);rows.push([symbol,date,open,+(Math.max(open,close)+1).toFixed(2),+(Math.min(open,close)-1).toFixed(2),close,Math.round(100000+Math.cos(i)*15000),cap].join(','))}return rows.join('\n')}
const csv=template();$('template').href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
function selected(){return [...document.querySelectorAll('[data-indicator]:checked')].map(x=>x.dataset.indicator)}
function recalculate(){const indicators=selected();if(indicators.length<2){results=[];$('status').textContent='Select at least two indicators.';render();renderSignals();return}results=entries.map(entry=>{try{return engine.scan(entry,5,indicators)}catch(error){return{symbol:entry.symbol,cap:entry.cap,bars:entry.rows.length,error:error.message}}});render();renderSignals()}
function render(){const sort=$('sort').value;let list=results.filter(r=>($('cap').value==='all'||r.cap===$('cap').value)&&($('direction').value==='all'||r.direction===$('direction').value));list.sort((a,b)=>(b[sort]??-Infinity)-(a[sort]??-Infinity));$('results').innerHTML=list.length?list.map(r=>r.error?`<tr><td><b>${escape(r.symbol)}</b></td><td colspan="5">${escape(r.error)} (${r.bars||0} bars)</td></tr>`:`<tr><td><b>${escape(r.symbol)}</b><small>${escape(r.cap)} · ${escape(r.asOf)} · ${r.bars} bars</small></td><td><span class="signal ${r.direction}">${r.direction}</span><small>${r.votes}/${r.total} bullish checks</small></td><td>${Object.entries(r.checks).filter(([name])=>selected().includes(name)).map(([name,value])=>`${name.toUpperCase()} ${value>0?'↑':value<0?'↓':'–'}`).join(' · ')}<small>RSI ${r.rsi.toFixed(0)} · MACD ${r.macd.toFixed(2)} · volume ${r.volumeRatio.toFixed(2)}× · momentum ${(r.momentum*100).toFixed(1)}%</small></td><td>${r.samples?`${(r.hitRate*100).toFixed(0)}% (${r.hits}/${r.samples})`:'Insufficient outcomes'}<small>Five-bar historical direction</small></td><td>₹${r.price.toLocaleString('en-IN',{maximumFractionDigits:2})}</td><td>₹${r.support.toFixed(2)} – ₹${r.resistance.toFixed(2)}</td></tr>`).join(''):'<tr><td colspan="6">No symbols match these filters.</td></tr>'}
function renderSignals(){
  const body=$('signalRows'),tag=$('signalSource'),notice=$('signalNotice');
  const broker=source==='BROKER DATA',crypto=source==='PUBLIC CRYPTO',interval=broker?$('liveInterval').value:crypto?(cryptoIntervalLoaded||'unknown'):'unknown';
  const freshness=broker&&entries.length?window.TradeMindScannerExtensions.candleFreshness(entries[0].rows.at(-1).date,interval):null;
  const recent=broker&&freshness&&freshness.fresh;
  tag.textContent=broker?(recent?'RECENT BROKER CANDLES · ':'HISTORICAL / STALE BROKER · ')+interval:crypto?'PUBLIC CRYPTO CANDLES · '+interval:source==='NO DATA'?'NO LIVE SIGNAL':source+' · NOT LIVE';
  notice.textContent=broker?(freshness.reason+'. Read-only broker snapshot; possible exchange delay. Most recent candle excluded. No orders or AI probability claims.'):crypto?'CoinDCX public historical candles. Most recent returned bar excluded because close completion is unverified; exchange delivery may be delayed. No validated AI probability or orders.':'Demo / imported CSV signals are NOT LIVE. Rule-based technical evidence only; no orders or calibrated AI prediction.';
  if(!entries.length){body.innerHTML='<tr><td colspan="6">Load candles to see research signals.</td></tr>';return}
  const chosen=selected();
  if(chosen.length<2){body.innerHTML='<tr><td colspan="6">Select at least two indicators.</td></tr>';return}
  body.innerHTML=entries.map(entry=>{
    try{
      const rows=broker?entry.rows.slice(0,-1):entry.rows;
      if(rows.length<35)throw Error('Insufficient closed candles');
      const outcome=engine.scan({...entry,rows},5,chosen);
      if(outcome.error)throw Error(outcome.error);
      const signal=outcome.direction==='UP'?'BUY':outcome.direction==='DOWN'?'SELL':'WAIT';
      const evidence=outcome.votes+'/'+outcome.total+' bullish checks, RSI '+outcome.rsi.toFixed(1)+', volume '+outcome.volumeRatio.toFixed(2)+'x';
      const planRows=rows.map(r=>({timestamp:r.date,open:r.open,high:r.high,low:r.low,close:r.close,volume:r.volume,complete:true}));
      const plan=window.TradeMindScannerExtensions.planTrade(planRows,outcome.direction);
      const levels=plan.status==='PLAN'?'Entry '+plan.entry.toFixed(2)+' / SL '+plan.stop.toFixed(2)+' / Target '+plan.target.toFixed(2)+' (R:R 1:'+plan.rewardRisk.toFixed(1)+')':'No plan · '+escape(plan.reason);
      return '<tr><td>'+escape(entry.symbol)+'</td><td><strong>'+signal+'</strong><small>Rules only</small></td><td>'+outcome.price.toFixed(2)+'</td><td>'+escape(outcome.asOf)+'</td><td>'+levels+'<small>Illustrative · no orders</small></td><td>'+escape(evidence)+'</td></tr>';
    }catch(error){return '<tr><td>'+escape(entry.symbol)+'</td><td colspan="5">WAIT · '+escape(error.message)+'</td></tr>'}
  }).join('');
}
function load(text,label){try{entries=engine.parse(text);source=label;recalculate();$('sourceTag').textContent=label;$('status').textContent=`Loaded ${entries.length} symbols; ${results.filter(x=>!x.error).length} have enough history. ${label==='DEMO DATA'?'All example prices are synthetic.':'CSV stays in this browser session.'}`;if(label!=='BROKER DATA')$('liveBadge').textContent='NOT CONNECTED';renderSignals()}catch(error){$('status').textContent=error.message;entries=[];results=[];render();renderSignals()}}
// Multi-timeframe public crypto research: fetch each interval independently.
// No inferred candles, no synthetic signals, no trading execution.
async function scanCryptoMtf(){
  const button=$('runCryptoMtf'),status=$('cryptoMtfStatus'),output=$('cryptoMtfResults');
  const symbol=$('cryptoSymbol').value,intervalLabels=[['15min','15m'],['60min','1h'],['daily','1d']];
  button.disabled=true;
  status.textContent='Fetching independently sourced 15m, 1h and daily public candles…';
  const checked=[];
  try{
    // Sequential requests avoid unnecessarily stressing unauthenticated upstream endpoints.
    for(const [interval,timeframe] of intervalLabels){
      const params=new URLSearchParams({symbol,type:'crypto',mode:'live',interval});
      const response=await fetch('/api/market-data?'+params,{cache:'no-store',headers:{accept:'application/json'}});
      const data=await response.json();
      if(!response.ok||data.source!=='CoinDCX public spot candles'||!Array.isArray(data.rows))
        throw Error(interval+': '+String(data.error||'CoinDCX candle data unavailable'));
      if(data.rows.length<27)throw Error(interval+': insufficient history');
      const rows=data.rows.map(r=>({
        timestamp:String(r.date||''),open:r.open,high:r.high,low:r.low,close:r.close,
        volume:r.volume,complete:true
      }));
      // Validate the entire received series, including the possibly forming last bar.
      const verified=window.TradeMindScannerExtensions.verified(rows);
      const latest=verified.at(-1).timestamp;
      const lastAge=Date.now()-Date.parse(latest);
      const maxAge={'15min':2*3600000,'60min':6*3600000,'daily':72*3600000}[interval];
      if(lastAge < -3600000 ||lastAge>maxAge)
        throw Error(interval+': source candles are stale or timestamp is in the future');
      const closed=verified.slice(0,-1);
      if(closed.length<26)throw Error(interval+': fewer than 26 confirmed candidate bars');
      checked.push({timeframe,rows:closed});
    }
    if(symbol!==$('cryptoSymbol').value)throw Error('Selected pair changed during request');
    const result=window.TradeMindScannerExtensions.multiTimeframe(checked);
    const labels=result.timeframes.map(x=>x.direction);
    const combined=result.direction==='UP'?'BUY':result.direction==='DOWN'?'SELL':'WAIT';
    // Only write predetermined signal labels / numeric data from validated scanner.
    output.innerHTML='<tr><td>'+escape(symbol)+'</td>'
      +labels.map(x=>'<td>'+escape(x)+'</td>').join('')
      +'<td><strong>'+combined+'</strong></td><td>'+result.up+'/'+result.total+' upward, '
      +result.down+'/'+result.total+' downward; all 3 must agree</td></tr>';
    status.textContent=symbol+' · three independently fetched source intervals · '+combined
      +' (rule-based only). Last-bar exclusion used. No execution or calibrated probability.';
  }catch(error){
    output.innerHTML='<tr><td>'+escape(symbol)+'</td><td colspan="4">WAIT</td><td>'+escape(String(error.message||error))+'</td></tr>';
    status.textContent='Cannot confirm all timeframes: '+String(error.message||error)+'. Combined signal set to WAIT.';
  }finally{button.disabled=false}
}
// Public read-only crypto research. Discard last upstream bar until completion can be established.
async function scanCrypto(){
  const button=$('cryptoScan'),status=$('cryptoStatus'),badge=$('cryptoBadge');
  if(Date.now()-cryptoLastFetch<30000){status.textContent='Wait 30 seconds between public crypto scans.';return}
  const symbol=$('cryptoSymbol').value,interval=$('cryptoInterval').value;
  button.disabled=true;status.textContent='Fetching public CoinDCX candles…';badge.textContent='LOADING';
  try{
    const params=new URLSearchParams({symbol,type:'crypto',mode:'live',interval});
    const response=await fetch('/api/market-data?'+params,{headers:{accept:'application/json'},cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw Error(String(data.error||'Public candles unavailable'));
    if(data.source!=='CoinDCX public spot candles'||!Array.isArray(data.rows)||data.rows.length<36)throw Error('No verified public candle history (36 bars required)');
    const rows=data.rows.map(r=>({date:String(r.date||''),open:Number(r.open),high:Number(r.high),low:Number(r.low),close:Number(r.close),volume:r.volume===null?null:Number(r.volume)}));
    let last=-Infinity;
    for(const bar of rows){
      const ts=Date.parse(bar.date);
      if(!Number.isFinite(ts)||ts<=last||[bar.open,bar.high,bar.low,bar.close].some(x=>!Number.isFinite(x)||x<=0)
        ||bar.low>Math.min(bar.open,bar.close)||bar.high<Math.max(bar.open,bar.close)||bar.volume===null
        ||!Number.isFinite(bar.volume)||bar.volume<0)throw Error('Malformed OHLCV from public source');
      last=ts;
    }
    // The most recent returned exchange candle might be forming, so exclude it.
    const closed=rows.slice(0,-1);
    if(closed.length<35)throw Error('Not enough safely excluded candles');
    entries=[{symbol,cap:'crypto',rows:closed}];source='PUBLIC CRYPTO';cryptoIntervalLoaded=interval;
    cryptoLastFetch=Date.now();
    recalculate();
    $('sourceTag').textContent='PUBLIC CRYPTO · '+interval;
    $('liveBadge').textContent='NOT CONNECTED';
    badge.textContent='PUBLIC DATA';
    status.textContent=symbol+' · '+interval+' · '+closed.length+' candles (latest bar excluded) · last used '+closed.at(-1).date+'. Provider may be delayed. No trading API or calibrated prediction.';
  }catch(error){
    badge.textContent='UNAVAILABLE';status.textContent='CoinDCX read-only scan unavailable: '+String(error.message||error);
    if(source==='PUBLIC CRYPTO'){source='STALE CRYPTO DATA';renderSignals()}
  }finally{button.disabled=false}
}
function watchlist(value){const items=value.split(',').map(x=>x.trim()).filter(Boolean);if(!items.length||items.length>5)throw Error('Enter 1–5 NSE stocks.');return items.map(item=>{const match=item.toUpperCase().match(/^([A-Z0-9._-]{1,24}):([A-Z0-9]{1,16})$/);if(!match)throw Error('Use SYMBOL:BREEZE_CODE, for example RELIANCE:RELIND.');return{symbol:match[1],code:match[2]}})}
async function scanLive(){if(Date.now()-lastScan<30000){$('liveStatus').textContent='Wait 30 seconds between broker scans to limit API calls.';return}let stocks;try{stocks=watchlist($('liveSymbols').value);if(selected().length<2)throw Error('Select at least two indicators.')}catch(error){$('liveStatus').textContent=error.message;return}
lastScan=Date.now();$('liveScan').disabled=true;$('liveBadge').textContent='LOADING';$('liveStatus').textContent=`Fetching ${stocks.length} stocks from the configured broker…`;const access=$('marketAccess').value.trim();if(!access){$('liveStatus').textContent='Enter the TradeMind access code before scanning broker data.';$('liveScan').disabled=false;$('liveBadge').textContent='NOT CONNECTED';lastScan=0;return}const interval=$('liveInterval').value,mode=['daily','weekly','monthly'].includes(interval)?'eod':'live',loaded=[],failures=[];
try{for(const stock of stocks){const params=new URLSearchParams({symbol:stock.symbol,icici_code:stock.code,type:'stocks',mode,interval});try{const response=await fetch(`/api/market-data?${params}`,{headers:{accept:'application/json','x-market-access':access},cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);if(!Array.isArray(data.rows)||data.rows.length<35)throw Error('Too few candles');const rows=data.rows.map(r=>({date:String(r.date),open:Number(r.open),high:Number(r.high),low:Number(r.low),close:Number(r.close),volume:Number(r.volume)}));if(rows.some(r=>!Number.isFinite(r.close)||r.close<=0))throw Error('Invalid broker candles');loaded.push({symbol:stock.symbol,cap:'stock',rows});$('liveStatus').textContent=`Fetched ${loaded.length}/${stocks.length} · ${stock.symbol} as of ${data.asOf||rows.at(-1).date} · ${data.delay||'provider delay unknown'}`}catch(error){failures.push(`${stock.symbol}: ${error.message}`)}}
if(!loaded.length)throw Error(failures.join('; ')||'No broker data');entries=loaded;source='BROKER DATA';recalculate();renderSignals();$('sourceTag').textContent=`BROKER DATA · ${interval}`;$('liveBadge').textContent=failures.length?'PARTIAL BROKER DATA':'BROKER DATA';$('status').textContent=`${loaded.length} stock(s) loaded from broker candles; ${results.filter(x=>!x.error).length} have enough history.`;$('liveStatus').textContent=`${interval} · refreshed ${new Date().toLocaleTimeString()} · last candle ${loaded.map(x=>`${x.symbol} ${x.rows.at(-1).date}`).join(', ')}. ${failures.length?`Unavailable: ${failures.join('; ')}`:'Broker or exchange delay may apply.'}`
}catch(error){if(source==='BROKER DATA'){source='STALE BROKER DATA';renderSignals()}$('liveBadge').textContent='NOT CONNECTED';$('liveStatus').textContent=`Live scan unavailable: ${error.message}. Previous results are not live. Demo and CSV remain available.`}finally{$('liveScan').disabled=false}}
$('cryptoScan').onclick=scanCrypto;
$('runCryptoMtf').onclick=scanCryptoMtf;
$('csvFile').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;if(file.size>15_000_000){$('status').textContent='CSV exceeds 15 MB';return}load(await file.text(),'IMPORTED CSV')});$('demo').onclick=()=>load(csv,'DEMO DATA');$('clear').onclick=()=>{entries=[];results=[];source='NO DATA';renderSignals();$('csvFile').value='';$('sourceTag').textContent=source;$('liveBadge').textContent='NOT CONNECTED';$('status').textContent='Cleared. Your imported CSV is processed in this browser.';render()};$('liveScan').onclick=scanLive;['cap','direction','sort'].forEach(id=>$(id).onchange=render);document.querySelectorAll('[data-indicator]').forEach(x=>x.onchange=recalculate);
window.TradeMindResearchData=()=>({entries,source});

// Optional read-only research module: single-timeframe trend and closed-candle breakout.
$('runExtended').addEventListener('click',()=>{
  const output=$('extendedResults'),status=$('extendedStatus');
  if(!entries.length){status.textContent='Load CSV/demo or broker data first.';output.innerHTML='<tr><td colspan="5">No data loaded.</td></tr>';return}
  const extension=window.TradeMindScannerExtensions;
  if(!extension){status.textContent='Scanner extension unavailable.';return}
  const interval=source==='BROKER DATA'?$('liveInterval').value:source==='PUBLIC CRYPTO'?cryptoIntervalLoaded:'CSV (interval unverified)';
  const mapped={'1min':'1m','5min':'5m','15min':'15m','30min':'30m','60min':'1h','daily':'1d','weekly':'1w','monthly':'1mo'};
  const timeframe=(source==='BROKER DATA'||source==='PUBLIC CRYPTO')?mapped[interval]:(entries.every(e=>e.rows.every(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)))?'1d':null);
  let complete=0,failures=0;
  output.innerHTML=entries.map(entry=>{
    try{
      const rows=entry.rows.map(r=>({timestamp:r.date,open:r.open,high:r.high,low:r.low,close:r.close,volume:r.volume,complete:true}));
      // Broker response has no explicit bar-completion flag: drop the latest bar.
      if(source==='BROKER DATA')rows.pop(); // CoinDCX data already excludes its potentially forming last bar.
      const trend=timeframe?extension.multiTimeframe([{timeframe,rows}]).timeframes[0]:{direction:'WAIT',reason:'Unknown CSV interval'};
      const result=extension.breakout(rows);
      complete++;
      const ratio=result.volumeRatio===null?'unavailable':result.volumeRatio.toFixed(2)+'x';
      return '<tr><td><b>'+escape(entry.symbol)+'</b></td><td>'+escape(trend.direction)+'<small>One input series only</small></td><td>'+escape(result.candidate||'WAIT')+'<small>Confirmed: '+escape(result.direction)+'</small></td><td>'+escape(ratio)+'</td><td>'+ (Number.isFinite(result.support)?result.support.toFixed(2):'—')+' / '+(Number.isFinite(result.resistance)?result.resistance.toFixed(2):'—')+'</td></tr>';
    }catch(error){failures++;return '<tr><td>'+escape(entry.symbol)+'</td><td colspan="4">'+escape(error.message)+'</td></tr>'}
  }).join('');
  status.textContent=complete+' analyzed, '+failures+' unavailable. Input: '+interval+'. '+(!['BROKER DATA','PUBLIC CRYPTO'].includes(source)?'Date-only CSV is assumed daily; verify interval. ':'')+'Research-only rule signals; no trained prediction or broker orders.';
});
})();
