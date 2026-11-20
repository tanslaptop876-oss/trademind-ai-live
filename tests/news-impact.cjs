/* No-network news classification and read-only endpoint tests. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {analyze,classify}=require('../news-impact.js');
const now=Date.parse('2026-11-20T12:00:00Z');
const row=(title,date='2026-11-20T08:00:00Z',url='https://example.com/news/1')=>({title,publishedAt:date,url,domain:'example.com'});
assert.deepEqual(classify('Company profit rises after quarterly earnings'),{direction:1,highImpact:true});
assert.deepEqual(classify('Company profit falls after quarterly earnings'),{direction:-1,highImpact:true});
assert.equal(classify('Company offers a new product').direction,0);
assert.equal(classify('Company profit rises but cuts guidance').direction,0);
let report=analyze([row('Company profit rises'),row('Company profit rises'),row('Company profit falls','2026-11-10T08:00:00Z','https://example.com/news/2')],{now});
assert.equal(report.status,'ok');
assert.equal(report.total,1);
assert.equal(report.direction,'POSITIVE');
assert.ok(report.scoreDelta>0&&report.scoreDelta<=5);
assert.ok(report.uncertaintyFactor>=1);
assert.equal(analyze([], {now}).status,'no_recent_articles');
assert.equal(analyze(null,{now}).status,'unavailable');
assert.equal(analyze([row('Profit rises', '2026-11-21T12:00:00Z')],{now}).status,'no_recent_articles');
assert.equal(analyze([row('Profit rises', '2026-11-20T08:00:00Z','http://example.com')],{now}).status,'no_recent_articles');

const conditional= require('../news-impact.js').conditionalScenario;
const baseline={prices:Array.from({length:50},(_,i)=>100+i*.2),score:58,vol:23,horizon:10};
const before=JSON.stringify(baseline);
const ordinary=(b)=>{
 const last=b.prices.at(-1),last30=b.prices.slice(-30);
 const slope=(last30.at(-1)-last30[0])/(last30.length-1);
 const bias=(b.score-50)/50*Math.abs(slope||last*.002);
 return last+(slope+bias)*b.horizon;
};
const normalBefore=ordinary(baseline);
const scenario=conditionalScenario({...baseline,analysis:report});
assert.ok(scenario&&scenario.conditional);
assert.equal(scenario.probability,null);
assert.ok(scenario.downside<=scenario.middle&&scenario.middle<=scenario.upside);
assert.equal(JSON.stringify(baseline),before,'Original inputs must remain untouched');
assert.equal(ordinary(baseline),normalBefore,'Base forecast must remain unchanged');
assert.equal(conditionalScenario({...baseline,analysis:null}),null);
assert.equal(conditionalScenario({...baseline,prices:[] ,analysis:report}),null);
const ui=fs.readFileSync(require('node:path').join(__dirname,'../news-impact-ui.js'),'utf8');
assert.match(ui,/forecast-comparison/);
assert.match(ui,/baseDrawForecast\(prices,score,vol\)/);
assert.doesNotMatch(ui,/originalSaveForecast|last\.target\s*\+=|last\.probUp\s*=/);
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
assert.match(html,/Normal forecast · price-based/);

(async()=>{
 const file=fs.readFileSync(require('node:path').join(__dirname,'../functions/api/news-impact.js'),'utf8');
 // data URL permits loading an ESM Pages Function without a repository-wide "type: module" setting.
 const {onRequestGet}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(file));
 assert.equal((await onRequestGet({request:new Request('https://example.com/api/news-impact?type=stocks&symbol=INVALID')})).status,400);
 const originalFetch=globalThis.fetch;let requested='';
 try{
  globalThis.fetch=async url=>{
   requested=String(url);
   return new Response(JSON.stringify({articles:[
     {title:'Reliance Industries profit rises',url:'https://example.com/profit',seendate:new Date(Date.now()-3600000).toISOString().slice(0,19).replace(/[-:]/g,'')+'Z'},
     {title:'Missing news URL',url:'http://unsafe.example',seendate:'20261120T100000Z'}]}),
     {status:200,headers:{'content-type':'application/json'}});
  };
  const response=await onRequestGet({request:new Request('https://example.com/api/news-impact?type=stocks&symbol=RELIANCE')});
  assert.equal(response.status,200);
  const obj=await response.json();
  assert.equal(obj.items.length,1);
  assert.equal(obj.items[0].domain,'example.com');
  assert.equal(obj.verified,false);
  assert.ok(requested.startsWith('https://api.gdeltproject.org/api/v2/doc/doc?'));
  assert.equal(new URL(requested).searchParams.get('timespan'),'3d');
  globalThis.fetch=async()=>new Response('Service unavailable',{status:500});
  assert.equal((await onRequestGet({request:new Request('https://example.com/api/news-impact?type=stocks&symbol=RELIANCE')})).status,503);
 }finally{globalThis.fetch=originalFetch;}
 console.log('TradeMind headline and endpoint tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
