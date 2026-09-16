const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 10000);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://jeffer91.github.io,http://localhost:8080,http://127.0.0.1:8080')
  .split(',').map(x => x.trim()).filter(Boolean);
const ADMIN_LOGIN_HASH = process.env.ADMIN_LOGIN_HASH || 'c0d8715a560af5e884b31c8957f8618ef12c2959476f7423e2dbf338872caf9b';

const RUBRIC = [
  ['Título y delimitación',4],
  ['Resumen, Abstract y palabras clave',6],
  ['Introducción, antecedentes y problema',10],
  ['Objetivos y coherencia',6],
  ['Metodología',16],
  ['Resultados',12],
  ['Discusión',8],
  ['Conclusiones y recomendaciones',6],
  ['Referencias',7],
  ['Redacción y coherencia global',5],
  ['Formato institucional ÉLITE',20]
];

const DEFAULT_MODELS = [
  ['Gemini 3.8 Flash','Gemini API','General','Excelente','gemini-3.8-flash','https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent',100000],
  ['GPT-OSS 120B','Groq','Metodología','Excelente','openai/gpt-oss-120b','https://api.groq.com/openai/v1/chat/completions',100000],
  ['Mistral Small','Mistral AI','Redacción académica','Muy buena','mistral-small-latest','https://api.mistral.ai/v1/chat/completions',100000],
  ['Gemma 4 31B','NVIDIA NIM','Revisor crítico','Excelente','google/gemma-4-31b-it','https://integrate.api.nvidia.com/v1/chat/completions',100000],
  ['GLM 4.7 Flash','Cloudflare Workers AI','Coherencia / formato','Muy buena','@cf/zai-org/glm-4.7-flash','https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions',90000],
  ['GPT-OSS 120B','Cerebras','Razonamiento / estadística','Excelente','gpt-oss-120b','https://api.cerebras.ai/v1/chat/completions',22000],
  ['OpenRouter Free','OpenRouter','Respaldo dinámico','Respaldo','openrouter/free','https://openrouter.ai/api/v1/chat/completions',100000],
  ['Apertus 1.5 8B','Public AI','Contraste / respaldo','Secundaria','swiss-ai/apertus-v1.5-8b','https://api.publicai.co/v1/chat/completions',90000]
].map((m,i)=>({
  id:`model-${i+1}`,
  name:m[0], provider:m[1], reviewType:m[2], specialty:m[2], level:m[3],
  model:m[4], endpoint:m[5], maxInputChars:m[6], priority:i+1, weight:1, state:'Activa',
  timeout:90, temperature:.2, tokens:6000, prompt:'', lastTest:'Sin probar'
}));

let models = DEFAULT_MODELS.map(x=>({...x}));
const modelSecrets = new Map();
const adminSessions = new Map();
const loginAttempts = new Map();
const jobs = new Map();

const sleep = ms => new Promise(r=>setTimeout(r,ms));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const clamp = (n,min,max) => Math.max(min,Math.min(max,Number(n)||0));

function json(res,status,data,origin='') {
  const headers = {'Content-Type':'application/json; charset=utf-8'};
  if (origin && ALLOWED_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  headers['Vary'] = 'Origin';
  res.writeHead(status,headers);
  res.end(JSON.stringify(data));
}

function corsHeaders(req,res) {
  const origin = String(req.headers.origin || '');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');
  }
  return origin;
}

function readJson(req,limit=3_000_000) {
  return new Promise((resolve,reject)=>{
    let body='';
    req.on('data',chunk=>{
      body += chunk;
      if (body.length > limit) {
        reject(Object.assign(new Error('Solicitud demasiado grande.'),{status:413}));
        req.destroy();
      }
    });
    req.on('end',()=>{
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch { reject(Object.assign(new Error('JSON inválido.'),{status:400})); }
    });
    req.on('error',reject);
  });
}

function providerEnvKey(model) {
  const p = String(model.provider||'').toLowerCase();
  if (p.includes('gemini')) return process.env.GEMINI_API_KEY || '';
  if (p.includes('groq')) return process.env.GROQ_API_KEY || '';
  if (p.includes('mistral')) return process.env.MISTRAL_API_KEY || '';
  if (p.includes('nvidia')) return process.env.NVIDIA_API_KEY || '';
  if (p.includes('cloudflare')) return process.env.CLOUDFLARE_API_TOKEN || '';
  if (p.includes('cerebras')) return process.env.CEREBRAS_API_KEY || '';
  if (p.includes('openrouter')) return process.env.OPENROUTER_API_KEY || '';
  if (p.includes('public ai')) return process.env.PUBLICAI_API_KEY || '';
  return '';
}

