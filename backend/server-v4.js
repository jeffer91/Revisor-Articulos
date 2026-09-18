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
  if(Array.isArray(out.criticalConfirmations))out.criticalConfirmations=out.criticalConfirmations.map(x=>({candidateId:x.candidateId,confirmed:!!x.confirmed,pending:!!x.pending,impact:x.impact,reason:x.reason}));
  return out;
}
function publicStudentState(state){return {...state,reviews:(state?.reviews||[]).map(publicResult)}}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const HEDGE_DELAY_MS=22000;

async function setProvider(job,model,status,message='',latencyMs=null,lane=null){
  job.providerStatuses[model.id]={name:model.name,provider:model.provider,status,message:String(message||'').slice(0,500),latencyMs,lane:lane?.label||'',updatedAt:new Date().toISOString()};
  await store.updateModelReviewHealth(model,status,message,job.id,latencyMs);
  await store.persistJob(job);
}

async function attemptProvider(job,model,clean,failures,lane,automatic){
  const started=Date.now();await setProvider(job,model,'Procesando',`Carril: ${lane.label}`,null,lane);
  try{
    const article=hybrid.articleForLane(clean,model,lane),prompt=hybrid.buildSpecializedPrompt(article,model,lane,automatic);
    const runtimeModel={...model,timeout:Math.min(Math.max(Number(model.timeout)||90,105),140)};
    const result=await ai.callModel(runtimeModel,prompt);
    hybrid.validateLaneResponse(result,lane);
    const latency=Date.now()-started;
    await setProvider(job,model,'Correcta',`Carril: ${lane.label}`,latency,lane);
    console.log(`[review ${job.id}] ${model.provider}/${model.name} [${lane.id}]: OK ${latency}ms`);
    return {ok:true,model,result,lane,latencyMs:latency};
  }catch(err){
    const latency=Date.now()-started,message=String(err?.message||err),status=ai.classifyFailure(message);
    failures.push({model:model.name,provider:model.provider,lane:lane.label,status,message});job.failures=failures;
    await setProvider(job,model,status,`Carril: ${lane.label} · ${message}`,latency,lane);
    console.warn(`[review ${job.id}] ${model.provider}/${model.name} [${lane.id}]: ${status} - ${message}`);
    return {ok:false,model,lane,status,message,latencyMs:latency};
  }
}

function isStableBackup(model){
  return model.stableBackup===true||/respaldo estable/i.test(String(model.reviewType||model.specialty||''));
}

function modelLaneScore(model,lane){
  const role=String(model.reviewType||model.specialty||'').toLowerCase();
  let score=(Number(model.priority)||50)*4;
  if(lane.id==='problem-foundation'){
    if(/coher|formato/.test(role))score-=55; else if(/general/.test(role))score-=34; else if(/redacci|contraste/.test(role))score-=24; else if(/metodolog|estad[ií]st|razonamiento/.test(role))score+=15;
  }else if(lane.id==='methodology-analysis'){
    if(/metodolog/.test(role))score-=65; else if(/estad[ií]st|razonamiento/.test(role))score-=48; else if(/general|cr[ií]tico/.test(role))score-=24; else if(/redacci|formato/.test(role))score+=15;
  }else if(lane.id==='results-closure'){
    if(/contraste|respaldo/.test(role))score-=58; else if(/redacci/.test(role))score-=52; else if(/cr[ií]tico/.test(role))score-=34; else if(/general|coher|formato/.test(role))score-=24; else if(/metodolog|estad[ií]st/.test(role))score+=12;
  }
  const rate=Number(model.successRate);if(Number.isFinite(rate))score+=(100-rate)*0.55;
  const latency=Number(model.averageLatencyMs||0);if(latency>0)score+=Math.min(35,latency/1800);
  score+=Math.min(45,Number(model.consecutiveFailures||0)*15);
  if(store.operationalState(model)==='Degradada')score+=28;
  if(isStableBackup(model))score+=180;
  return score;
}
function rankedForLane(candidates,lane,{stable=false}={}){
  return [...candidates].filter(m=>stable?isStableBackup(m):!isStableBackup(m)).sort((a,b)=>modelLaneScore(a,lane)-modelLaneScore(b,lane));
}

async function runHedgedPair(job,lane,primary,hedge,clean,failures,automatic,attempted){
  if(!primary)return null;
  attempted.add(primary.id);
  const p1=attemptProvider(job,primary,clean,failures,lane,automatic);
  if(!hedge){const r=await p1;return r.ok?r:null;}
  let p2=null,started=false;
  const startHedge=()=>{if(started)return p2;started=true;attempted.add(hedge.id);p2=attemptProvider(job,hedge,clean,failures,lane,automatic);return p2;};
  const first=await Promise.race([p1.then(r=>({kind:'primary',r})),sleep(HEDGE_DELAY_MS).then(()=>({kind:'timer'}))]);
  if(first.kind==='primary'){
    if(first.r.ok)return first.r;
    const r2=await startHedge();return r2.ok?r2:null;
  }
  job.message=`El carril "${lane.label}" está tardando más de lo esperado. Se activó un revisor alternativo.`;await store.persistJob(job);
  const second=startHedge();
  const winner=await Promise.race([p1.then(r=>({which:1,r})),second.then(r=>({which:2,r}))]);
  if(winner.r.ok)return winner.r;
  const other=winner.which===1?await second:await p1;
  return other.ok?other:null;
}

