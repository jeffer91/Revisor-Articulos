const http=require('http');
const crypto=require('crypto');
const {DEFAULT_MODELS}=require('./catalog');
const store=require('./store');
const ai=require('./ai');
const hybrid=require('./hybrid');

const PORT=Number(process.env.PORT||10000);
const ALLOWED_ORIGINS=(process.env.ALLOWED_ORIGINS||'https://jeffer91.github.io,http://localhost:8080,http://127.0.0.1:8080').split(',').map(x=>x.trim()).filter(Boolean);
const ADMIN_LOGIN_HASH=process.env.ADMIN_LOGIN_HASH||'c0d8715a560af5e884b31c8957f8618ef12c2959476f7423e2dbf338872caf9b';
const SESSION_SECRET=process.env.SESSION_SECRET||ADMIN_LOGIN_HASH;
const loginAttempts=new Map();

const sha256=v=>crypto.createHash('sha256').update(v).digest('hex');
const json=(res,status,data,origin='')=>{const h={'Content-Type':'application/json; charset=utf-8','Vary':'Origin'};if(origin&&ALLOWED_ORIGINS.includes(origin))h['Access-Control-Allow-Origin']=origin;res.writeHead(status,h);res.end(JSON.stringify(data))};
function cors(req,res){const origin=String(req.headers.origin||'');if(origin&&ALLOWED_ORIGINS.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS')}return origin}
function readJson(req,limit=3_000_000){return new Promise((resolve,reject)=>{let body='';req.on('data',c=>{body+=c;if(body.length>limit){reject(Object.assign(new Error('Solicitud demasiado grande.'),{status:413}));req.destroy()}});req.on('end',()=>{if(!body)return resolve({});try{resolve(JSON.parse(body))}catch{reject(Object.assign(new Error('JSON inválido.'),{status:400}))}});req.on('error',reject)})}

function signAdminSession(){const payload=Buffer.from(JSON.stringify({type:'admin',exp:Date.now()+8*60*60*1000})).toString('base64url'),sig=crypto.createHmac('sha256',SESSION_SECRET).update(payload).digest('base64url');return `${payload}.${sig}`}
function verifyAdminSession(token){try{const [payload,sig]=String(token||'').split('.');if(!payload||!sig)return false;const expected=crypto.createHmac('sha256',SESSION_SECRET).update(payload).digest('base64url');if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return false;const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return data.type==='admin'&&Number(data.exp)>Date.now()}catch{return false}}
function requireAdmin(req,res,origin){const a=String(req.headers.authorization||''),token=a.startsWith('Bearer ')?a.slice(7):'';if(!verifyAdminSession(token)){json(res,401,{message:'Sesión administrativa no válida.'},origin);return false}return true}

function publicResult(result){
  if(!result||typeof result!=='object')return result;
  const out=JSON.parse(JSON.stringify(result));
  delete out.reviewModels;
  if(Array.isArray(out.criticalConfirmations))out.criticalConfirmations=out.criticalConfirmations.map(x=>({candidateId:x.candidateId,confirmed:!!x.confirmed,impact:x.impact,reason:x.reason}));
  return out;
}
function publicStudentState(state){return {...state,reviews:(state?.reviews||[]).map(publicResult)}}

async function setProvider(job,model,status,message='',latencyMs=null,lane=null){
  job.providerStatuses[model.id]={name:model.name,provider:model.provider,status,message:String(message||'').slice(0,500),latencyMs,lane:lane?.label||'',updatedAt:new Date().toISOString()};
  await store.updateModelReviewHealth(model,status,message,job.id,latencyMs);
  await store.persistJob(job);
}

async function attemptProvider(job,model,clean,successes,failures,lane,automatic){
  const started=Date.now();await setProvider(job,model,'Procesando',`Carril: ${lane.label}`,null,lane);
  try{
    const article=hybrid.articleForLane(clean,model,lane),prompt=hybrid.buildSpecializedPrompt(article,model,lane,automatic);
    const runtimeModel={...model,timeout:Math.min(Number(model.timeout)||90,70)};
    const result=await ai.callModel(runtimeModel,prompt);
    hybrid.validateLaneResponse(result,lane);
    const latency=Date.now()-started;
    successes.push({model,result,lane});job.reviewers=successes.length;job.step=Math.min(6,2+successes.length);
    await setProvider(job,model,'Correcta',`Carril: ${lane.label}`,latency,lane);
    console.log(`[review ${job.id}] ${model.provider}/${model.name} [${lane.id}]: OK ${latency}ms`);return true;
  }catch(err){
    const latency=Date.now()-started,message=String(err?.message||err),status=ai.classifyFailure(message);
    failures.push({model:model.name,provider:model.provider,lane:lane.label,status,message});job.failures=failures;
    await setProvider(job,model,status,`Carril: ${lane.label} · ${message}`,latency,lane);
    console.warn(`[review ${job.id}] ${model.provider}/${model.name} [${lane.id}]: ${status} - ${message}`);return false;
  }
}

async function runReview(job,articleText){
  try{
    const clean=String(articleText||'').replace(/\u0000/g,' ').trim();if(clean.length<700)throw new Error('No se pudo extraer suficiente texto del artículo.');
    const automatic=hybrid.analyzeAutomatic(clean);job.step=2;
    job.providerStatuses={automatic:{name:'Validación automática',provider:'Motor interno',status:'Correcta',message:`${automatic.wordCount} palabras · señal formal ${automatic.formalStructureScore}/6`,updatedAt:new Date().toISOString()}};
    job.failures=[];await store.persistJob(job);

    const models=await store.loadModels(),active=models.filter(m=>m.state==='Activa').sort((a,b)=>(Number(a.priority)||999)-(Number(b.priority)||999));
    const successes=[],failures=[],candidates=[];
    for(const m of active){
      const problem=store.configurationProblem(m);
      if(problem){job.providerStatuses[m.id]={name:m.name,provider:m.provider,status:'Sin configurar',message:problem,updatedAt:new Date().toISOString()};failures.push({model:m.name,provider:m.provider,status:'Sin configurar',message:problem});await store.updateModelReviewHealth(m,'Sin configurar',problem,job.id)}
      else{job.providerStatuses[m.id]={name:m.name,provider:m.provider,status:'No participó',message:'',updatedAt:new Date().toISOString()};candidates.push(m)}
    }
    job.failures=failures;await store.persistJob(job);
    if(candidates.length<3){job.status='incomplete';job.step=6;job.message=`Solo hay ${candidates.length} proveedores configurados y disponibles. Se requieren al menos 3. Tu intento no fue descontado.`;await store.persistJob(job);return}

    const lanes=hybrid.REVIEW_LANES,used=new Set();let cursor=0;const initial=[];
    for(const lane of lanes){const model=candidates[cursor++];if(!model)break;used.add(model.id);initial.push(attemptProvider(job,model,clean,successes,failures,lane,automatic))}
    await Promise.all(initial);

    let unresolved=lanes.filter(lane=>!successes.some(s=>s.lane.id===lane.id));
    while(unresolved.length&&cursor<candidates.length){
      const batch=[];
      for(const lane of unresolved){while(cursor<candidates.length&&used.has(candidates[cursor].id))cursor++;const model=candidates[cursor++];if(!model)break;used.add(model.id);batch.push(attemptProvider(job,model,clean,successes,failures,lane,automatic))}
      if(!batch.length)break;await Promise.all(batch);unresolved=lanes.filter(lane=>!successes.some(s=>s.lane.id===lane.id));
    }

    job.failures=failures;job.reviewers=successes.length;
    if(unresolved.length||successes.length<3){job.status='incomplete';job.step=6;job.message=`Solo respondieron ${successes.length} proveedores de forma válida. Se requieren 3 carriles académicos completos. Tu intento no fue descontado.`;await store.persistJob(job);return}

    job.step=6;job.providerStatuses.criticalVerification={name:'Confirmación de alertas críticas',provider:'Motor híbrido',status:'Procesando',message:'Verificando únicamente las alertas críticas candidatas con una segunda IA independiente.',updatedAt:new Date().toISOString()};await store.persistJob(job);
    const criticalCandidates=hybrid.getCriticalCandidates(successes,automatic);
    const criticalConfirmations=criticalCandidates.length?await hybrid.verifyCriticalCandidates(successes,candidates,clean,automatic):[];
    const confirmed=criticalConfirmations.filter(x=>x.confirmed).length;
    job.providerStatuses.criticalVerification={name:'Confirmación de alertas críticas',provider:'Motor híbrido',status:'Correcta',message:criticalCandidates.length?`${criticalCandidates.length} alerta(s) candidata(s); ${confirmed} confirmada(s) por segunda IA.`:'Sin alertas críticas candidatas.',updatedAt:new Date().toISOString()};
    job.step=7;await store.persistJob(job);

    job.result=hybrid.consolidateHybrid(successes,job.file,job.cedula,automatic,criticalConfirmations);job.result.id=job.id;job.status='complete';job.step=8;job.consumesAttempt=true;job.message='Revisión académica proporcional por microcriterios completada correctamente.';await store.persistJob(job);
  }catch(err){job.status='failed';job.step=6;job.message=String(err.message||err);job.consumesAttempt=false;try{await store.persistJob(job)}catch(dbErr){console.error('No se pudo persistir el fallo:',dbErr)}}
}

const server=http.createServer(async(req,res)=>{
  const origin=cors(req,res);if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}const url=new URL(req.url,'http://localhost');
  try{
    if(req.method==='GET'&&url.pathname==='/health'){const models=await store.loadModels(),active=models.filter(m=>m.state==='Activa'),ready=active.filter(m=>!store.configurationProblem(m));return json(res,200,{ok:true,service:'Revisor Artículos API',engine:'hybrid-v4-proportional',database:true,models:models.length,active:active.length,ready:ready.length,providers:[...new Set(models.map(m=>m.provider))],time:new Date().toISOString()},origin)}

    if(req.method==='POST'&&url.pathname==='/admin/login'){
      const body=await readJson(req),ip=req.socket.remoteAddress||'unknown',now=Date.now(),rec=loginAttempts.get(ip)||{count:0,until:0};
      if(rec.until>now)return json(res,429,{message:'Demasiados intentos. Intenta nuevamente en unos minutos.'},origin);
      const hash=sha256(`${String(body.usuario||'').trim()}:${String(body.pin||'').trim()}`);if(hash!==ADMIN_LOGIN_HASH){rec.count++;if(rec.count>=7){rec.until=now+600000;rec.count=0}loginAttempts.set(ip,rec);return json(res,401,{message:'Usuario o PIN incorrectos.'},origin)}
      loginAttempts.delete(ip);return json(res,200,{token:signAdminSession(),expiresIn:28800},origin);
    }

    if(url.pathname.startsWith('/admin/')){
      if(!requireAdmin(req,res,origin))return;
      if(req.method==='GET'&&url.pathname==='/admin/models')return json(res,200,(await store.loadModels()).map(store.cleanModel),origin);
      if(req.method==='GET'&&url.pathname==='/admin/jobs')return json(res,200,await store.listJobs(),origin);
      if(req.method==='POST'&&url.pathname==='/admin/models/sync'){
        const body=await readJson(req),incoming=Array.isArray(body.models)?body.models:[],current=await store.loadModels();
        for(const item of incoming){const old=current.find(x=>x.id===item.id)||DEFAULT_MODELS.find(x=>x.id===item.id)||{};await store.saveModelConfig({...old,...item,id:item.id},'')}
        return json(res,200,(await store.loadModels()).map(store.cleanModel),origin);
      }
      const grant=url.pathname.match(/^\/admin\/students\/(\d{10})\/grant$/);if(req.method==='POST'&&grant){const body=await readJson(req);return json(res,200,await store.grantAttempts(grant[1],body.count),origin)}
      const restore=url.pathname.match(/^\/admin\/reviews\/([0-9a-f-]+)\/restore$/i);if(req.method==='POST'&&restore){await store.restoreAttempt(restore[1]);return json(res,200,{ok:true},origin)}
      const match=url.pathname.match(/^\/admin\/models\/([^/]+)(\/test)?$/);
      if(match){
        const id=decodeURIComponent(match[1]),model=(await store.loadModels()).find(m=>m.id===id);if(!model)return json(res,404,{message:'IA no encontrada.'},origin);
        if(req.method==='POST'&&match[2]==='/test'){
          try{const out=await ai.testModel(model);await store.updateModelTest(id,'Correcta','');return json(res,200,out,origin)}
          catch(err){const msg=String(err.message||err),temporary=ai.classifyFailure(msg)==='Saturada';await store.updateModelTest(id,temporary?'Saturada':'Error',msg);return json(res,temporary?503:400,{message:msg,temporary},origin)}
        }
        if(req.method==='PUT'&&!match[2]){const body=await readJson(req),saved=await store.saveModelConfig({...model,...body,id},body.apiKey||'');return json(res,200,store.cleanModel(saved),origin)}
      }
      if(req.method==='POST'&&url.pathname==='/admin/models'){const body=await readJson(req),id=body.id||`model-${Date.now()}`,saved=await store.saveModelConfig({...body,id},body.apiKey||'');return json(res,200,store.cleanModel(saved),origin)}
      return json(res,404,{message:'Ruta administrativa no encontrada.'},origin);
    }

    const state=url.pathname.match(/^\/students\/(\d{10})\/state$/);if(req.method==='GET'&&state)return json(res,200,publicStudentState(await store.getStudentState(state[1])),origin);

    if(req.method==='POST'&&url.pathname==='/reviews'){
      const body=await readJson(req,3_000_000),cedula=String(body.cedula||'').trim(),fileName=String(body.fileName||'articulo').slice(0,180),articleText=String(body.articleText||'');
      if(!/^\d{10}$/.test(cedula))return json(res,400,{message:'Cédula inválida.'},origin);if(articleText.length<700)return json(res,400,{message:'No se pudo extraer suficiente texto del artículo.'},origin);
      const student=await store.getStudentState(cedula);if(student.available<=0)return json(res,403,{message:'No tienes revisiones disponibles.'},origin);
      const id=crypto.randomUUID(),job={id,cedula,file:fileName,status:'processing',step:1,reviewers:0,message:'',failures:[],providerStatuses:{},result:null,consumesAttempt:false};await store.createJob(job);runReview(job,articleText).catch(err=>console.error('runReview:',err));return json(res,202,{id,status:'processing'},origin);
    }

    const status=url.pathname.match(/^\/reviews\/([0-9a-f-]+)\/status$/i);if(req.method==='GET'&&status){const job=await store.getJob(status[1]);if(!job)return json(res,404,{message:'Revisión no encontrada.'},origin);return json(res,200,{id:job.id,status:job.status,step:job.step,reviewers:job.reviewers,message:job.message||''},origin)}
    const result=url.pathname.match(/^\/reviews\/([0-9a-f-]+)$/i);if(req.method==='GET'&&result){const job=await store.getJob(result[1]);if(!job)return json(res,404,{message:'Revisión no encontrada.'},origin);if(job.status!=='complete')return json(res,409,{message:'La revisión todavía no está completa.',status:job.status},origin);return json(res,200,publicResult(job.result),origin)}
    return json(res,404,{message:'Ruta no encontrada.'},origin);
  }catch(err){console.error(err);return json(res,err.status||500,{message:String(err.message||err)},origin)}
});

store.initDb().then(()=>server.listen(PORT,'0.0.0.0',()=>console.log(`Revisor Artículos API activa en ${PORT} con motor híbrido v4 proporcional por microcriterios y persistencia PostgreSQL`))).catch(err=>{console.error('No se pudo iniciar el backend:',err);process.exit(1)});