function resolveKey(model) {
  return modelSecrets.get(model.id) || providerEnvKey(model) || '';
}

function cloudflareAccountId(model) {
  return String(model.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
}

function configurationProblem(model) {
  if (!resolveKey(model)) return `Sin API key para ${model.provider}`;
  if (/cloudflare/i.test(model.provider) && !cloudflareAccountId(model)) return 'Falta el Account ID de Cloudflare en el endpoint o en la configuración del servidor.';
  return '';
}

function cleanModel(m) {
  const problem = configurationProblem(m);
  const x={...m,keyConfigured:!!resolveKey(m),configurationReady:!problem,configurationProblem:problem};
  delete x.apiKey;
  return x;
}

function requireAdmin(req,res,origin) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const session = adminSessions.get(token);
  if (!session || session.expires < Date.now()) {
    json(res,401,{message:'Sesión administrativa no válida.'},origin);
    return false;
  }
  session.expires = Date.now() + 8*60*60*1000;
  return true;
}

function buildPrompt(articleText,model) {
  const rubric = RUBRIC.map(([n,m])=>`${n}: ${m}`).join('\n');
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

function articleForModel(text,model) {
  const limit = Math.max(8000, Number(model.maxInputChars)||90000);
  if (text.length <= limit) return text;
  const first = Math.round(limit*0.72);
  const last = limit-first;
  return `${text.slice(0,first)}\n\n[...contenido intermedio omitido solo para este proveedor por límite de contexto...]\n\n${text.slice(-last)}`;
}

function extractJson(text) {
  const raw = String(text||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try { return JSON.parse(raw); } catch {}
  const a=raw.indexOf('{'), b=raw.lastIndexOf('}');
  if (a>=0 && b>a) return JSON.parse(raw.slice(a,b+1));
  throw new Error('La IA no devolvió JSON válido.');
}

async function fetchWithTimeout(url,options,timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),timeoutMs);
  try { return await fetch(url,{...options,signal:controller.signal}); }
  finally { clearTimeout(timer); }
}

function providerError(data,status) {
  const nested = data?.error?.message || data?.errors?.[0]?.message || data?.message || data?.detail;
  return String(nested || `HTTP ${status}`);
}

