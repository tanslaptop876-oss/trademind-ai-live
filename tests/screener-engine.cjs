const assert=require('node:assert/strict');
const {parse,scan}=require('../screener-engine.js');
const lines=['symbol,date,open,high,low,close,volume,cap'];
for(let i=0;i<90;i++){const day=new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),p=100+i;lines.push(`ABC,${day},${p},${p+2},${p-2},${p},${1000+i},mid`)}
const [entry]=parse(lines.join('\n')),result=scan(entry);
assert.equal(entry.rows.length,90);assert.equal(result.direction,'UP');assert.ok(result.samples>=5);assert.ok(result.hitRate>=0&&result.hitRate<=1);assert.equal(result.asOf,entry.rows.at(-1).date);
assert.throws(()=>parse(lines.join('\n')+'\n'+lines.at(-1)),/unique and oldest first/);
assert.throws(()=>parse(lines.join('\n').replace(',100,102,98,100,1000,',',0,102,98,100,1000,')),/Invalid open/);
console.log('Historical screener validation and outcome checks passed');
