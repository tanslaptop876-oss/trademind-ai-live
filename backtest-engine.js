(function(root){
  'use strict';
  function average(values,period){return values.map((_,i)=>i<period-1?null:values.slice(i-period+1,i+1).reduce((a,b)=>a+b,0)/period)}
  function run(prices,fast,slow,costPercent){
    if(!Array.isArray(prices)||prices.length<=slow+2||prices.some(p=>!Number.isFinite(p)||p<=0))throw Error('Need valid positive prices and more than slow period + 2 bars');
    if(!Number.isInteger(fast)||!Number.isInteger(slow)||fast<2||slow<=fast||slow>200)throw Error('Invalid SMA periods');
    if(!Number.isFinite(costPercent)||costPercent<0||costPercent>5)throw Error('Trade cost must be 0–5%');
    const fee=costPercent/100,short=average(prices,fast),long=average(prices,slow),equity=[1],hold=[1],trades=[];
    let position=0,entry=0,peak=1,maxDrawdown=0;
    for(let i=1;i<prices.length;i++){
      // The signal from bar i-1 is executed at bar i close. The new position
      // only receives the return from i to i+1, avoiding same-bar hindsight.
      const signal=i>1&&short[i-1]!=null&&long[i-1]!=null&&short[i-1]>long[i-1]?1:0;
      let value=equity.at(-1)*(position?prices[i]/prices[i-1]:1);
      if(signal!==position){
        value*=1-fee;
        if(signal){entry=prices[i];}
        else trades.push(prices[i]/entry*(1-fee)**2-1);
        position=signal;
      }
      equity.push(value);
      hold.push(prices[i]/prices[0]);
      peak=Math.max(peak,value);maxDrawdown=Math.min(maxDrawdown,value/peak-1);
    }
    // Open positions remain marked to market. Only closed trades count in win rate.
    return {equity,hold,trades,openPosition:Boolean(position),strategyReturn:(equity.at(-1)-1)*100,holdReturn:(hold.at(-1)-1)*100,maxDrawdown:maxDrawdown*100,winRate:trades.length?trades.filter(t=>t>0).length/trades.length*100:null};
  }
  root.TradeMindBacktest={run};
  if(typeof module!=='undefined'&&module.exports)module.exports={run};
})(typeof window!=='undefined'?window:globalThis);
