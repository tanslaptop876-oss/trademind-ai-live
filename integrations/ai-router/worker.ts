/** Shared AI router starter. Deploy separately as Cloudflare Worker.
 * Secrets: ROUTER_TOKEN and provider API keys. Never expose them in frontend.
 * Generates drafts only; does not commit or deploy generated code.
 */
export interface Env {
 ROUTER_TOKEN:string; GEMINI_API_KEY?:string; DEEPSEEK_API_KEY?:string;
 GROQ_API_KEY?:string; OPENROUTER_API_KEY?:string;
 GEMINI_MODEL?:string; DEEPSEEK_MODEL?:string; GROQ_MODEL?:string; OPENROUTER_MODEL?:string;
}
type Provider="gemini"|"deepseek"|"groq"|"openrouter";
const providers:Provider[]=["gemini","deepseek","groq","openrouter"];
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const config=(env:Env,p:Provider)=>{
 switch(p){
 case "gemini":return {key:env.GEMINI_API_KEY,model:env.GEMINI_MODEL||"gemini-2.5-flash",url:""};
 case "deepseek":return {key:env.DEEPSEEK_API_KEY,model:env.DEEPSEEK_MODEL||"deepseek-chat",url:"https://api.deepseek.com/chat/completions"};
 case "groq":return {key:env.GROQ_API_KEY,model:env.GROQ_MODEL||"llama-3.3-70b-versatile",url:"https://api.groq.com/openai/v1/chat/completions"};
 case "openrouter":return {key:env.OPENROUTER_API_KEY,model:env.OPENROUTER_MODEL||"openrouter/auto",url:"https://openrouter.ai/api/v1/chat/completions"};
 }
};
async function generate(env:Env,p:Provider,task:string,project:string){
 const c=config(env,p);if(!c.key)throw new Error("NOT_CONFIGURED");
 const prompt=`Project: ${project}\nTask: ${task}\nProvide reviewable code suggestions only; never claim code was tested, committed, or deployed.`;
 const gemini=p==="gemini";
 const url=gemini?`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`:c.url;
 const body=gemini?{contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:4096}}:{model:c.model,messages:[{role:"user",content:prompt}],max_tokens:4096};
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),30000);
 try{
 const res=await fetch(url,{method:"POST",headers:gemini?{"content-type":"application/json","x-goog-api-key":c.key}:{"content-type":"application/json",authorization:`Bearer ${c.key}`},body:JSON.stringify(body),signal:ctrl.signal});
 if(!res.ok)throw new Error(`PROVIDER_HTTP_${res.status}`);
 const data:any=await res.json();
 const output=gemini?(data.candidates?.[0]?.content?.parts||[]).map((v:any)=>v.text||"").join("\n"):data.choices?.[0]?.message?.content;
 if(typeof output!=="string"||!output.trim())throw new Error("EMPTY_OUTPUT");
 return {provider:p,model:c.model,output,status:"draft_requires_review"};
 }finally{clearTimeout(timer)}
}
export default {async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url);
 if(url.pathname==="/health"&&request.method==="GET")return reply({ok:true,service:"multi-ai-router",providers:providers.map(p=>({name:p,configured:!!config(env,p).key}))});
 if(url.pathname!=="/api/ai/generate"||request.method!=="POST")return reply({error:"Not found"},404);
 if(!env.ROUTER_TOKEN||request.headers.get("authorization")!==`Bearer ${env.ROUTER_TOKEN}`)return reply({error:"Unauthorized"},401);
 let data:any;try{data=await request.json()}catch{return reply({error:"Invalid JSON"},400)}
 if(typeof data?.task!=="string"||!data.task.trim()||data.task.length>12000)return reply({error:"Invalid task"},400);
 if(!["TradeMind","MarketingMind"].includes(data.project))return reply({error:"Invalid project"},400);
 const selected=data.provider||"auto";
 if(selected!=="auto"&&!providers.includes(selected))return reply({error:"Invalid provider"},400);
 const choices:Provider[]=selected==="auto"?providers:[selected];
 const errors:string[]=[];
 for(const p of choices){if(!config(env,p).key){errors.push(p+":not_configured");continue}
 try{return reply(await generate(env,p,data.task,data.project))}catch(e){errors.push(p+":"+String(e instanceof Error?e.message:e))}}
 return reply({error:"No provider succeeded",attempts:errors},502);
}};
