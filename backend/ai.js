const { RUBRIC } = require('./catalog');
const { resolveKey,cloudflareAccountId,configurationProblem } = require('./store');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));

function buildPrompt(articleText,model){
  const rubric=RUBRIC.map(([n,m])=>`${n}: ${m}`).join('\n');
  return `Actúa como revisor de un ARTÍCULO ACADÉMICO institucional. No es arbitraje de artículo científico. Tu función principal es ${model.reviewType||'General'}.
Evalúa solo lo visible. No inventes fuentes, DOI, autores, páginas ni resultados.
Reglas:
- Nota académica sobre 100; aprobado desde 70.
- Formato institucional ÉLITE = 20 puntos.
- NO penalizar ORCID ni el año/volumen provisional de la revista.
- Referencias reales y preferentemente de los últimos 5 años, salvo clásicos indispensables. Si no puedes verificar una fuente externamente, indícalo y no la declares falsa.
- Similitud y posible uso de IA son resultados separados de la nota.
- Detección de IA es solo estimativa y nunca prueba definitiva.

Rúbrica exacta:
${rubric}

Devuelve SOLO JSON válido con:
{
 "categories":[["Título y delimitación",4,0]],
 "observations":[{"severity":"Crítico|Alto|Medio|Bajo","section":"...","points":0,"page":"sección o ubicación","title":"...","original":"fragmento real breve","problem":"...","why":"...","fix":"...","proposal":"..."}],
 "critical":[],
 "similarityEstimate":0,
 "similarityRisk":"Bajo|Medio|Alto|Crítico",
 "similarityMatches":[],
 "aiEstimate":0,
 "aiRisk":"Bajo|Medio|Alto",
 "aiFlags":[]
}
Incluye las 11 categorías exactas y no excedas sus máximos. Máximo 12 observaciones relevantes. similarityEstimate debe ser una estimación conservadora, no una acusación de plagio.

ARTÍCULO:\n${articleText}`;
}

function articleForModel(text,model){
  const limit=Math.max(8000,Number(model.maxInputChars)||90000);
  if(text.length<=limit)return text;
  const first=Math.round(limit*.72),last=limit-first;
  return `${text.slice(0,first)}\n\n[...contenido intermedio omitido solo para este proveedor por límite de contexto...]\n\n${text.slice(-last)}`;
}

function repairJsonString(raw){
  return String(raw||'').replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/,\s*([}\]])/g,'$1').trim();
}
function extractJson(text){
  const raw=String(text||'').trim();
  for(const candidate of [raw,repairJsonString(raw)]){
    try{return JSON.parse(candidate)}catch{}
    const a=candidate.indexOf('{'),b=candidate.lastIndexOf('}');
    if(a>=0&&b>a){try{return JSON.parse(repairJsonString(candidate.slice(a,b+1)))}catch{}}
  }
  throw new Error('La IA no devolvió JSON válido.');
}
function validateReviewShape(x){
  if(!x||typeof x!=='object')throw new Error('Respuesta académica inválida.');
  if(!Array.isArray(x.categories)||x.categories.length<8)throw new Error('La IA devolvió una rúbrica incompleta.');
  if(!Array.isArray(x.observations))x.observations=[];
  return x;
}
async function fetchWithTimeout(url,options,timeoutMs){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}
}
function providerError(data,status){return String(data?.error?.message||data?.errors?.[0]?.message||data?.message||data?.detail||`HTTP ${status}`)}
function classifyFailure(message){
  const s=String(message||'');
  if(/sin api key|falta el account id|falta el endpoint|falta el identificador/i.test(s))return 'Sin configurar';
  if(/408|429|500|502|503|504|high demand|temporar|overload|capacity|timeout|abort|rate limit/i.test(s))return 'Saturada';
  return 'Error';
}

