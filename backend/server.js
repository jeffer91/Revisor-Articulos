const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://jeffer91.github.io,http://localhost:8080,http://127.0.0.1:8080')
  .split(',').map(x => x.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Origen no autorizado'));
  }
}));
app.use(express.json({limit:'2mb'}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: 8 * 1024 * 1024}
});

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

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const DEFAULT_MODELS = [
  ['Gemini 3.8 Flash','Gemini API','General','gemini-3.8-flash',GEMINI_ENDPOINT],
  ['GPT-OSS 120B','Groq','Metodología','openai/gpt-oss-120b',GROQ_ENDPOINT],
  ['Inkling','OpenRouter','General','thinkingmachines/inkling',OPENROUTER_ENDPOINT],
  ['Gemma 4 31B','OpenRouter','Redacción académica','google/gemma-4-31b-it',OPENROUTER_ENDPOINT],
  ['Gemma 4 26B A4B','OpenRouter','Coherencia','google/gemma-4-26b-a4b-it',OPENROUTER_ENDPOINT],
  ['Nemotron 3 Ultra','OpenRouter','Metodología','nvidia/nemotron-3-ultra-550b-a55b',OPENROUTER_ENDPOINT],
  ['Gemini 3.7 Flash','Gemini API','General','gemini-3.7-flash',GEMINI_ENDPOINT],
  ['Nemotron 3 Super','OpenRouter','Resultados y discusión','nvidia/nemotron-3-super-120b-a12b:free',OPENROUTER_ENDPOINT],
  ['Qwen 3.8 27B','Groq','Metodología','qwen/qwen3.8-27b',GROQ_ENDPOINT],
  ['DeepSeek R1 Distill Qwen 32B','OpenRouter','Estadística / lógica','deepseek/deepseek-r1-distill-qwen-32b',OPENROUTER_ENDPOINT],
  ['GLM 4.7 Flash','OpenRouter','Coherencia','z-ai/glm-4.7-flash',OPENROUTER_ENDPOINT],
  ['Gemini 3.6 Flash','Gemini API','General','gemini-3.6-flash',GEMINI_ENDPOINT],
  ['Ling 3.0 Flash VL','OpenRouter','Tablas y figuras','inclusionai/ling-3.0-flash-vl',OPENROUTER_ENDPOINT],
  ['Nemotron 3.5 Lightning','OpenRouter','Revisor crítico','nvidia/nemotron-3.5-lightning:free',OPENROUTER_ENDPOINT],
  ['GPT-OSS 20B','Groq','Redacción / coherencia','openai/gpt-oss-20b',GROQ_ENDPOINT],
  ['Dots3-Note Preview','OpenRouter','Documento completo','dots-studio/dots-3-note-preview:free',OPENROUTER_ENDPOINT],
  ['Gemini 3.5 Flash','Gemini API','Redacción','gemini-3.5-flash',GEMINI_ENDPOINT],
  ['Inkling Small','OpenRouter','Coherencia','thinkingmachines/inkling-small',OPENROUTER_ENDPOINT],
  ['Nemotron 3 Nano Omni','OpenRouter','Tablas / imágenes','nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',OPENROUTER_ENDPOINT],
  ['Ling 3.0 Flash Sante','OpenRouter','Artículos de salud','inclusionai/ling-3.0-flash-sante:free',OPENROUTER_ENDPOINT],
  ['Ling 3.0 Flash Fin','OpenRouter','Economía / finanzas','inclusionai/ling-3.0-flash-fin:free',OPENROUTER_ENDPOINT],
  ['Nex-N2.5-Pro','OpenRouter','Investigación / contraste','nex-agi/nex-n2.5-pro:free',OPENROUTER_ENDPOINT],
  ['Nex-N2.5-Mini','OpenRouter','Investigación / contraste','nex-agi/nex-n2.5-mini:free',OPENROUTER_ENDPOINT],
  ['Gemini 3.1 Flash-Lite','Gemini API','Formato / extracción','gemini-3.1-flash-lite',GEMINI_ENDPOINT],
  ['Laguna S 2.1','OpenRouter','Respaldo','poolside/laguna-s-2.1:free',OPENROUTER_ENDPOINT]
].map((m,i)=>({
  id:`model-${i+1}`, name:m[0], provider:m[1], reviewType:m[2], specialty:m[2], model:m[3], endpoint:m[4],
  priority:i+1, weight:1, state:'Activa', timeout:90, temperature:.2, tokens:6000, prompt:'', lastTest:'Sin probar'
}));

