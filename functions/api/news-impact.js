/* Read-only GDELT headline discovery. No broker account access or order routes. */
const SEARCH={
  'stocks:RELIANCE':'"Reliance Industries"',
  'stocks:HDFCBANK':'"HDFC Bank"',
  'stocks:TCS':'"Tata Consultancy Services"',
  'crypto:BTC/USDT':'"Bitcoin"',
  'crypto:ETH/USDT':'"Ethereum"',
  'crypto:SOL/USDT':'"Solana"',
  'mcx:GOLD':'"gold prices"',
  'mcx:SILVER':'"silver prices"',
  'mcx:CRUDEOIL':'"crude oil" OR "OPEC"',
  'forex:USD/INR':'"Indian rupee" OR "Reserve Bank of India"',
  'forex:EUR/USD':'"euro dollar"',
  'forex:GBP/USD':'"pound sterling"'
};
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=300'};
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:HEADERS});}
function parseGdeltDate(value){
  if(typeof value!=='string')return null;
  const m=value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
  if(m){const iso=`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;return Number.isFinite(Date.parse(iso))?iso:null;}
  const timestamp=Date.parse(value);return Number.isFinite(timestamp)?new Date(timestamp).toISOString():null;
}
export async function onRequestGet({request}){
  const input=new URL(request.url),type=input.searchParams.get('type')||'',
    symbol=input.searchParams.get('symbol')||'',search=SEARCH[type+':'+symbol];
  if(!search)return json({error:'Unsupported news instrument'},400);
  const url=new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.search=new URLSearchParams({query:search,mode:'artlist',format:'json',timespan:'3d',sort:'datedesc',maxrecords:'25'}).toString();
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(url.toString(),{signal:controller.signal,headers:{accept:'application/json'}});
    if(!response.ok)throw Error('News provider HTTP '+response.status);
    const contentType=response.headers.get('content-type')||'';
    if(!contentType.includes('json'))throw Error('News provider did not return JSON');
    const raw=await response.text();
    if(raw.length>250000)throw Error('News response exceeds size limit');
    const data=JSON.parse(raw);
    if(!Array.isArray(data.articles))throw Error('News provider returned no article list');
    const unique=new Set(),items=[];
    for(const row of data.articles){
      if(!row||typeof row.title!=='string'||typeof row.url!=='string')continue;
      let domain;
      try{const link=new URL(row.url);if(link.protocol!=='https:')continue;domain=link.hostname;}catch{continue;}
      const when=parseGdeltDate(row.seendate||row.date);
      if(!when||Date.now()-Date.parse(when)>72*36e5||Date.parse(when)>Date.now())continue;
      const key=row.url.split('?')[0].toLowerCase();if(unique.has(key))continue;unique.add(key);
      items.push({title:row.title.slice(0,220),url:row.url,publishedAt:when,domain});
      if(items.length>=12)break;
    }
    return json({type,symbol,source:'GDELT DOC 2.0 (headline discovery)',asOf:new Date().toISOString(),items,delayed:true,verified:false,
      note:'Unverified third-party headlines. News relevance and polarity are heuristic, not measured market impact.'});
  }catch(error){return json({error:'News feed unavailable',detail:String(error.message||error).slice(0,100),source:'GDELT DOC 2.0'},503);}
  finally{clearTimeout(timeout);}
}
