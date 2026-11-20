/* Experimental news-to-forecast bridge. Read-only; no order endpoints. */
(function(){'use strict';
  if(!window.TradeMindNews||typeof drawForecast!=='function')return;
  const supported=new Set(['stocks:RELIANCE','stocks:HDFCBANK','stocks:TCS',
    'crypto:BTC/USDT','crypto:ETH/USDT','crypto:SOL/USDT',
    'mcx:GOLD','mcx:SILVER','mcx:CRUDEOIL',
    'forex:USD/INR','forex:EUR/USD','forex:GBP/USD']);
  const results=new Map();
  let activeNews=null,requestId=0;
  const key=()=>activeType+':'+markets[activeType][activeIndex].s;
  const $news=id=>document.getElementById(id);
  function eligible(){
    if(!activeNews||activeNews.key!==key()||activeNews.analysis.status!=='ok'||!providerMeta||!importedRows)return false;
    const age=(Date.now()-Date.parse(providerMeta.asOf))/36e5;
    const bound=providerMeta.mode==='live'?24:96;
    if(!Number.isFinite(age)||age<0||age>bound)return false;
    return Array.isArray(importedRows)&&importedRows.length>=35&&importedRows.every(x=>x&&Number.isFinite(x.close)&&x.close>0);
  }
  const originalForecast=drawForecast;
  drawForecast=function(prices,score,vol){
    const news=eligible()?activeNews.analysis:null;
    const adjusted=clamp(score+(news?news.scoreDelta:0),0,100);
    const wide=vol*(news?news.uncertaintyFactor:1);
    originalForecast(prices,adjusted,wide);
    if(news){
      const note=$news('riskNote');
      note.textContent=`Experimental news overlay: ${news.direction.toLowerCase()} headline context changes evidence score by ${news.scoreDelta>0?'+':''}${news.scoreDelta} points and widens risk band by ${Math.round((news.uncertaintyFactor-1)*100)}%. Headline keywords do not establish causality or predictive accuracy; forecasts are scenarios, not trade instructions.`;
    }
    updateEffect();
  };
  const originalSaveForecast=saveForecast;
  saveForecast=function(){
    originalSaveForecast();
    if(!eligible()||!forecastRecords.length)return;
    const last=forecastRecords[0],news=activeNews.analysis,recent=currentPrices.slice(-30);
    const slope=(recent.at(-1)-recent[0])/(recent.length-1);
    const scale=Math.abs(slope||last.entry*.002);
    last.target+=(news.scoreDelta/50)*scale*last.horizon;
    last.probUp=clamp(last.probUp+news.scoreDelta/200,.15,.85);
    last.newsOverlay={scoreDelta:news.scoreDelta,uncertaintyFactor:news.uncertaintyFactor,
      source:activeNews.source,asOf:activeNews.asOf,experimental:true};
    localStorage.setItem('trademind-forecasts',JSON.stringify(forecastRecords));
    renderCalibration();
  };
  function mount(){
    if($news('newsPanel'))return;
    const panel=document.createElement('section');
    panel.id='newsPanel';panel.className='panel';
    panel.innerHTML='<div class="panel-head"><div><h3>News-aware prediction · experimental</h3><p>Recent public headlines and possible event risk; no broker trading</p></div><button id="newsRefresh" type="button">Refresh news</button></div>'+
      '<div style="display:flex;gap:1.2rem;flex-wrap:wrap;margin:10px 0"><div><small>News direction</small><div id="newsDirection">Not loaded</div></div><div><small>Headline effect</small><div id="newsEffect">Not applied</div></div></div>'+
      '<p id="newsStatus" class="risk-note">Loading public headlines…</p><div id="newsLinks" style="display:grid;gap:8px"></div>'+
      '<p class="risk-note">GDELT is a headline-discovery service, not verified exchange disclosures. Impact labels use experimental keywords and are not calibrated price-movement predictions. Never infer that no articles means no material news.</p>';
    const forecast=document.querySelector('.forecast-panel');
    if(forecast)forecast.after(panel);
    $news('newsRefresh').addEventListener('click',()=>loadNews(true));
  }
  function updateEffect(){
    if(!$news('newsEffect'))return;
    if(!activeNews||activeNews.key!==key()){
      $news('newsEffect').textContent='No news analysis';return;
    }
    const n=activeNews.analysis;
    $news('newsDirection').textContent=n.direction+' · '+n.items.length+' recent headline(s)';
    if(n.status!=='ok'){$news('newsEffect').textContent='Unavailable';return;}
    $news('newsEffect').textContent=eligible()
      ?`${n.scoreDelta>=0?'+':''}${n.scoreDelta} score points · ${Math.round((n.uncertaintyFactor-1)*100)}% wider risk band`
      :'Indicative only · real, fresh OHLCV required';
  }
  function show(){
    if(!$news('newsPanel'))return;
    const list=$news('newsLinks');list.replaceChildren();
    if(!activeNews||activeNews.key!==key()){
      $news('newsDirection').textContent='Unavailable';
      $news('newsStatus').textContent='No result for the current instrument';
      updateEffect();return;
    }
    const n=activeNews.analysis;
    $news('newsStatus').textContent=`${activeNews.source||'Public headlines'} · checked ${new Date(activeNews.asOf||Date.now()).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST · ${n.status==='ok'?n.classified+' event-classified of '+n.total+' headlines':n.reasons[0]}`;
    $news('newsDirection').textContent=n.direction+' · '+n.items.length+' headline(s)';
    for(const item of n.items.slice(0,8)){
      const row=document.createElement('div'),link=document.createElement('a'),small=document.createElement('small');
      link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=item.title;
      small.textContent=` · ${item.domain} · ${new Date(item.publishedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST`;
      row.append(link,small);list.append(row);
    }
    updateEffect();
  }
  async function loadNews(force=false){
    mount();
    const id=++requestId,k=key();
    if(!supported.has(k)){
      activeNews={key:k,analysis:TradeMindNews.analyze(null),source:'Unsupported instrument',asOf:new Date().toISOString()};show();return;
    }
    const cached=results.get(k);
    if(!force&&cached&&Date.now()-cached.fetchedAt<600000){
      activeNews=cached;show();calculate(currentPrices);return;
    }
    $news('newsStatus').textContent='Checking recent headlines (not real-time exchange news)…';
    try{
      const [type,symbol]=[activeType,markets[activeType][activeIndex].s];
      const q=new URLSearchParams({type,symbol});
      const response=await fetch('/api/news-impact?'+q,{headers:{accept:'application/json'}});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'Provider unavailable');
      const analysis=TradeMindNews.analyze(data.items);
      const state={key:k,analysis,source:data.source,asOf:data.asOf,fetchedAt:Date.now()};
      results.set(k,state);
      if(id!==requestId||key()!==k)return;
      activeNews=state;show();calculate(currentPrices);
    }catch(error){
      if(id!==requestId||key()!==k)return;
      activeNews={key:k,analysis:TradeMindNews.analyze(null),source:'Public news unavailable',asOf:new Date().toISOString()};
      show();$news('newsStatus').textContent='News feed unavailable: '+String(error.message||error).slice(0,120)+'. Forecast remains price-only.';
      calculate(currentPrices);
    }
  }
  mount();setTimeout(()=>loadNews(false),0);
  $news('assetSelect')?.addEventListener('change',()=>{activeNews=null;setTimeout(()=>loadNews(false),0)});
  $news('marketTabs')?.addEventListener('click',event=>{
    if(event.target.closest('[data-type]')){activeNews=null;setTimeout(()=>loadNews(false),0);}
  });
})();
