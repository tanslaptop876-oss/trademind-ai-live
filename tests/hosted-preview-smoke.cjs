/* Hosted Cloudflare Pages preview verification — execute only after isolated deployment.
 * Expects HTTPS trusted preview URL; tests public endpoints, no tokens/orders. */
const assert=require('node:assert/strict');
(async()=>{
  const base=process.env.PREVIEW_URL;
  if(!base)throw Error('PREVIEW_URL required');
  const url=new URL(base);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.pages.dev')||
     !/^[a-z0-9.-]+$/.test(url.hostname)||url.username||url.password)
    throw Error('Expected a Cloudflare Pages HTTPS preview URL');
  // Cloudflare Pages supports project domains and deployment/branch subdomains.
  // Require an explicitly identified dedicated project; a random deployment prefix is
  // not proof of isolation, and checking only the first hostname label rejects safe URLs.
  const project=String(process.env.PREVIEW_PROJECT||'');
  if(!/^[a-z0-9-]{6,63}$/.test(project)||
     (!project.includes('-preview-')&&!project.includes('-staging-')))
    throw Error('Expected an explicitly configured isolated preview project');
  if(url.hostname!==project+'.pages.dev'&&!url.hostname.endsWith('.'+project+'.pages.dev'))
    throw Error('Preview URL does not belong to the approved Cloudflare Pages project');
  const request=async(route)=>{
    const response=await fetch(new URL(route,url),{headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
    return {response,body:await response.text()};
  };
  const expectedRevision=String(process.env.EXPECTED_PREVIEW_REVISION||'');
  assert.match(expectedRevision,/^[a-f0-9]{40}$/,'Expected explicitly pinned preview revision');
  const marker=await request('/preview-revision.json');
  assert.equal(marker.response.status,200,'Preview revision marker unavailable');
  const revision=JSON.parse(marker.body);
  assert.equal(revision.kind,'isolated-crypto-signal-preview');
  assert.equal(revision.revision,expectedRevision,'Hosted preview serves a stale or wrong revision');
  const page=await request('/historical-screener.html');
  assert.equal(page.response.status,200,'Hosted dashboard unavailable');
  assert.match(page.body,/preview-mode\.js/);
  const previewScript=await request('/preview-mode.js');
  assert.equal(previewScript.response.status,200);
  assert.match(previewScript.body,/broker.*disabled/i);
  const crypto=await request('/api/market-data?symbol=BTCUSDT&type=crypto&mode=live&interval=15min');
  const json=JSON.parse(crypto.body);
  assert.equal(crypto.response.status,200,'Hosted crypto API error '+crypto.body.slice(0,200));
  assert.equal(json.source,'CoinDCX public spot candles');
  assert.ok(Array.isArray(json.rows)&&json.rows.length>=35);
  assert.ok(!Object.hasOwn(json,'apiKey'));
  const denied=await request('/api/market-data?symbol=RELIANCE&type=stocks&mode=live&interval=15min');
  assert.equal(denied.response.status,400,'Stocks must be blocked in crypto-only preview');
  const fx=await request('/api/fx-reference?pair=USDINR');
  const fxJson=JSON.parse(fx.body);
  assert.equal(fx.response.status,200);
  assert.equal(fxJson.signalEligible,false);
  assert.equal(fxJson.realtime,false);
  const admin=await request('/api/outcome-reconcile');
  assert.equal(admin.response.status,404,'Admin D1 write endpoint must not be deployed');
  console.log('Hosted isolated preview smoke PASS: dashboard, CoinDCX, reference FX, no NSE/broker or admin endpoints');
})().catch(err=>{console.error(err);process.exitCode=1});
