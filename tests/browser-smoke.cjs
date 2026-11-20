/* TradeMind isolated browser QA: static development page + mocked public candle API.
 * No broker credentials, production deploy, D1 or order execution. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');

const packaged=process.env.PREVIEW_PACKAGE==='1';
const root=packaged?path.resolve(__dirname,'../.preview-package/public'):path.resolve(__dirname,'..');
const allow=new Set(['historical-screener.html','historical-screener.css','styles.css',
  'screener-engine.js','signal-journal.js','scanner-extensions.js','historical-screener.js']);
if(packaged)allow.add('preview-mode.js');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};

function candles(interval){
  const ms={'1min':60000,'15min':900000,'60min':3600000,'daily':86400000}[interval];
  if(!ms)throw Error('Unexpected requested interval '+interval);
  // Last candle is potentially forming, and each series independently trends upward.
  const base=Math.floor(Date.now()/ms)*ms-90*ms;
  return Array.from({length:91},(_,i)=>{
    const value=100+i*.45;
    return {date:new Date(base+i*ms).toISOString(),open:value,high:value+1.25,
      low:value-1.25,close:value+.3,volume:1000+i};
  });
}
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/market-data'){
    const type=url.searchParams.get('type'),symbol=url.searchParams.get('symbol'),interval=url.searchParams.get('interval');
    if(type!=='crypto'||!['BTCUSDT','ETHUSDT','BTCINR','ETHINR'].includes(symbol)){
      res.writeHead(503,{'content-type':'application/json'});
      res.end(JSON.stringify({error:'Mock broker not enabled'}));return;
    }
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({symbol,type,interval,source:'CoinDCX public spot candles',
      asOf:candles(interval).at(-1).date,rows:candles(interval)}));return;
  }
  const requested=url.pathname==='/'?'historical-screener.html':url.pathname.slice(1);
  if(!allow.has(requested)){res.writeHead(404);res.end('Not found');return;}
  const file=path.join(root,requested);
  res.writeHead(200,{'content-type':mime[path.extname(requested)]||'text/plain'});
  fs.createReadStream(file).pipe(res);
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1300,height:900}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{
      if(/\/api\//.test(request.url()))
        assert.ok(request.url().includes('/api/market-data'),'Unexpected API call');
    });
    await page.goto('http://127.0.0.1:'+port+'/historical-screener.html',{waitUntil:'load'});
    if(packaged){
      assert.equal(await page.locator('#liveScan').isDisabled(),true,'Broker scan must be unavailable in public preview');
      assert.equal(await page.locator('#runNseMtf').isDisabled(),true,'NSE MTF must be unavailable in public preview');
      assert.equal(await page.locator('#marketAccess').isDisabled(),true,'Broker credentials must be unavailable in public preview');
      assert.match(await page.locator('#previewRestrictions').innerText(),/NSE\/BSE.*not available here/);
    }
    assert.match(await page.locator('#sourceTag').innerText(),/NO DATA/);
    await page.locator('#demo').click();
    assert.match(await page.locator('#sourceTag').innerText(),/DEMO DATA/);
    assert.equal(await page.locator('#results tr').count(),3,'Demo instruments should render');
    assert.equal(await page.locator('#signalRows tr').count(),3,'Demo signal rows should render');
    await page.locator('#runExtended').click();
    assert.match(await page.locator('#extendedStatus').innerText(),/3 analyzed/);
    await page.locator('#runSignalJournal').click();
    assert.match(await page.locator('#journalStatus').innerText(),/Evaluated 3 instrument/);
    await page.locator('#clear').click();
    assert.match(await page.locator('#sourceTag').innerText(),/NO DATA/);
    assert.equal(await page.locator('#signalRows tr').count(),1);

    await page.locator('#cryptoSymbol').selectOption('BTCUSDT');
    await page.locator('#cryptoInterval').selectOption('15min');
    await page.locator('#cryptoScan').click();
    await page.waitForFunction(()=>document.getElementById('cryptoScan').disabled===false);
    assert.match(await page.locator('#cryptoStatus').innerText(),/candles \(latest bar excluded\)/);
    assert.match(await page.locator('#sourceTag').innerText(),/PUBLIC CRYPTO/);
    assert.equal(await page.locator('#signalRows tr').count(),1);
    assert.match(await page.locator('#signalSource').innerText(),/PUBLIC CRYPTO/);

    await page.locator('#runCryptoMtf').click();
    await page.waitForFunction(()=>document.getElementById('runCryptoMtf').disabled===false);
    assert.match(await page.locator('#cryptoMtfStatus').innerText(),/three independently fetched source intervals/);
    assert.match(await page.locator('#cryptoMtfResults').innerText(),/BTCUSDT/);
    if(!packaged){
      await page.locator('#runNseMtf').click();
      assert.match(await page.locator('#nseMtfStatus').innerText(),/access code is required/i);
    }else{
      assert.match(await page.locator('#nseMtfStatus').innerText(),/not enabled/);
    }
    assert.equal(errors.length,0,'Uncaught browser errors: '+errors.join('; '));
    console.log((packaged?'DEPLOYABLE PREVIEW PACKAGE':'DEVELOPMENT PAGE')+' Browser QA PASS: demo, research, journal, crypto scanner, MTF and broker guard');
  }finally{
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
