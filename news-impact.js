/* TradeMind experimental news-event risk overlay. Headline heuristics are NOT calibrated probabilities. */
(function(root){'use strict';
  const positive=[
    /\b(beats? (?:analyst )?estimates?|earnings beat|profit (?:rises?|jumps?|surges?|increases?)|record (?:profit|revenue)|raises? guidance|upgrades? (?:rating|outlook)|secures? (?:contract|order)|wins? (?:contract|order)|share buyback|dividend hike|receives? approval|rate cuts?)\b/i
  ];
  const negative=[
    /\b(misses? (?:analyst )?estimates?|earnings miss|profit (?:falls?|drops?|declines?|slumps?)|cuts? guidance|downgrades? (?:rating|outlook)|regulatory probe|investigation|fraud|accounting irregularit|bankrupt|debt default|major outage|faces? (?:fine|penalty)|rate hikes?|revenue (?:falls?|declines?)|loss widens?)\b/i
  ];
  const highImpact=/\b(earnings|quarterly results?|profit|guidance|merger|acquisition|fraud|investigation|regulatory|rbi|interest rate|rate (?:hike|cut)|sanction|contract|order|buyback|default|bankrupt|outage|dividend)\b/i;
  function classify(title){
    if(typeof title!=='string')return {direction:0,highImpact:false};
    const good=positive.some(re=>re.test(title)),bad=negative.some(re=>re.test(title));
    return {direction:good===bad?0:(good?1:-1),highImpact:highImpact.test(title)};
  }
  function analyze(articles,{now=Date.now(),maxAgeHours=72}={}){
    if(!Array.isArray(articles))return {status:'unavailable',direction:'UNKNOWN',scoreDelta:0,uncertaintyFactor:1,items:[],reasons:['No verified news feed response']};
    const valid=[],seen=new Set();
    for(const item of articles.slice(0,50)){
      if(!item||typeof item.title!=='string'||typeof item.url!=='string'||!/^https:\/\//i.test(item.url))continue;
      const when=Date.parse(item.publishedAt||item.seendate||item.date);
      const ageHours=(now-when)/36e5;
      if(!Number.isFinite(ageHours)||ageHours<0||ageHours>maxAgeHours)continue;
      const key=item.url.replace(/[?#].*$/,'').toLowerCase();
      if(seen.has(key))continue;seen.add(key);
      const x=classify(item.title);
      valid.push({title:item.title.slice(0,220),url:item.url,publishedAt:new Date(when).toISOString(),domain:String(item.domain||'').slice(0,80),ageHours,direction:x.direction,highImpact:x.highImpact});
    }
    if(!valid.length)return {status:'no_recent_articles',direction:'UNKNOWN',scoreDelta:0,uncertaintyFactor:1,items:[],reasons:['No usable recent headlines; this does not mean no market-moving news exists']};
    const labeled=valid.filter(x=>x.direction!==0),highCount=valid.filter(x=>x.highImpact).length;
    let weighted=0,weightTotal=0;
    for(const x of labeled){
      const w=(1-.5*x.ageHours/maxAgeHours)*(x.highImpact?1.5:1);
      weighted+=x.direction*w;weightTotal+=w;
    }
    const strength=weightTotal?weighted/Math.max(2,weightTotal):0;
    const scoreDelta=Number((Math.max(-5,Math.min(5,strength*5))).toFixed(2));
    const direction=labeled.length===0?'UNCLASSIFIED':Math.abs(scoreDelta)<1?'MIXED':scoreDelta>0?'POSITIVE':'NEGATIVE';
    const uncertaintyFactor=Number((1+Math.min(.3,highCount*.06)).toFixed(2));
    return {status:'ok',direction,scoreDelta,uncertaintyFactor,items:valid.slice(0,12),
      classified:labeled.length,total:valid.length,highImpactCount:highCount,
      reasons:['Headlines classified by simple event phrases, not full articles','Effect limited to ±5 evidence-score points; risk band may widen']};
  }

  // Separate, explicitly hypothetical news-conditional branch, never used to update base results.
  // A headline classification is NOT the probability or magnitude of any real price reaction.
  function conditionalScenario({prices,score,vol,horizon,analysis}={}){
    if(!Array.isArray(prices)||prices.length<30||prices.some(v=>!Number.isFinite(v)||v<=0)
      ||!Number.isFinite(score)||!Number.isFinite(vol)||vol<0
      ||!Number.isInteger(horizon)||horizon<1||horizon>100
      ||!analysis||analysis.status!=='ok')return null;
    const recent=prices.slice(-30),slope=(recent.at(-1)-recent[0])/(recent.length-1);
    const entry=prices.at(-1);
    const bounded=Number.isFinite(analysis.scoreDelta)?Math.max(-5,Math.min(5,analysis.scoreDelta)):0;
    const adjusted=Math.max(0,Math.min(100,score+bounded));
    const bias=(adjusted-50)/50*Math.abs(slope||entry*.002);
    const middle=entry+(slope+bias)*horizon;
    const uncertainty=entry*(vol/100/Math.sqrt(252))*Math.sqrt(horizon)
      *Math.max(1,Math.min(1.3,Number(analysis.uncertaintyFactor)||1));
    return {entry,middle,upside:middle+uncertainty,downside:Math.max(0,middle-uncertainty),
      conditional:true,probability:null,uncertaintyFactor:analysis.uncertaintyFactor,
      note:'Hypothetical conditional case; headline impact and event probability are not calibrated'};
  }
  const api={classify,analyze,conditionalScenario};
  root.TradeMindNews=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