let models = DEFAULT_MODELS.map(x=>({...x}));
const modelSecrets = new Map();
const jobs = new Map();
const adminSessions = new Map();
const loginAttempts = new Map();

const ADMIN_LOGIN_HASH = process.env.ADMIN_LOGIN_HASH || 'c0d8715a560af5e884b31c8957f8618ef12c2959476f7423e2dbf338872caf9b';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const clamp = (n,min,max) => Math.max(min,Math.min(max,Number(n)||0));

function cleanModel(m) {
  const copy = {...m};
  copy.keyConfigured = !!resolveKey(copy);
  delete copy.apiKey;
  return copy;
}

function providerEnvKey(model) {
  const p = String(model.provider || '').toLowerCase();
  if (p.includes('gemini')) return process.env.GEMINI_API_KEY || '';
  if (p.includes('groq')) return process.env.GROQ_API_KEY || '';
  if (p.includes('openrouter')) return process.env.OPENROUTER_API_KEY || '';
  return '';
}

function resolveKey(model) {
  return modelSecrets.get(model.id) || providerEnvKey(model) || '';
}

function requireAdmin(req,res,next) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const session = adminSessions.get(token);
  if (!session || session.expires < Date.now()) return res.status(401).json({message:'Sesión administrativa no válida.'});
  session.expires = Date.now() + 8 * 60 * 60 * 1000;
  next();
}

app.get('/health', (req,res)=>res.json({ok:true,service:'Revisor Artículos API',models:models.length,time:new Date().toISOString()}));

app.post('/admin/login', (req,res)=>{
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const rec = loginAttempts.get(ip) || {count:0,until:0};
  if (rec.until > now) return res.status(429).json({message:'Demasiados intentos. Intenta nuevamente en unos minutos.'});
  const usuario = String(req.body?.usuario || '').trim();
  const pin = String(req.body?.pin || '').trim();
  const hash = sha256(`${usuario}:${pin}`);
  if (hash !== ADMIN_LOGIN_HASH) {
    rec.count++;
    if (rec.count >= 7) { rec.until = now + 10 * 60 * 1000; rec.count = 0; }
    loginAttempts.set(ip,rec);
    return res.status(401).json({message:'Usuario o PIN incorrectos.'});
  }
  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token,{created:now,expires:now + 8*60*60*1000});
  res.json({token,expiresIn:28800});
});

app.get('/admin/models', requireAdmin, (req,res)=>res.json(models.map(cleanModel)));
app.post('/admin/models/sync', requireAdmin, (req,res)=>{
  const incoming = Array.isArray(req.body?.models) ? req.body.models : [];
  if (!incoming.length) return res.json(models.map(cleanModel));
  models = incoming.map((m,i)=>({
    ...DEFAULT_MODELS.find(x=>x.id===m.id), ...m,
    id:m.id || `model-${i+1}`,
    priority:Number(m.priority)||i+1,
    state:m.state === 'Inactiva' ? 'Inactiva' : 'Activa'
  }));
  res.json(models.map(cleanModel));
});
app.post('/admin/models', requireAdmin, (req,res)=>{
  const id = req.body?.id || `model-${Date.now()}`;
  const model = {...req.body,id}; delete model.apiKey;
  if (req.body?.apiKey) modelSecrets.set(id,String(req.body.apiKey));
  models.push(model);
  res.json(cleanModel(model));
});
app.put('/admin/models/:id', requireAdmin, (req,res)=>{
  const i = models.findIndex(m=>m.id===req.params.id);
  if (i < 0) return res.status(404).json({message:'IA no encontrada.'});
  const next = {...models[i],...req.body,id:req.params.id}; delete next.apiKey;
  if (req.body?.apiKey) modelSecrets.set(req.params.id,String(req.body.apiKey));
  models[i] = next;
  res.json(cleanModel(next));
});

