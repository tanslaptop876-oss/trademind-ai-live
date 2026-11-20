// Build a deliberately minimal Cloudflare Pages preview package.
// No migrations, tests, admin APIs, broker credentials, or generated secrets are deployed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.preview-package');
const files=['historical-screener.html','historical-screener.css','styles.css',
  'historical-screener.js','screener-engine.js','scanner-extensions.js','signal-journal.js'];
const functions=['market-data.js','fx-reference.js'];
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(path.join(out,'public'),{recursive:true});
fs.mkdirSync(path.join(out,'functions','api'),{recursive:true});
for(const name of files){
  assert.ok(fs.existsSync(path.join(root,name)), 'Missing approved asset '+name);
  fs.copyFileSync(path.join(root,name),path.join(out,'public',name));
}
for(const name of functions){
  const source=path.join(root,name==='market-data.js'?'preview-functions':'functions','api',name);
  assert.ok(fs.existsSync(source), 'Missing approved public adapter '+name);
  fs.copyFileSync(source,path.join(out,'functions','api',name));
}
// Preview-specific UX: explicitly disable unavailable private broker features.
const disclaimer = `(()=>{'use strict';
  document.title='TradeMind AI — Crypto Signal Preview';
  const header=document.querySelector('.screener-page header');
  if(header){
    const h=header.querySelector('h1');if(h)h.textContent='Crypto Signal Research Preview';
    const p=document.createElement('p');
    p.id='previewRestrictions';p.setAttribute('role','status');
    p.textContent='PREVIEW ONLY: Public CoinDCX candles, demo CSV and rule-based signals. NSE/BSE, ICICI Breeze, brokerage orders, D1 logging and trained AI probabilities are not available here.';
    header.after(p);
  }
  for(const id of ['liveScan','runNseMtf']){
    const button=document.getElementById(id);
    if(button){button.disabled=true;button.title='Broker access is disabled in this preview';}
  }
  const access=document.getElementById('marketAccess');
  if(access){access.disabled=true;access.value='';}
  const live=document.getElementById('liveStatus');
  if(live)live.textContent='Broker data is not connected in this preview; use the public crypto scanner below.';
  const nse=document.getElementById('nseMtfStatus');
  if(nse)nse.textContent='NSE/BSE comparison is not enabled in this isolated preview.';
})();`;
fs.writeFileSync(path.join(out,'public','preview-mode.js'),disclaimer);
const htmlPath=path.join(out,'public','historical-screener.html');
const original=fs.readFileSync(htmlPath,'utf8');
assert.ok(original.includes('</body>'),'Preview HTML structure changed');
fs.writeFileSync(htmlPath,original.replace('</body>','<script src="preview-mode.js"></script></body>'));
fs.writeFileSync(path.join(out,'public','index.html'),
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/historical-screener.html"><title>TradeMind Signal Preview</title><a href="/historical-screener.html">Open TradeMind Signal Preview</a></html>\n');
// Record the exact source revision so hosted checks cannot pass on stale deployments.
const revision=process.env.GITHUB_SHA || require('node:child_process').execFileSync(
  'git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
assert.match(revision,/^[a-f0-9]{40}$/,'Expected a verified Git revision');
fs.writeFileSync(path.join(out,'public','preview-revision.json'),
  JSON.stringify({revision,kind:'isolated-crypto-signal-preview'})+'\n');
const installed=fs.readdirSync(path.join(out,'functions','api')).sort();
assert.deepEqual(installed,functions.sort());
assert.ok(!fs.existsSync(path.join(out,'functions','api','outcome-reconcile.js')));
const publicMarket=fs.readFileSync(path.join(out,'functions','api','market-data.js'),'utf8');
assert.ok(publicMarket.includes('CoinDCX public spot candles'));
for(const forbidden of ['ICICI_BREEZE','UPSTOX_ACCESS_TOKEN','MARKET_API_KEY','MARKET_DATA_BASE_URL',
  'ALPHA_VANTAGE_API_KEY','MARKET_ACCESS_TOKEN','Authorization: Bearer','onRequestPost']){
  assert.ok(!publicMarket.includes(forbidden),'Forbidden broker/private adapter capability in preview: '+forbidden);
}
assert.deepEqual(fs.readdirSync(path.join(out,'functions','api')).sort(),['fx-reference.js','market-data.js']);

assert.ok(fs.readFileSync(htmlPath,'utf8').includes('preview-mode.js'));
console.log('Prepared crypto-only preview package with explicit broker-disabled disclosure and 2 read-only public APIs.');