async function tryFreshAlternatives(job,lane,candidates,clean,failures,automatic,attempted,successfulIds){
  while(true){
    const model=rankedForLane(candidates,lane).find(m=>!attempted.has(m.id)&&!successfulIds.has(m.id));
    if(!model)return null;
    attempted.add(model.id);job.message=`Buscando un revisor alternativo para "${lane.label}".`;await store.persistJob(job);
    const out=await attemptProvider(job,model,clean,failures,lane,automatic);if(out.ok)return out;
  }
}

async function tryEmergencyReuse(job,lane,candidates,clean,failures,automatic,attempted){
  for(const model of rankedForLane(candidates,lane)){
    if(attempted.has(model.id))continue;
    attempted.add(model.id);job.message=`Modo de continuidad activado para "${lane.label}". Se reutilizará un revisor operativo.`;await store.persistJob(job);
    const out=await attemptProvider(job,model,clean,failures,lane,automatic);if(out.ok)return out;
  }
  return null;
}

async function tryStableBackup(job,lane,stableModels,clean,failures,automatic,attempted){
  for(const model of rankedForLane(stableModels,lane,{stable:true})){
    if(attempted.has(model.id))continue;
    attempted.add(model.id);job.message=`Activando el respaldo estable para completar "${lane.label}".`;await store.persistJob(job);
    const out=await attemptProvider(job,model,clean,failures,lane,automatic);if(out.ok)return out;
  }
  return null;
}