function buildPrompt(articleText, model) {
  const rubric = RUBRIC.map(([n,m])=>`${n}: ${m}`).join('\n');
  const specialist = model.reviewType || 'General';
  return `Actúa como revisor de un ARTÍCULO ACADÉMICO institucional, no como árbitro de una revista científica. Tu función principal es: ${specialist}.
Evalúa con exigencia, pero solo con evidencia visible en el texto. No inventes páginas, fuentes, DOI, autores ni resultados.
Reglas obligatorias:
- Nota académica total sobre 100. Aprobación desde 70.
- El formato institucional representa 20 puntos.
- NO penalices ORCID ni el año/volumen provisional de la revista.
- Las referencias deben ser reales y preferentemente de los últimos 5 años, salvo clásicos indispensables. Si no puedes verificar externamente una fuente, dilo y NO afirmes que es falsa.
- Una referencia comprobablemente inexistente sería crítica, pero no la declares falsa sin evidencia suficiente.
- Similitud y posible uso de IA son indicadores SEPARADOS y no afectan la nota académica.
- La estimación de posible IA es orientativa, nunca una prueba.

Rúbrica exacta (máximos):
${rubric}

Devuelve SOLAMENTE JSON válido con esta estructura:
{
  "categories":[["Título y delimitación",4,0]],
  "observations":[{"severity":"Crítico|Alto|Medio|Bajo","section":"...","points":0,"page":"Ubicación aproximada o sección","title":"...","original":"fragmento breve real del texto","problem":"...","why":"...","fix":"...","proposal":"..."}],
  "critical":["..."],
  "similarityEstimate":0,
  "similarityRisk":"Bajo|Medio|Alto|Crítico",
  "similarityMatches":[{"type":"Coincidencia para revisar","page":"...","source":"No verificada externamente","fragment":"..."}],
  "aiEstimate":0,
  "aiRisk":"Bajo|Medio|Alto",
  "aiFlags":[{"level":"Bajo|Medio|Alto","page":"...","fragment":"...","reason":"..."}]
}

Incluye las 11 categorías exactas y respeta sus máximos. Limita observaciones a las 12 más relevantes. Para similarityEstimate, no afirmes plagio: estima solo riesgo de similitud textual a partir del documento. Si no hay base suficiente, usa 0 y lista vacía.

ARTÍCULO:
${articleText}`;
}

function extractJson(text) {
  const raw = String(text || '').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start,end+1));
  throw new Error('La IA no devolvió JSON válido.');
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),timeoutMs);
  try { return await fetch(url,{...options,signal:controller.signal}); }
  finally { clearTimeout(timer); }
}