async function callModel(model,prompt){
  const problem=configurationProblem(model);if(problem)throw new Error(problem);
  const key=resolveKey(model),timeoutMs=clamp(model.timeout||90,20,180)*1000,p=String(model.provider||'').toLowerCase();
  const gemini=p.includes('gemini')||/generativelanguage/i.test(model.endpoint||'');
  let url=model.endpoint;const headers={'Content-Type':'application/json'};let body;
  if(gemini){
    url=String(url).replace(/\{modelo\}|\{model\}/gi,String(model.model||'').replace(/^models\//,''));
    headers['x-goog-api-key']=key;
    body={contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:clamp(model.temperature??.2,0,1),maxOutputTokens:Math.min(Number(model.tokens)||6000,7000),responseMimeType:'application/json'}};
  }else{
    if(p.includes('cloudflare'))url=String(url).replace(/\{account_id\}/gi,encodeURIComponent(cloudflareAccountId(model)));
    headers.Authorization=`Bearer ${key}`;
    if(p.includes('openrouter')){headers['HTTP-Referer']='https://jeffer91.github.io/Revisor-Articulos/';headers['X-Title']='Revisión Académica ITSQMET'}
    if(p.includes('nvidia'))headers.Accept='application/json';
    if(p.includes('public ai'))headers['User-Agent']='Revisor-Articulos-ITSQMET/1.0';
    body={model:model.model,messages:[{role:'user',content:prompt}],temperature:clamp(model.temperature??.2,0,1)};
    const maxOut=Math.min(Number(model.tokens)||6000,7000);
    if(p.includes('cerebras'))body.max_completion_tokens=maxOut;else body.max_tokens=maxOut;
  }
  let lastErr;
  for(const delay of [0,1200,2800]){
    if(delay)await sleep(delay);
    try{
      const resp=await fetchWithTimeout(url,{method:'POST',headers,body:JSON.stringify(body)},timeoutMs),data=await resp.json().catch(()=>({}));
      if(!resp.ok){const msg=providerError(data,resp.status);if([408,429,500,502,503,504].includes(resp.status)){lastErr=new Error(msg);continue}throw new Error(msg)}
      const text=gemini?data?.candidates?.[0]?.content?.parts?.map(x=>x?.text||'').join(''):data?.choices?.[0]?.message?.content;
      if(!text)throw new Error('Respuesta vacía del modelo.');
      return {json:validateReviewShape(extractJson(text)),usage:data?.usage||data?.usageMetadata||null};
    }catch(err){lastErr=err;if(!/abort|timeout|408|429|500|502|503|504|high demand|overload|capacity|temporar|rate limit/i.test(String(err.message)))throw err}
  }
  throw lastErr||new Error('No fue posible obtener respuesta.');
}

async function testModel(model){
  const started=Date.now();
  const prompt='Devuelve SOLO JSON válido con estas claves: {"categories":[["Título y delimitación",4,3],["Resumen, Abstract y palabras clave",6,4],["Introducción, antecedentes y problema",10,7],["Objetivos y coherencia",6,4],["Metodología",16,10],["Resultados",12,8],["Discusión",8,5],["Conclusiones y recomendaciones",6,4],["Referencias",7,5],["Redacción y coherencia global",5,4],["Formato institucional ÉLITE",20,15]],"observations":[],"critical":[],"similarityEstimate":0,"similarityRisk":"Bajo","similarityMatches":[],"aiEstimate":0,"aiRisk":"Bajo","aiFlags":[]}';
  const out=await callModel(model,prompt),tokens=out.usage?.total_tokens??out.usage?.totalTokenCount??'—';
  return {time:((Date.now()-started)/1000).toFixed(1),tokens,text:'Respuesta estructurada recibida correctamente.'};
}

function normalizeReview(x){
  const incoming=Array.isArray(x?.categories)?x.categories:[];
  const categories=RUBRIC.map(([name,max])=>{const row=incoming.find(r=>Array.isArray(r)&&String(r[0]).toLowerCase()===name.toLowerCase());return [name,max,clamp(row?.[2]??0,0,max)]});
  return {categories,observations:(Array.isArray(x?.observations)?x.observations:[]).slice(0,12).map(o=>({severity:['Crítico','Alto','Medio','Bajo'].includes(o?.severity)?o.severity:'Medio',section:String(o?.section||'General').slice(0,100),points:clamp(o?.points||0,0,20),page:String(o?.page||o?.section||'Sección no especificada').slice(0,120),title:String(o?.title||'Observación').slice(0,180),original:String(o?.original||'').slice(0,700),problem:String(o?.problem||'').slice(0,1200),why:String(o?.why||'').slice(0,1200),fix:String(o?.fix||'').slice(0,1200),proposal:String(o?.proposal||'').slice(0,1600)})),critical:(Array.isArray(x?.critical)?x.critical:[]).map(String).slice(0,8),plagiarism:clamp(x?.similarityEstimate||0,0,100),plagiarismMatches:(Array.isArray(x?.similarityMatches)?x.similarityMatches:[]).slice(0,8),ai:clamp(x?.aiEstimate||0,0,100),aiFlags:(Array.isArray(x?.aiFlags)?x.aiFlags:[]).slice(0,8)};
}
const median=nums=>{const a=nums.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};
const risk=n=>n>=50?'Alto':n>=25?'Medio':'Bajo';
function consolidate(successes,fileName,cedula){
  const reviews=successes.map(x=>normalizeReview(x.result.json));
  const categories=RUBRIC.map(([name,max],i)=>[name,max,Math.round((reviews.reduce((s,r)=>s+(r.categories[i]?.[2]||0),0)/reviews.length)*10)/10]);
  const score=Math.round(categories.reduce((s,r)=>s+r[2],0)*10)/10,grouped=new Map();
  reviews.forEach((r,ri)=>r.observations.forEach(o=>{const key=`${o.section}|${o.title}`.toLowerCase().replace(/\s+/g,' '),old=grouped.get(key);if(old){old.consensus++;old.reviewers.push(ri+1);if(o.points>old.points)old.points=o.points}else grouped.set(key,{...o,consensus:1,reviewers:[ri+1]})}));
  const rank={Crítico:4,Alto:3,Medio:2,Bajo:1},observations=[...grouped.values()].sort((a,b)=>(rank[b.severity]-rank[a.severity])||(b.consensus-a.consensus)).slice(0,18),plagiarism=Math.round(median(reviews.map(r=>r.plagiarism))),ai=Math.round(median(reviews.map(r=>r.ai)));
  return {id:null,n:1,date:new Date().toISOString(),file:fileName,cedula,score,approved:score>=70,reviewers:reviews.length,plagiarism,plagiarismRisk:risk(plagiarism),ai,aiRisk:risk(ai),categories,observations,critical:[...new Set(reviews.flatMap(r=>r.critical))].slice(0,8),plagiarismMatches:reviews.flatMap(r=>r.plagiarismMatches||[]).slice(0,8),aiFlags:reviews.flatMap(r=>r.aiFlags||[]).slice(0,8),errors:observations.length,reviewModels:successes.map(x=>({id:x.model.id,name:x.model.name,provider:x.model.provider,priority:x.model.priority,function:x.model.reviewType}))};
}

module.exports={buildPrompt,articleForModel,callModel,testModel,classifyFailure,consolidate};