async function runReview(job,articleText){
  try{
    const clean=String(articleText||'').replace(/\u0000/g,' ').trim();if(clean.length<700)throw new Error('No se pudo extraer suficiente texto del artículo.');
    const automatic=hybrid.analyzeAutomatic(clean);job.step=2;job.message='Validaciones automáticas completadas. Seleccionando revisores disponibles.';
    job.providerStatuses={automatic:{name:'Validación automática',provider:'Motor interno',status:'Correcta',message:`${automatic.wordCount} palabras · señal formal ${automatic.formalStructureScore}/6`,updatedAt:new Date().toISOString()}};
    job.failures=[];await store.persistJob(job);

    const models=await store.loadModels(),active=models.filter(m=>m.state==='Activa'),failures=[],selectable=[],stable=[];
    for(const m of active){
      const problem=store.configurationProblem(m),op=store.operationalState(m);
      if(problem||op==='Error de configuración'){
        const message=problem||m.configurationErrorMessage||m.lastReviewMessage||'Configuración inválida.';
        job.providerStatuses[m.id]={name:m.name,provider:m.provider,status:'Error de configuración',message,updatedAt:new Date().toISOString()};
        failures.push({model:m.name,provider:m.provider,status:'Error de configuración',message});continue;
      }
      if(op==='En espera'){
        job.providerStatuses[m.id]={name:m.name,provider:m.provider,status:'En espera',message:`Circuit breaker activo hasta ${m.circuitOpenUntil||'más tarde'}.`,updatedAt:new Date().toISOString()};continue;
      }
      job.providerStatuses[m.id]={name:m.name,provider:m.provider,status:'Disponible',message:'',updatedAt:new Date().toISOString()};
      if(store.isModelSelectable(m))(isStableBackup(m)?stable:selectable).push(m);
    }
    job.failures=failures;await store.persistJob(job);
    if(!selectable.length&&!stable.length){job.status='incomplete';job.step=6;job.message='No hay revisores operativos en este momento. Tu intento no fue descontado.';await store.persistJob(job);return;}

    const lanes=hybrid.REVIEW_LANES,successes=[],attemptedByLane=new Map(lanes.map(l=>[l.id,new Set()])),allocations=new Map(),reserved=new Set();
    for(const lane of lanes){
      const ranked=rankedForLane(selectable,lane),primary=ranked.find(m=>!reserved.has(m.id))||ranked[0]||null;
      if(primary)reserved.add(primary.id);allocations.set(lane.id,{primary,hedge:null});
    }
    const hedgeReserved=new Set(reserved);
    for(const lane of lanes){
      const primary=allocations.get(lane.id).primary;
      const hedge=rankedForLane(selectable,lane).find(m=>m.id!==primary?.id&&!hedgeReserved.has(m.id))||null;
      if(hedge)hedgeReserved.add(hedge.id);allocations.get(lane.id).hedge=hedge;
    }

    job.message='Evaluando los 3 carriles académicos con revisores especializados.';await store.persistJob(job);
    const initial=await Promise.all(lanes.map(async lane=>{const {primary,hedge}=allocations.get(lane.id);return runHedgedPair(job,lane,primary,hedge,clean,failures,automatic,attemptedByLane.get(lane.id));}));
    for(const out of initial)if(out)successes.push(out);

    let unresolved=lanes.filter(l=>!successes.some(s=>s.lane.id===l.id)),successfulIds=new Set(successes.map(s=>s.model.id));
    if(unresolved.length){
      for(const lane of [...unresolved]){
        const out=await tryFreshAlternatives(job,lane,selectable,clean,failures,automatic,attemptedByLane.get(lane.id),successfulIds);
        if(out){successes.push(out);successfulIds.add(out.model.id);}
      }
      unresolved=lanes.filter(l=>!successes.some(s=>s.lane.id===l.id));
    }

    for(const lane of [...unresolved]){
      const out=await tryEmergencyReuse(job,lane,selectable.filter(m=>successfulIds.has(m.id)),clean,failures,automatic,attemptedByLane.get(lane.id));
      if(out)successes.push(out);
    }
    unresolved=lanes.filter(l=>!successes.some(s=>s.lane.id===l.id));
    for(const lane of [...unresolved]){const out=await tryStableBackup(job,lane,stable,clean,failures,automatic,attemptedByLane.get(lane.id));if(out)successes.push(out);}
    unresolved=lanes.filter(l=>!successes.some(s=>s.lane.id===l.id));

    job.failures=failures;job.reviewers=successes.length;
    if(unresolved.length||successes.length<3){job.status='incomplete';job.step=6;job.message=`Se completaron ${successes.length} de 3 carriles académicos. Se agotaron los revisores operativos y los mecanismos de respaldo. Tu intento no fue descontado.`;await store.persistJob(job);return;}

    job.step=6;job.message='Los 3 carriles están completos. Consolidando observaciones.';await store.persistJob(job);
    job.providerStatuses.criticalVerification={name:'Confirmación de alertas críticas',provider:'Motor híbrido',status:'Procesando',message:'Verificando solo alertas críticas con una segunda IA independiente.',updatedAt:new Date().toISOString()};await store.persistJob(job);
    const criticalCandidates=hybrid.getCriticalCandidates(successes,automatic);
    const verifierPool=(await store.loadModels()).filter(store.isModelSelectable);
    const criticalConfirmations=criticalCandidates.length?await hybrid.verifyCriticalCandidates(successes,verifierPool,clean,automatic):[];
    const confirmed=criticalConfirmations.filter(x=>x.confirmed).length,pending=criticalConfirmations.filter(x=>x.pending).length;
    job.providerStatuses.criticalVerification={name:'Confirmación de alertas críticas',provider:'Motor híbrido',status:'Correcta',message:criticalCandidates.length?`${criticalCandidates.length} alerta(s) candidata(s); ${confirmed} confirmada(s) y ${pending} pendiente(s).`:'Sin alertas críticas candidatas.',updatedAt:new Date().toISOString()};
    job.step=7;job.message=pending?'Existen alertas críticas pendientes de confirmación independiente; no bloquearán automáticamente la aprobación.':'Confirmación crítica finalizada.';await store.persistJob(job);

    job.result=hybrid.consolidateHybrid(successes,job.file,job.cedula,automatic,criticalConfirmations,clean);job.result.id=job.id;job.status='complete';job.step=8;job.consumesAttempt=true;
    job.message=`Revisión completada con redundancia ${job.result.redundancy==='high'?'alta':job.result.redundancy==='reduced'?'reducida':'mínima'}.`;await store.persistJob(job);
  }catch(err){
    job.status='failed';job.step=6;job.message=`${String(err.message||err)} Tu intento no fue descontado.`;job.consumesAttempt=false;
    try{await store.persistJob(job)}catch(dbErr){console.error('No se pudo persistir el fallo:',dbErr)}
  }
}

const server=http.createServer(async(req,res)=>{
  const origin=cors(req,res);if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}const url=new URL(req.url,'http://localhost');
  try{
    if(req.method==='GET'&&url.pathname==='/health'){const models=await store.loadModels(),active=models.filter(m=>m.state==='Activa'),ready=active.filter(store.isModelSelectable);return json(res,200,{ok:true,service:'Revisor Artículos API',engine:'hybrid-v4-resilient',database:true,models:models.length,active:active.length,ready:ready.length,providers:[...new Set(models.map(m=>m.provider))],time:new Date().toISOString()},origin)}

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

store.initDb().then(()=>server.listen(PORT,'0.0.0.0',()=>console.log(`Revisor Artículos API activa en ${PORT} con motor híbrido v4 resiliente, proporcional y con persistencia PostgreSQL`))).catch(err=>{console.error('No se pudo iniciar el backend:',err);process.exit(1)});
