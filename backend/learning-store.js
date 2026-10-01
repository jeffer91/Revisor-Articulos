const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const store=require('./store');
const {RUBRIC}=require('./catalog');
const hybrid=require('./hybrid');
const shadow=require('./shadow-engine');

const RUBRIC_VERSION='rubric-v4.1';
const VALID_STATUSES=new Set(['Cumple','Parcial alto','Parcial','Parcial bajo','No cumple']);
const uuid=()=>crypto.randomUUID();
const hash=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex');
const flatMicrocriteria=()=>Object.entries(hybrid.MICROCRITERIA).flatMap(([category,rows])=>rows.map(([id,label,weight])=>({id,category,label,weight})));

async function initLearningDb(){
  const sql=fs.readFileSync(path.join(__dirname,'migrations','001_learning_lab.sql'),'utf8');
  await store.pool.query(sql);
  const definition={rubric:RUBRIC,microcriteria:hybrid.MICROCRITERIA,lanes:hybrid.REVIEW_LANES};
  await store.pool.query(`INSERT INTO rubric_versions(code,definition) VALUES($1,$2::jsonb) ON CONFLICT(code) DO UPDATE SET definition=EXCLUDED.definition`,[RUBRIC_VERSION,JSON.stringify(definition)]);
  await store.pool.query(`INSERT INTO model_versions(code,kind,description,metadata) VALUES($1,'shadow',$2,$3::jsonb) ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description,metadata=EXCLUDED.metadata`,[shadow.VERSION,'Motor ITSQMET inicial basado en señales deterministas. Solo comparación; nunca decide la nota.',JSON.stringify({productionDecision:false,requiresHumanValidation:true})]);
}

async function registerResearchArticle(job,articleText){
  await store.pool.query(`INSERT INTO research_articles(job_id,file_name,article_hash,article_text,rubric_version,updated_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(job_id) DO UPDATE SET article_hash=EXCLUDED.article_hash,article_text=EXCLUDED.article_text,rubric_version=EXCLUDED.rubric_version,updated_at=NOW()`,[job.id,job.file||job.file_name||'articulo',hash(articleText),String(articleText||''),RUBRIC_VERSION]);
}

async function savePrediction(jobId,{source,sourceModel,lane='',modelVersion='',payload}){
  await store.pool.query(`INSERT INTO learning_predictions(id,job_id,source,source_model,lane,rubric_version,model_version,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(job_id,source,source_model,lane) DO UPDATE SET payload=EXCLUDED.payload,model_version=EXCLUDED.model_version,updated_at=NOW()`,[uuid(),jobId,source,sourceModel,lane,RUBRIC_VERSION,modelVersion||null,JSON.stringify(payload||{})]);
}

async function saveShadowPrediction(jobId,payload){return savePrediction(jobId,{source:'itsqmet-shadow',sourceModel:'ITSQMET Shadow',modelVersion:shadow.VERSION,payload})}
async function saveExternalPrediction(jobId,model,lane,payload){return savePrediction(jobId,{source:'external',sourceModel:String(model?.id||model?.name||'external'),lane:String(lane?.id||lane?.label||''),modelVersion:String(model?.model||''),payload})}

function externalMicrocriteria(result){
  return Array.isArray(result?.microcriteria)?result.microcriteria:[];
}

async function getLabReview(jobId){
  const [article,predictions,validations,job]=await Promise.all([
    store.pool.query(`SELECT job_id,file_name,article_hash,rubric_version,legacy_score,created_at,updated_at FROM research_articles WHERE job_id=$1`,[jobId]),
    store.pool.query(`SELECT source,source_model,lane,model_version,payload,created_at,updated_at FROM learning_predictions WHERE job_id=$1 ORDER BY source,created_at`,[jobId]),
    store.pool.query(`SELECT microcriterion_id,final_status,evidence,note,validator,validated_at FROM human_validations WHERE job_id=$1`,[jobId]),
    store.pool.query(`SELECT id,status,file_name,result,created_at,updated_at FROM review_jobs WHERE id=$1 AND cedula ~ '^99[0-9]{8}$'`,[jobId])
  ]);
  if(!job.rows[0]||!article.rows[0])return null;
  const shadowRow=predictions.rows.find(x=>x.source==='itsqmet-shadow');
  const shadowItems=Array.isArray(shadowRow?.payload?.items)?shadowRow.payload.items:[];
  const external=externalMicrocriteria(job.rows[0].result);
  const human=new Map(validations.rows.map(x=>[x.microcriterion_id,x]));
  const shadowMap=new Map(shadowItems.map(x=>[x.id,x])),externalMap=new Map(external.map(x=>[x.id,x]));
  const rows=flatMicrocriteria().map(m=>({
    ...m,
    shadow:shadowMap.get(m.id)||null,
    external:externalMap.get(m.id)||null,
    validation:human.get(m.id)||null
  }));
  return {jobId,file:article.rows[0].file_name,status:job.rows[0].status,rubricVersion:article.rows[0].rubric_version,shadowVersion:shadowRow?.model_version||shadow.VERSION,legacyScore:article.rows[0].legacy_score,createdAt:article.rows[0].created_at,rows,externalPredictions:predictions.rows.filter(x=>x.source==='external').map(x=>({sourceModel:x.source_model,lane:x.lane,modelVersion:x.model_version,createdAt:x.created_at})),validated:validations.rows.length,total:rows.length};
}

