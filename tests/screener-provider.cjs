const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
  const elements=new Map(),indicators=[{dataset:{indicator:'sma'}},{dataset:{indicator:'ema'}}];
  function element(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,addEventListener(){},setAttribute(){}});return elements.get(id)}
  element('liveProvider').value='icici_breeze';element('liveInterval').value='weekly';element('liveInterval').options=['daily','weekly','monthly'].map(value=>({value}));
  element('marketAccess').value='access-code';for(const id of ['cap','direction'])element(id).value='all';
  let requests=[];
  const context={document:{getElementById:element,querySelectorAll:()=>indicators},window:{TradeMindScreener:{scan:entry=>({symbol:entry.symbol,error:'fixture'})}},URL,URLSearchParams,Blob,Date,console,
    fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({source:'FYERS',delay:'Snapshot',rows:Array.from({length:35},(_,i)=>({date:`2026-01-${i+1}`,open:100,high:101,low:99,close:100,volume:10}))})}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../historical-screener.js'),'utf8'),context);
  element('liveProvider').value='fyers';element('liveProvider').onchange();
  assert.equal(element('liveInterval').value,'daily');assert.ok(element('liveInterval').options.find(x=>x.value==='weekly').disabled);
  assert.equal(element('sourceTag').textContent,'NO DATA');
  await element('liveScan').onclick();assert.equal(requests.length,3);
  const params=new URL(requests[0].url,'https://test').searchParams;
  assert.equal(params.get('provider'),'fyers');assert.equal(params.get('fyers_symbol'),'NSE:RELIANCE-EQ');assert.equal(params.get('icici_code'),null);
  assert.equal(requests[0].options.headers['x-market-access'],'access-code');assert.equal(element('sourceTag').textContent,'FYERS · daily');assert.equal(element('liveProvider').disabled,false);
  element('liveProvider').value='icici_breeze';element('liveProvider').onchange();assert.ok(!element('liveInterval').options.find(x=>x.value==='weekly').disabled);assert.match(element('liveSymbols').value,/RELIANCE:RELIND/);
  console.log('Screener: provider switching, interval availability, FYERS requests, access header and source labels passed');
})().catch(error=>{console.error(error);process.exit(1)});
