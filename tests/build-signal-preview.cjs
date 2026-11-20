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
fs.writeFileSync(path.join(out,'public','index.html'),
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/historical-screener.html"><title>TradeMind Signal Preview</title><a href="/historical-screener.html">Open TradeMind Signal Preview</a></html>\n');
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

console.log('Prepared minimal read-only preview package: '+files.length+' static assets + 2 public API routes.');