async function callModel(model,prompt) {
  const problem = configurationProblem(model);
  if (problem) throw new Error(problem);

  const key = resolveKey(model);
  const timeoutMs = clamp(model.timeout||90,20,180)*1000;
  const p = String(model.provider||'').toLowerCase();
  const gemini = p.includes('gemini') || /generativelanguage/i.test(model.endpoint||'');
  let url = model.endpoint;
  const headers = {'Content-Type':'application/json'};
  let body;

  if (gemini) {
    url = String(url).replace(/\{modelo\}|\{model\}/gi,String(model.model||'').replace(/^models\//,''));
    headers['x-goog-api-key'] = key;
    body = {
      contents:[{parts:[{text:prompt}]}],
      generationConfig:{
        temperature:clamp(model.temperature??.2,0,1),
        maxOutputTokens:Math.min(Number(model.tokens)||6000,7000),
        responseMimeType:'application/json'
      }
    };
  } else {
    if (p.includes('cloudflare')) {
      const accountId = cloudflareAccountId(model);
      url = String(url).replace(/\{account_id\}/gi,encodeURIComponent(accountId));
    }
    headers.Authorization = `Bearer ${key}`;
    if (p.includes('openrouter')) {
      headers['HTTP-Referer']='https://jeffer91.github.io/Revisor-Articulos/';
      headers['X-Title']='Revisión Académica ITSQMET';
    }
    if (p.includes('nvidia')) headers.Accept='application/json';
    if (p.includes('public ai')) headers['User-Agent']='Revisor-Articulos-ITSQMET/1.0';

    body = {
      model:model.model,
      messages:[{role:'user',content:prompt}],
      temperature:clamp(model.temperature??.2,0,1)
    };
    const maxOut = Math.min(Number(model.tokens)||6000,7000);
    if (p.includes('cerebras')) body.max_completion_tokens=maxOut;
    else body.max_tokens=maxOut;
  }

  let lastErr;
  for (const delay of [0,1200,2800]) {
    if (delay) await sleep(delay);
    try {
      const resp = await fetchWithTimeout(url,{method:'POST',headers,body:JSON.stringify(body)},timeoutMs);
      const data = await resp.json().catch(()=>({}));
      if (!resp.ok) {
        const msg = providerError(data,resp.status);
        if ([408,429,500,502,503,504].includes(resp.status)) { lastErr=new Error(msg); continue; }
        throw new Error(msg);
      }
      const text = gemini ? data?.candidates?.[0]?.content?.parts?.map(x=>x?.text||'').join('') : data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('Respuesta vacía del modelo.');
      return {json:extractJson(text),usage:data?.usage||data?.usageMetadata||null};
    } catch (err) {
      lastErr=err;
      if (!/abort|timeout|408|429|500|502|503|504|high demand|overload|capacity|temporar/i.test(String(err.message))) throw err;
    }
  }
  throw lastErr || new Error('No fue posible obtener respuesta.');
}

async function testModel(model) {
  const started=Date.now();
  const prompt='Devuelve SOLO JSON válido: {"ok":true,"observacion":"Una mejora metodológica breve para: Se aplicó una encuesta y los resultados fueron positivos."}';
  const out=await callModel(model,prompt);
  const tokens=out.usage?.total_tokens ?? out.usage?.totalTokenCount ?? '—';
  return {time:((Date.now()-started)/1000).toFixed(1),tokens,text:out.json?.observacion||'Respuesta recibida correctamente.'};
}

function normalizeReview(x) {
  const incoming=Array.isArray(x?.categories)?x.categories:[];
  const categories=RUBRIC.map(([name,max])=>{
    const row=incoming.find(r=>Array.isArray(r)&&String(r[0]).toLowerCase()===name.toLowerCase());
    return [name,max,clamp(row?.[2]??0,0,max)];
  });
  return {
    categories,
    observations:(Array.isArray(x?.observations)?x.observations:[]).slice(0,12).map(o=>({
      severity:['Crítico','Alto','Medio','Bajo'].includes(o?.severity)?o.severity:'Medio',
      section:String(o?.section||'General').slice(0,100), points:clamp(o?.points||0,0,20),
      page:String(o?.page||o?.section||'Sección no especificada').slice(0,120),
      title:String(o?.title||'Observación').slice(0,180), original:String(o?.original||'').slice(0,700),
      problem:String(o?.problem||'').slice(0,1200), why:String(o?.why||'').slice(0,1200),
      fix:String(o?.fix||'').slice(0,1200), proposal:String(o?.proposal||'').slice(0,1600)
    })),
    critical:(Array.isArray(x?.critical)?x.critical:[]).map(String).slice(0,8),
    plagiarism:clamp(x?.similarityEstimate||0,0,100),
    plagiarismMatches:(Array.isArray(x?.similarityMatches)?x.similarityMatches:[]).slice(0,8),
    ai:clamp(x?.aiEstimate||0,0,100),
    aiFlags:(Array.isArray(x?.aiFlags)?x.aiFlags:[]).slice(0,8)
  };
}

function median(nums){const a=nums.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function risk(n){return n>=50?'Alto':n>=25?'Medio':'Bajo';}

function consolidate(successes,fileName,cedula) {
  const reviews=successes.map(x=>normalizeReview(x.result.json));
  const categories=RUBRIC.map(([name,max],i)=>[name,max,Math.round((reviews.reduce((s,r)=>s+(r.categories[i]?.[2]||0),0)/reviews.length)*10)/10]);
  const score=Math.round(categories.reduce((s,r)=>s+r[2],0)*10)/10;
  const grouped=new Map();
  reviews.forEach((r,ri)=>r.observations.forEach(o=>{
    const key=`${o.section}|${o.title}`.toLowerCase().replace(/\s+/g,' ');
    const old=grouped.get(key);
    if(old){old.consensus++;old.reviewers.push(ri+1);if(o.points>old.points)old.points=o.points;}
    else grouped.set(key,{...o,consensus:1,reviewers:[ri+1]});
  }));
  const rank={Crítico:4,Alto:3,Medio:2,Bajo:1};
  const observations=[...grouped.values()].sort((a,b)=>(rank[b.severity]-rank[a.severity])||(b.consensus-a.consensus)).slice(0,18);
  const plagiarism=Math.round(median(reviews.map(r=>r.plagiarism)));
  const ai=Math.round(median(reviews.map(r=>r.ai)));
  return {
    id:crypto.randomUUID(), n:1, date:new Date().toISOString(), file:fileName, cedula,
    score, approved:score>=70, reviewers:reviews.length,
    plagiarism, plagiarismRisk:risk(plagiarism), ai, aiRisk:risk(ai), categories, observations,
    critical:[...new Set(reviews.flatMap(r=>r.critical))].slice(0,8),
    plagiarismMatches:reviews.flatMap(r=>r.plagiarismMatches||[]).slice(0,8),
    aiFlags:reviews.flatMap(r=>r.aiFlags||[]).slice(0,8), errors:observations.length,
    reviewModels:successes.map(x=>({id:x.model.id,name:x.model.name,provider:x.model.provider,priority:x.model.priority,function:x.model.reviewType}))
  };
}

async function runReview(job,articleText) {
  try {
    job.step=2;
    const clean=String(articleText||'').replace(/\u0000/g,' ').trim();
    if(clean.length<700) throw new Error('No se pudo extraer suficiente texto del artículo.');
    const active=models.filter(m=>m.state==='Activa').sort((a,b)=>(Number(a.priority)||999)-(Number(b.priority)||999));
    const notReady=active.filter(m=>configurationProblem(m)).map(m=>({model:m.name,provider:m.provider,message:configurationProblem(m)}));
    const candidates=active.filter(m=>!configurationProblem(m));

    if(candidates.length<3){
      job.failures=notReady;
      job.reviewers=0;
      job.step=8;
      job.status='incomplete';
      job.message=`Solo hay ${candidates.length} proveedores configurados y listos. Se requieren al menos 3 para iniciar una revisión válida.`;
      return;
    }

    const successes=[],failures=[...notReady];
    let cursor=0;
    while(successes.length<5 && cursor<candidates.length){
      const batch=candidates.slice(cursor,cursor+(5-successes.length));
      cursor+=batch.length;
      const settled=await Promise.allSettled(batch.map(async model=>{
        const article=articleForModel(clean,model);
        return {model,result:await callModel(model,buildPrompt(article,model))};
      }));
      settled.forEach((s,i)=>s.status==='fulfilled'?successes.push(s.value):failures.push({model:batch[i].name,provider:batch[i].provider,message:String(s.reason?.message||s.reason)}));
    }

    job.failures=failures;
    job.reviewers=successes.length;
    job.step=6;
    if(successes.length<3){
      job.status='incomplete';
      job.message=`Solo respondieron ${successes.length} proveedores de forma válida. Se requieren al menos 3. El intento no fue descontado.`;
      return;
    }
    job.result=consolidate(successes,job.file,job.cedula);
    job.step=8;
    job.status='complete';
  } catch(err){
    job.status='failed';job.message=String(err.message||err);job.step=8;
  }
}

const server=http.createServer(async (req,res)=>{
  const origin=corsHeaders(req,res);
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const url=new URL(req.url,'http://localhost');
  try {
    if(req.method==='GET' && url.pathname==='/health'){
      const active=models.filter(m=>m.state==='Activa');
      const ready=active.filter(m=>!configurationProblem(m));
      return json(res,200,{ok:true,service:'Revisor Artículos API',models:models.length,active:active.length,ready:ready.length,providers:[...new Set(models.map(m=>m.provider))],time:new Date().toISOString()},origin);
    }

    if(req.method==='POST' && url.pathname==='/admin/login'){
      const body=await readJson(req);
      const ip=req.socket.remoteAddress||'unknown', now=Date.now();
      const rec=loginAttempts.get(ip)||{count:0,until:0};
      if(rec.until>now)return json(res,429,{message:'Demasiados intentos. Intenta nuevamente en unos minutos.'},origin);
      const hash=sha256(`${String(body.usuario||'').trim()}:${String(body.pin||'').trim()}`);
      if(hash!==ADMIN_LOGIN_HASH){rec.count++;if(rec.count>=7){rec.until=now+600000;rec.count=0;}loginAttempts.set(ip,rec);return json(res,401,{message:'Usuario o PIN incorrectos.'},origin);}
      loginAttempts.delete(ip);
      const token=crypto.randomBytes(32).toString('hex');adminSessions.set(token,{expires:now+8*60*60*1000});
      return json(res,200,{token,expiresIn:28800},origin);
    }

    if(url.pathname.startsWith('/admin/')){
      if(!requireAdmin(req,res,origin))return;
      if(req.method==='GET' && url.pathname==='/admin/models')return json(res,200,models.map(cleanModel),origin);
      if(req.method==='POST' && url.pathname==='/admin/models/sync'){
        const body=await readJson(req), incoming=Array.isArray(body.models)?body.models:[];
        if(incoming.length) models=incoming.map((m,i)=>({...DEFAULT_MODELS.find(x=>x.id===m.id),...m,id:m.id||`model-${i+1}`,priority:Number(m.priority)||i+1,state:m.state==='Inactiva'?'Inactiva':'Activa'}));
        return json(res,200,models.map(cleanModel),origin);
      }
      const match=url.pathname.match(/^\/admin\/models\/([^/]+)(\/test)?$/);
      if(match){
        const id=decodeURIComponent(match[1]), model=models.find(m=>m.id===id);
        if(!model)return json(res,404,{message:'IA no encontrada.'},origin);
        if(req.method==='POST' && match[2]==='/test'){
          try{const out=await testModel(model);model.lastTest='Correcta';return json(res,200,out,origin);}catch(err){const temporary=/408|429|500|502|503|504|high demand|temporar|overload|capacity|timeout|abort/i.test(String(err.message));model.lastTest=temporary?'Saturada':'Error';return json(res,temporary?503:400,{message:String(err.message||err),temporary},origin);}
        }
        if(req.method==='PUT' && !match[2]){
          const body=await readJson(req);Object.assign(model,body,{id});if(body.apiKey)modelSecrets.set(id,String(body.apiKey));delete model.apiKey;return json(res,200,cleanModel(model),origin);
        }
      }
      if(req.method==='POST' && url.pathname==='/admin/models'){
        const body=await readJson(req),id=body.id||`model-${Date.now()}`;const model={...body,id};if(body.apiKey)modelSecrets.set(id,String(body.apiKey));delete model.apiKey;models.push(model);return json(res,200,cleanModel(model),origin);
      }
      return json(res,404,{message:'Ruta administrativa no encontrada.'},origin);
    }

    if(req.method==='POST' && url.pathname==='/reviews'){
      const body=await readJson(req,3_000_000);
      const cedula=String(body.cedula||'').trim(), fileName=String(body.fileName||'articulo').slice(0,180), articleText=String(body.articleText||'');
      if(!/^\d{10}$/.test(cedula))return json(res,400,{message:'Cédula inválida.'},origin);
      if(articleText.length<700)return json(res,400,{message:'No se pudo extraer suficiente texto del artículo.'},origin);
      const id=crypto.randomUUID();const job={id,cedula,file:fileName,status:'processing',step:1,reviewers:0,createdAt:new Date().toISOString()};jobs.set(id,job);runReview(job,articleText);return json(res,202,{id,status:'processing'},origin);
    }
    const statusMatch=url.pathname.match(/^\/reviews\/([^/]+)\/status$/);
    if(req.method==='GET' && statusMatch){const job=jobs.get(statusMatch[1]);if(!job)return json(res,404,{message:'Revisión no encontrada.'},origin);return json(res,200,{id:job.id,status:job.status,step:job.step,reviewers:job.reviewers,message:job.message||'',failures:job.status==='processing'?undefined:job.failures},origin);}
    const resultMatch=url.pathname.match(/^\/reviews\/([^/]+)$/);
    if(req.method==='GET' && resultMatch){const job=jobs.get(resultMatch[1]);if(!job)return json(res,404,{message:'Revisión no encontrada.'},origin);if(job.status!=='complete')return json(res,409,{message:'La revisión todavía no está completa.',status:job.status},origin);return json(res,200,job.result,origin);}

    return json(res,404,{message:'Ruta no encontrada.'},origin);
  } catch(err){console.error(err);return json(res,err.status||500,{message:String(err.message||err)},origin);}
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Revisor Artículos API activa en ${PORT}`));
