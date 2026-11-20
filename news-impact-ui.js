/* Side-by-side normal/conditional forecasts. Nothing in this module changes the base forecast or saved forecasts. */
(function(){'use strict';
  if(!window.TradeMindNews||typeof drawForecast!=='function')return;
  const supported=new Set(['stocks:RELIANCE','stocks:HDFCBANK','stocks:TCS',
    'crypto:BTC/USDT','crypto:ETH/USDT','crypto:SOL/USDT',
    'mcx:GOLD','mcx:SILVER','mcx:CRUDEOIL',
    'forex:USD/INR','forex:EUR/USD','forex:GBP/USD']);
  const results=new Map();
  let activeNews=null,requestId=0,lastBase=null,lastError='';
  const key=()=>activeType+':'+markets[activeType][activeIndex].s;
  const el=id=>document.getElementById(id);
  function eligible(){
    if(!activeNews||activeNews.key!==key()||activeNews.analysis.status!=='ok'||!providerMeta||!importedRows)return false;
    const age=(Date.now()-Date.parse(providerMeta.asOf))/36e5;
    const maxAge=providerMeta.mode==='live'?24:96;
    return Number.isFinite(age)&&age>=0&&age<=maxAge&&Array.isArray(importedRows)
      &&importedRows.length>=35&&importedRows.every(x=>x&&Number.isFinite(x.close)&&x.close>0);
  }
  function mount(){
    if(el('newsPanel'))return;
    const baseline=document.querySelector('.forecast-panel');
    if(!baseline)return;
    const compare=document.createElement('div');
    compare.id='forecastComparison';compare.className='forecast-comparison';
    baseline.parentNode.insertBefore(compare,baseline);
    compare.append(baseline);
    const panel=document.createElement('section');
    panel.id='newsPanel';panel.className='panel news-conditional-panel';
    panel.setAttribute('aria-label','Separate news-conditional forecast');
    panel.innerHTML='<div class="panel-head"><div><h3>News-conditional scenario</h3>'+
      '<p>Possible alternative if a relevant event affects sentiment — NOT a causal forecast</p></div>'+
      '<button id="newsRefresh" type="button">Refresh news</button></div>'+
      '<div class="news-stat-grid"><div><small>Headline context</small><strong id="newsDirection">Not loaded</strong></div>'+
      '<div><small>Estimated conditional possibility</small><strong id="newsEffect">Uncalibrated</strong></div></div>'+
      '<div class="news-condition" id="newsCondition">News context unavailable.</div>'+
      '<div class="news-scenarios" id="newsScenarios" aria-live="polite"></div>'+
      '<p id="newsStatus" class="risk-note" role="status">Checking public headlines…</p>'+
      '<details class="news-evidence"><summary>News sources and possible context</summary><div id="newsLinks"></div></details>'+
      '<p class="risk-note">This scenario is separate from the normal forecast. Headline keywords cannot prove that news will move prices. No numeric event probability is shown before out-of-sample calibration. No trades are placed.</p>';
    compare.append(panel);
    el('newsRefresh').addEventListener('click',()=>loadNews(true));
  }
  function renderConditional(){
    if(!el('newsPanel'))return;
    el('newsScenarios').replaceChildren();
    if(!activeNews||activeNews.key!==key()){
      el('newsDirection').textContent='Not loaded';
      el('newsEffect').textContent='Unknown';
      el('newsCondition').textContent='The ordinary forecast remains available while news is loading.';
      return;
    }
    const n=activeNews.analysis;
    el('newsDirection').textContent=n.direction+' · '+n.items.length+' recent headlines';
    el('newsEffect').textContent=n.status==='ok'?'Possible / uncalibrated':'Unavailable';
    if(n.status!=='ok'){
      el('newsCondition').textContent='No usable recent news event classified. This does not establish that no relevant news exists.';
      return;
    }
    if(!eligible()||!lastBase){
      el('newsCondition').textContent='Headline-based context only. A separate numeric news scenario needs fresh, verified OHLCV price data; normal/demo predictions are unchanged.';
      return;
    }
    const result=TradeMindNews.conditionalScenario({
      prices:lastBase.prices,score:lastBase.score,vol:lastBase.vol,
      horizon:Number(el('horizon').value),analysis:n
    });
    if(!result){
      el('newsCondition').textContent='Insufficient verified data to calculate the hypothetical scenario.';
      return;
    }
    el('newsCondition').textContent='If the classified headline context becomes materially relevant, a DIFFERENT path may be possible. The values below are stress scenarios, not a claim that news will cause a particular change.';
    for(const [label,value] of [['Possible upper case',result.upside],['Possible middle case',result.middle],['Possible lower case',result.downside]]){
      const line=document.createElement('div'),name=document.createElement('span'),amount=document.createElement('strong'),move=document.createElement('small');
      name.textContent=label;amount.textContent=fmt(value);
      const percent=(value/result.entry-1)*100;
      move.textContent=(percent>=0?'+':'')+percent.toFixed(2)+'% scenario (not a prediction of news impact)';
      line.className='news-scenario-row';line.append(name,amount,move);el('newsScenarios').append(line);
    }
    const footer=document.createElement('small');
    footer.textContent='Experimental contextual adjustment: '+(n.scoreDelta>=0?'+':'')+n.scoreDelta+
      ' evidence points; hypothetical range widened '+Math.round((n.uncertaintyFactor-1)*100)+
      '%. These are model settings, not empirically measured impact or probabilities.';
    el('newsScenarios').append(footer);
  }
  function show(){
    mount();if(!el('newsPanel'))return;
    const list=el('newsLinks');list.replaceChildren();
    if(!activeNews||activeNews.key!==key()){
      el('newsStatus').textContent='News fetch pending.';
      renderConditional();return;
    }
    const n=activeNews.analysis;
    const when=Date.parse(activeNews.asOf||'');
    const checked=Number.isFinite(when)?new Date(when).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'unknown';
    el('newsStatus').textContent=(lastError?lastError+' · ':'')+
      (activeNews.source||'Public headlines')+' · checked '+checked+' IST · '+
      (n.status==='ok'?n.classified+' event-classified of '+n.total+' headlines':n.reasons[0]);
    for(const item of n.items.slice(0,8)){
      const row=document.createElement('div'),link=document.createElement('a'),small=document.createElement('small');
      link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';
      link.textContent=item.title;
      small.textContent=' · '+item.domain+' · '+
        new Date(item.publishedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST';
      row.append(link,small);list.append(row);
    }
    renderConditional();
  }
  async function loadNews(force=false){
    mount();
    const id=++requestId,k=key();
    lastError='';
    if(!supported.has(k)){
      activeNews={key:k,analysis:TradeMindNews.analyze(null),source:'Unavailable for this symbol',asOf:new Date().toISOString()};
      show();return;
    }
    const cached=results.get(k);
    if(!force&&cached&&Date.now()-cached.fetchedAt<600000){
      activeNews=cached;show();return;
    }
    el('newsStatus').textContent='Checking recent public headlines (not exchange disclosures)…';
    try{
      const [type,symbol]=[activeType,markets[activeType][activeIndex].s];
      const q=new URLSearchParams({type,symbol});
      const response=await fetch('/api/news-impact?'+q,{headers:{accept:'application/json'}});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'Provider unavailable');
      const state={key:k,analysis:TradeMindNews.analyze(data.items),source:data.source,
        asOf:data.asOf,fetchedAt:Date.now()};
      results.set(k,state);
      if(id!==requestId||key()!==k)return;
      activeNews=state;show();
    }catch(error){
      if(id!==requestId||key()!==k)return;
      lastError='Feed unavailable: '+String(error.message||error).slice(0,100);
      activeNews={key:k,analysis:TradeMindNews.analyze(null),source:'News unavailable',
        asOf:new Date().toISOString()};
      show();
    }
  }
  mount();
  // Re-rendering the separate conditional view must NEVER change arguments or output of base drawForecast.
  const baseDrawForecast=drawForecast;
  drawForecast=function(prices,score,vol){
    lastBase={prices:prices.slice(),score,vol};
    const returned=baseDrawForecast(prices,score,vol);
    renderConditional();
    return returned;
  };
  setTimeout(()=>loadNews(false),0);
  el('assetSelect')?.addEventListener('change',()=>{activeNews=null;show();setTimeout(()=>loadNews(false),0)});
  el('marketTabs')?.addEventListener('click',event=>{
    if(event.target.closest('[data-type]')){activeNews=null;show();setTimeout(()=>loadNews(false),0);}
  });
})();