async function callModel(model, prompt) {
  const key = resolveKey(model);
  if (!key) throw new Error(`Sin API key para ${model.provider}`);
  const timeoutMs = clamp(model.timeout || 90,20,180) * 1000;
  const isGemini = /gemini/i.test(model.provider) || /generativelanguage/i.test(model.endpoint || '');
  let url = model.endpoint;
  let headers = {'Content-Type':'application/json'};
  let body;
  if (isGemini) {
    url = String(url || GEMINI_ENDPOINT).replace(/\{modelo\}|\{model\}/gi,String(model.model||'').replace(/^models\//,''));
    headers['x-goog-api-key'] = key;
    body = {contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:clamp(model.temperature ?? .2,0,1),maxOutputTokens:Math.min(Number(model.tokens)||6000,7000),responseMimeType:'application/json'}};
  } else {
    headers.Authorization = `Bearer ${key}`;
    if (/openrouter/i.test(model.provider)) {
      headers['HTTP-Referer'] = 'https://jeffer91.github.io/Revisor-Articulos/';
      headers['X-Title'] = 'Revisión Académica ITSQMET';
    }
    body = {model:model.model,messages:[{role:'user',content:prompt}],temperature:clamp(model.temperature ?? .2,0,1),max_tokens:Math.min(Number(model.tokens)||6000,7000),response_format:{type:'json_object'}};
  }
  let lastErr;
  for (const delay of [0,1200,2800]) {
    if (delay) await sleep(delay);
    try {
      const res = await fetchWithTimeout(url,{method:'POST',headers,body:JSON.stringify(body)},timeoutMs);
      const data = await res.json().catch(()=>({}));
      if (!res.ok) {
        const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
        if ([429,503].includes(res.status)) { lastErr = new Error(msg); continue; }
        throw new Error(msg);
      }
      const text = isGemini ? data?.candidates?.[0]?.content?.parts?.[0]?.text : data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('Respuesta vacía del modelo.');
      return {json:extractJson(text),usage:data?.usage || null};
    } catch (err) {
      lastErr = err;
      if (!/abort|timeout|429|503|high demand|overload|capacity/i.test(String(err.message))) throw err;
    }
  }
  throw lastErr || new Error('No fue posible obtener respuesta.');
}

async function testModel(model) {
  const prompt = 'Devuelve SOLO JSON válido: {"ok":true,"observacion":"Mejora metodológica breve para: Se aplicó una encuesta y los resultados fueron positivos."}';
  const started = Date.now();
  const out = await callModel(model,prompt);
  return {time:((Date.now()-started)/1000).toFixed(1),tokens:out.usage?.total_tokens ?? '—',text:out.json?.observacion || 'Respuesta recibida correctamente.'};
}

app.post('/admin/models/:id/test', requireAdmin, async (req,res)=>{
  const model = models.find(m=>m.id===req.params.id);
  if (!model) return res.status(404).json({message:'IA no encontrada.'});
  try {
    const result = await testModel(model);
    model.lastTest = 'Correcta';
    res.json(result);
  } catch (err) {
    const temporary = /429|503|high demand|temporar|overload|capacity|timeout|abort/i.test(String(err.message));
    model.lastTest = temporary ? 'Saturada' : 'Error';
    res.status(temporary ? 503 : 400).json({message:err.message,temporary});
  }
});

async function extractArticle(file) {
  const name = String(file.originalname || '').toLowerCase();
  if (name.endsWith('.pdf')) {
    const parsed = await pdfParse(file.buffer);
    return parsed.text || '';
  }
  if (name.endsWith('.docx')) {
    const parsed = await mammoth.extractRawText({buffer:file.buffer});
    return parsed.value || '';
  }
  throw new Error('Formato no compatible.');
}

function normalizeReview(json) {
  const byName = new Map(RUBRIC.map(([n,m])=>[n,m]));
  const incoming = Array.isArray(json?.categories) ? json.categories : [];
  const categories = RUBRIC.map(([name,max])=>{
    const row = incoming.find(r=>Array.isArray(r) && String(r[0]).toLowerCase()===name.toLowerCase());
    return [name,max,clamp(row?.[2] ?? 0,0,max)];
  });
  const observations = (Array.isArray(json?.observations)?json.observations:[]).slice(0,12).map(o=>({
    severity:['Crítico','Alto','Medio','Bajo'].includes(o?.severity)?o.severity:'Medio',
    section:String(o?.section||'General').slice(0,100), points:clamp(o?.points||0,0,20),
    page:String(o?.page||o?.section||'Sección no especificada').slice(0,120),
    title:String(o?.title||'Observación').slice(0,180), original:String(o?.original||'').slice(0,700),
    problem:String(o?.problem||'').slice(0,1200), why:String(o?.why||'').slice(0,1200),
    fix:String(o?.fix||'').slice(0,1200), proposal:String(o?.proposal||'').slice(0,1600)
  }));
  return {
    categories, observations,
    critical:(Array.isArray(json?.critical)?json.critical:[]).map(x=>String(x)).slice(0,8),
    plagiarism:clamp(json?.similarityEstimate||0,0,100), plagiarismRisk:String(json?.similarityRisk||'Bajo'),
    plagiarismMatches:(Array.isArray(json?.similarityMatches)?json.similarityMatches:[]).slice(0,8),
    ai:clamp(json?.aiEstimate||0,0,100), aiRisk:String(json?.aiRisk||'Bajo'),
    aiFlags:(Array.isArray(json?.aiFlags)?json.aiFlags:[]).slice(0,8)
  };
}

function median(nums) {
  const a = nums.filter(Number.isFinite).sort((x,y)=>x-y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length/2);
  return a.length%2?a[mid]:(a[mid-1]+a[mid])/2;
}

function riskFromPercent(n) {
  if (n >= 50) return 'Alto';
  if (n >= 25) return 'Medio';
  return 'Bajo';
}

function consolidate(successes, fileName, cedula) {
  const reviews = successes.map(x=>normalizeReview(x.result.json));
  const categories = RUBRIC.map(([name,max],i)=>{
    const score = reviews.reduce((s,r)=>s+(r.categories[i]?.[2]||0),0)/reviews.length;
    return [name,max,Math.round(score*10)/10];
  });
  const score = Math.round(categories.reduce((s,r)=>s+r[2],0)*10)/10;
  const grouped = new Map();
  reviews.forEach((r,ri)=>r.observations.forEach(o=>{
    const key = `${o.section}|${o.title}`.toLowerCase().replace(/\s+/g,' ');
    const prev = grouped.get(key);
    if (prev) { prev.consensus++; prev.reviewers.push(ri+1); if (o.points>prev.points) prev.points=o.points; }
    else grouped.set(key,{...o,consensus:1,reviewers:[ri+1]});
  }));
  const severityRank = {Crítico:4,Alto:3,Medio:2,Bajo:1};
  const observations = [...grouped.values()].sort((a,b)=>(severityRank[b.severity]-severityRank[a.severity])||(b.consensus-a.consensus)).slice(0,18);
  const critical = [...new Set(reviews.flatMap(r=>r.critical))].slice(0,8);
  const plagiarism = Math.round(median(reviews.map(r=>r.plagiarism)));
  const ai = Math.round(median(reviews.map(r=>r.ai));
  return {
    id:crypto.randomUUID(), n:0, date:new Date().toISOString(), file:fileName, cedula,
    score, approved:score>=70, reviewers:reviews.length,
    plagiarism, plagiarismRisk:riskFromPercent(plagiarism),
    ai, aiRisk:riskFromPercent(ai), categories, observations, critical,
    plagiarismMatches:reviews.flatMap(r=>r.plagiarismMatches||[]).slice(0,8),
    aiFlags:reviews.flatMap(r=>r.aiFlags||[]).slice(0,8),
    errors:observations.length,
    reviewModels:successes.map(x=>({id:x.model.id,name:x.model.name,priority:x.model.priority,function:x.model.reviewType}))
  };
}

async function runReview(job, articleText) {
  try {
    job.step = 2;
    const text = articleText.replace(/\u0000/g,' ').trim();
    if (text.length < 700) throw new Error('No se pudo extraer suficiente texto del artículo.');
    const bounded = text.length <= 120000 ? text : `${text.slice(0,90000)}\n\n[...texto intermedio omitido por límite técnico...]\n\n${text.slice(-30000)}`;
    const candidates = models.filter(m=>m.state==='Activa').sort((a,b)=>(a.priority||999)-(b.priority||999));
    const successes = [], failures = [];
    let cursor = 0;
    while (successes.length < 5 && cursor < candidates.length) {
      const need = 5 - successes.length;
      const batch = candidates.slice(cursor,cursor+need);
      cursor += batch.length;
      const settled = await Promise.allSettled(batch.map(async model=>{
        const prompt = buildPrompt(bounded,model);
        const result = await callModel(model,prompt);
        return {model,result};
      }));
      settled.forEach((s,i)=>{
        if (s.status==='fulfilled') successes.push(s.value);
        else failures.push({model:batch[i].name,message:String(s.reason?.message||s.reason)});
      });
    }
    job.step = 6;
    job.failures = failures;
    if (successes.length < 3) {
      job.status = 'incomplete';
      job.message = `Solo respondieron ${successes.length} IA de forma válida. El intento no debe descontarse.`;
      job.reviewers = successes.length;
      return;
    }
    const result = consolidate(successes,job.file,job.cedula);
    result.n = job.n || 1;
    job.result = result;
    job.reviewers = successes.length;
    job.step = 8;
    job.status = 'complete';
  } catch (err) {
    job.status = 'failed'; job.message = err.message; job.error = err.stack; job.step = 8;
  }
}

app.post('/reviews', upload.single('file'), async (req,res)=>{
  const cedula = String(req.body?.cedula || '').trim();
  if (!/^\d{10}$/.test(cedula)) return res.status(400).json({message:'Cédula inválida.'});
  if (!req.file) return res.status(400).json({message:'Debes adjuntar el artículo.'});
  if (!/\.(pdf|docx)$/i.test(req.file.originalname||'')) return res.status(400).json({message:'Solo se aceptan PDF o DOCX.'});
  const id = crypto.randomUUID();
  const job = {id,cedula,file:req.file.originalname,status:'processing',step:1,reviewers:0,createdAt:new Date().toISOString()};
  jobs.set(id,job);
  res.status(202).json({id,status:'processing'});
  try {
    const text = await extractArticle(req.file);
    runReview(job,text);
  } catch (err) {
    job.status='failed'; job.message=err.message; job.step=8;
  }
});

app.get('/reviews/:id/status', (req,res)=>{
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({message:'Revisión no encontrada.'});
  res.json({id:job.id,status:job.status,step:job.step,reviewers:job.reviewers,message:job.message||'',failures:job.status==='processing'?undefined:job.failures});
});
app.get('/reviews/:id', (req,res)=>{
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({message:'Revisión no encontrada.'});
  if (job.status!=='complete') return res.status(409).json({message:'La revisión todavía no está completa.',status:job.status});
  res.json(job.result);
});

app.use((err,req,res,next)=>{
  console.error(err);
  if (err.code==='LIMIT_FILE_SIZE') return res.status(413).json({message:'El archivo supera el límite de 8 MB.'});
  res.status(500).json({message:err.message || 'Error interno.'});
});

app.listen(PORT,()=>console.log(`Revisor Artículos API activa en puerto ${PORT}`));