function excerptAround(text,evidence,microId){
  const source=String(text||''),needle=String(evidence||'').replace(/^…|…$/g,'').trim();
  if(needle.length>=25){const idx=source.toLowerCase().indexOf(needle.slice(0,80).toLowerCase());if(idx>=0)return source.slice(Math.max(0,idx-180),Math.min(source.length,idx+620)).replace(/\s+/g,' ').trim()}
  const signal=flatMicrocriteria().find(x=>x.id===microId)?.label.split(/\s+/).find(x=>x.length>7)||'';
  if(signal){const idx=source.toLowerCase().indexOf(signal.toLowerCase());if(idx>=0)return source.slice(Math.max(0,idx-180),Math.min(source.length,idx+620)).replace(/\s+/g,' ').trim()}
  return source.slice(0,800).replace(/\s+/g,' ').trim();
}

async function validate(jobId,input={}){
  const microcriterionId=String(input.microcriterionId||''),finalStatus=String(input.finalStatus||''),note=String(input.note||'').slice(0,1200),evidence=String(input.evidence||'').slice(0,1800);
  const known=flatMicrocriteria().find(x=>x.id===microcriterionId);
  if(!known)throw Object.assign(new Error('Microcriterio no reconocido.'),{status:400});
  if(!VALID_STATUSES.has(finalStatus))throw Object.assign(new Error('Estado de validación no reconocido.'),{status:400});
  const client=await store.pool.connect();
  try{
    await client.query('BEGIN');
    const article=await client.query(`SELECT article_text,rubric_version FROM research_articles WHERE job_id=$1 FOR UPDATE`,[jobId]);
    if(!article.rows[0])throw Object.assign(new Error('Revisión de investigación no encontrada.'),{status:404});
    const validationId=uuid();
    const saved=await client.query(`INSERT INTO human_validations(id,job_id,microcriterion_id,final_status,evidence,note,rubric_version) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(job_id,microcriterion_id) DO UPDATE SET final_status=EXCLUDED.final_status,evidence=EXCLUDED.evidence,note=EXCLUDED.note,validated_at=NOW() RETURNING id,validated_at`,[validationId,jobId,microcriterionId,finalStatus,evidence,note,article.rows[0].rubric_version]);
    const actualValidationId=saved.rows[0].id,excerpt=excerptAround(article.rows[0].article_text,evidence,microcriterionId);
    const target={finalStatus,evidence,note,label:known.label,category:known.category,weight:known.weight};
    await client.query(`INSERT INTO training_examples(id,validation_id,job_id,microcriterion_id,article_excerpt,target,rubric_version,status) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'validated') ON CONFLICT(validation_id) DO UPDATE SET article_excerpt=EXCLUDED.article_excerpt,target=EXCLUDED.target,status='validated',updated_at=NOW()`,[uuid(),actualValidationId,jobId,microcriterionId,excerpt,JSON.stringify(target),article.rows[0].rubric_version]);
    await client.query('COMMIT');
    return {ok:true,microcriterionId,finalStatus,validatedAt:saved.rows[0].validated_at};
  }catch(err){try{await client.query('ROLLBACK')}catch{}throw err}finally{client.release()}
}

async function listJobs(limit=50){
  const safe=Math.max(1,Math.min(100,Number(limit)||50));
  const {rows}=await store.pool.query(`SELECT a.job_id,a.file_name,a.rubric_version,a.legacy_score,a.created_at,j.status,COALESCE(v.validated,0)::int AS validated FROM research_articles a JOIN review_jobs j ON j.id=a.job_id LEFT JOIN (SELECT job_id,COUNT(*)::int AS validated FROM human_validations GROUP BY job_id) v ON v.job_id=a.job_id ORDER BY a.created_at DESC LIMIT $1`,[safe]);
  return rows;
}

async function stats(){
  const {rows}=await store.pool.query(`SELECT (SELECT COUNT(*)::int FROM research_articles) AS articles,(SELECT COUNT(*)::int FROM human_validations) AS validations,(SELECT COUNT(*)::int FROM training_examples WHERE status='validated') AS examples,(SELECT COUNT(DISTINCT job_id)::int FROM human_validations) AS reviewed_articles`);
  return {...rows[0],rubricVersion:RUBRIC_VERSION,shadowVersion:shadow.VERSION,totalMicrocriteria:flatMicrocriteria().length};
}

async function dataset(limit=200){
  const safe=Math.max(1,Math.min(500,Number(limit)||200));
  const {rows}=await store.pool.query(`SELECT t.id,t.job_id,t.microcriterion_id,t.article_excerpt,t.target,t.rubric_version,t.created_at,a.file_name FROM training_examples t JOIN research_articles a ON a.job_id=t.job_id WHERE t.status='validated' ORDER BY t.updated_at DESC LIMIT $1`,[safe]);
  return rows;
}

module.exports={RUBRIC_VERSION,VALID_STATUSES,initLearningDb,registerResearchArticle,saveShadowPrediction,saveExternalPrediction,getLabReview,validate,listJobs,stats,dataset};
