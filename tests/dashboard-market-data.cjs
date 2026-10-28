const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const requestCode=source.slice(source.indexOf('let marketRequestGeneration='),source.indexOf('function calculateIntraday('));
assert.ok(requestCode.includes('async function requestMarketData'));
const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',style:{}});return elements.get(id)};
$('#dataMode').value='live';$('#barInterval').value='15min';$('#dashboardMarketAccess').value=' separate-access ';
const rows=Array.from({length:40},(_,i)=>({date:new Date(Date.UTC(2025,0,i+1)).toISOString(),open:100,high:102,low:99,close:101,volume:1000}));
const payload={source:'FYERS',delay:'Snapshot',currency:'INR',rows,quote:101};
let requests=[],renders=0,toasts=[];
const context={$: $,URLSearchParams,AbortSignal,activeType:'stocks',activeIndex:0,providerMeta:null,importedRows:null,location:{protocol:'https:'},
 fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>payload}},
 render:()=>renders++,setRiskDefaults(){},runMonteCarlo(){},runValidation(){},calculateIntraday(){},toast:message=>toasts.push(message)};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('const markets='),source.indexOf('const fundamentals='))+requestCode,context);
(async()=>{
 for(const [index,symbol] of ['NSE:RELIANCE-EQ','NSE:HDFCBANK-EQ','NSE:TCS-EQ'].entries()){
   context.activeIndex=index;await context.requestMarketData(true);
   const request=requests.at(-1),params=new URL(request.url,'https://test').searchParams;
   assert.equal(params.get('fyers_symbol'),symbol);assert.ok(params.get('icici_code'));assert.ok(params.get('upstox_key'));
   assert.equal(request.options.headers['x-market-access'],'separate-access');assert.equal(request.options.cache,'no-store');assert.ok(!request.url.includes('separate-access'));assert.equal(context.providerMeta,payload);
 }
 const beforeRenders=renders,beforeMeta=context.providerMeta,beforeRows=context.importedRows;
 await context.requestMarketData(false);assert.equal(renders,beforeRenders);assert.equal(context.providerMeta,beforeMeta);assert.equal(context.importedRows,beforeRows);assert.equal($('#connectionStatus').textContent,'Connection verified');
 $('#dashboardMarketAccess').value='';context.activeType='crypto';context.activeIndex=0;await context.requestMarketData(false);
 assert.equal(requests.at(-1).options.headers['x-market-access'],undefined);assert.equal(new URL(requests.at(-1).url,'https://test').searchParams.get('fyers_symbol'),null);
 context.activeType='stocks';context.activeIndex=0;
 for(const result of [{ok:false,json:async()=>({error:'TradeMind access code is required'})},{ok:true,json:async()=>({rows:[]})}]){
   context.fetch=async()=>result;await context.requestMarketData(true);assert.equal(context.importedRows,beforeRows);assert.equal(context.providerMeta,beforeMeta);assert.equal($('#connectionStatus').textContent,'Connection unavailable');
 }
 let pending=[];context.fetch=()=>new Promise(resolve=>pending.push(resolve));
 const old=context.requestMarketData(true),latest=context.requestMarketData(true);
 const fresh={...payload,source:'Latest'};
 pending[1]({ok:true,json:async()=>fresh});await latest;
 pending[0]({ok:true,json:async()=>payload});await old;assert.equal(context.providerMeta,fresh,'Old response must not overwrite latest');
 pending=[];const switched=context.requestMarketData(true);context.activeIndex=1;pending[0]({ok:true,json:async()=>payload});await switched;assert.equal(context.providerMeta,fresh,'A switched instrument must ignore old history');
 pending=[];const intervalSwitch=context.requestMarketData(true);$('#barInterval').value='daily';pending[0]({ok:true,json:async()=>payload});await intervalSwitch;assert.equal(context.providerMeta,fresh);
 context.fetch=async()=>{const e=new Error('internal timeout');e.name='TimeoutError';throw e};await context.requestMarketData(true);assert.equal(toasts.at(-1),'Market-data request timed out');
 assert.equal(context.providerMeta,fresh);
 console.log('Dashboard: broker symbols, header-only access code, test/load isolation, errors, timeout and stale-response protection passed');
})().catch(error=>{console.error(error);process.exit(1)});
