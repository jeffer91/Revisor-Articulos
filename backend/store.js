const crypto = require('crypto');
const { Pool } = require('pg');
const { DEFAULT_MODELS } = require('./catalog');

const DATABASE_URL = process.env.DATABASE_URL || '';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
if (!DATABASE_URL) throw new Error('DATABASE_URL no configurada.');
if (!ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY no configurada.');

const pool = new Pool({ connectionString:DATABASE_URL, max:5, idleTimeoutMillis:30000 });
const encryptionKey = /^[a-f0-9]{64}$/i.test(ENCRYPTION_KEY)
  ? Buffer.from(ENCRYPTION_KEY,'hex')
  : crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

const iso = v => v ? new Date(v).toISOString() : null;

function encryptSecret(value){
  if(!value) return null;
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey,iv);
  const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64url')).join('.');
}
function decryptSecret(payload){
  if(!payload) return '';
  try{
    const [iv,tag,data]=String(payload).split('.').map(x=>Buffer.from(x,'base64url'));
    const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey,iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
  }catch(err){ console.error('No se pudo descifrar una API key:',err.message); return ''; }
}

async function initDb(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_models(
      id TEXT PRIMARY KEY, config JSONB NOT NULL, api_key_enc TEXT,
      last_test TEXT NOT NULL DEFAULT 'Sin probar', last_test_at TIMESTAMPTZ, last_test_message TEXT,
      last_review_status TEXT NOT NULL DEFAULT 'Sin revisión', last_review_at TIMESTAMPTZ,
      last_review_message TEXT, last_review_job TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS failure_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS saturation_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS average_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0;
    ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS circuit_open_until TIMESTAMPTZ;
    ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS configuration_error BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS configuration_error_message TEXT;
    ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;
    ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ;
    ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS health_metrics_version INTEGER NOT NULL DEFAULT 1;
    UPDATE ai_models
      SET success_count=0,failure_count=0,saturation_count=0,consecutive_failures=0,average_latency_ms=0,
          circuit_open_until=NULL,health_metrics_version=2
      WHERE health_metrics_version<2;
    UPDATE ai_models
      SET configuration_error=TRUE,
          configuration_error_message=COALESCE(configuration_error_message,last_review_message,last_test_message)
      WHERE configuration_error=FALSE
        AND (
          COALESCE(last_review_message,'') ~* '(wrong api key|invalid api key|user not found|unauthorized|authentication|invalid token|forbidden|401|403)'
          OR COALESCE(last_test_message,'') ~* '(wrong api key|invalid api key|user not found|unauthorized|authentication|invalid token|forbidden|401|403)'
        );
    CREATE TABLE IF NOT EXISTS review_jobs(
      id UUID PRIMARY KEY, cedula TEXT NOT NULL, file_name TEXT NOT NULL, status TEXT NOT NULL,
      step INTEGER NOT NULL DEFAULT 1, reviewers INTEGER NOT NULL DEFAULT 0, message TEXT,
      failures JSONB NOT NULL DEFAULT '[]'::jsonb, provider_statuses JSONB NOT NULL DEFAULT '{}'::jsonb,
      result JSONB, consumes_attempt BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_review_jobs_cedula ON review_jobs(cedula,created_at DESC);
    CREATE TABLE IF NOT EXISTS student_limits(
      cedula TEXT PRIMARY KEY, total_allowed INTEGER NOT NULL DEFAULT 3, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  for(const m of DEFAULT_MODELS){
    await pool.query(`INSERT INTO ai_models(id,config) VALUES($1,$2::jsonb) ON CONFLICT(id) DO NOTHING`,[m.id,JSON.stringify(m)]);
  }
  await pool.query(`UPDATE review_jobs SET status='failed',message='La revisión fue interrumpida por un reinicio del servicio. El intento no fue descontado.',updated_at=NOW() WHERE status='processing' AND updated_at < NOW()-INTERVAL '15 minutes'`);
}

function rowToModel(r){
  return {
    ...r.config,
    apiKeyEnc:r.api_key_enc||'',
    lastTest:r.last_test||'Sin probar',lastTestAt:iso(r.last_test_at),lastTestMessage:r.last_test_message||'',
    lastReviewStatus:r.last_review_status||'Sin revisión',lastReviewAt:iso(r.last_review_at),lastReviewMessage:r.last_review_message||'',lastReviewJob:r.last_review_job||'',
    successCount:Number(r.success_count||0),failureCount:Number(r.failure_count||0),saturationCount:Number(r.saturation_count||0),
    consecutiveFailures:Number(r.consecutive_failures||0),averageLatencyMs:Number(r.average_latency_ms||0),
    circuitOpenUntil:iso(r.circuit_open_until),configurationError:!!r.configuration_error,
    configurationErrorMessage:r.configuration_error_message||'',lastSuccessAt:iso(r.last_success_at),lastFailureAt:iso(r.last_failure_at),
    successRate:(Number(r.success_count||0)+Number(r.failure_count||0))?Math.round(Number(r.success_count||0)/(Number(r.success_count||0)+Number(r.failure_count||0))*100):null
  };
}
async function loadModels(){ const {rows}=await pool.query(`SELECT * FROM ai_models ORDER BY COALESCE((config->>'priority')::int,999),id`); return rows.map(rowToModel); }

function providerEnvKey(model){
  const p=String(model.provider||'').toLowerCase();
  if(p.includes('gemini')) return process.env.GEMINI_API_KEY||'';
  if(p.includes('groq')) return process.env.GROQ_API_KEY||'';
  if(p.includes('mistral')) return process.env.MISTRAL_API_KEY||'';
  if(p.includes('nvidia')) return process.env.NVIDIA_API_KEY||'';
  if(p.includes('cloudflare')) return process.env.CLOUDFLARE_API_TOKEN||'';
  if(p.includes('cerebras')) return process.env.CEREBRAS_API_KEY||'';
  if(p.includes('openrouter')) return process.env.OPENROUTER_API_KEY||'';
  if(p.includes('public ai')) return process.env.PUBLICAI_API_KEY||'';
  return '';
}
function resolveKey(model){ return decryptSecret(model.apiKeyEnc)||providerEnvKey(model)||''; }
function cloudflareAccountId(model){
  const match=String(model.endpoint||'').match(/accounts\/([^/]+)\/ai\//i);
  const inline=match&&match[1]!=='{account_id}'?match[1]:'';
  return String(model.accountId||inline||process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
}
function configurationProblem(model){
  if(!resolveKey(model)) return `Sin API key para ${model.provider}`;
  if(/cloudflare/i.test(model.provider)&&!cloudflareAccountId(model)) return 'Falta el Account ID de Cloudflare.';
  if(!model.endpoint) return 'Falta el endpoint del proveedor.';
  if(!model.model) return 'Falta el identificador del modelo.';
  return '';
}
function permanentConfigurationError(message=''){
  return /wrong api key|invalid api key|api key.*invalid|user not found|unauthori[sz]ed|authentication|invalid token|forbidden|401\b|403\b/i.test(String(message||''));
}
function operationalState(model){
  if(model.state!=='Activa')return 'Inactiva';
  const problem=configurationProblem(model);
  if(problem||model.configurationError)return 'Error de configuración';
  if(model.circuitOpenUntil&&new Date(model.circuitOpenUntil).getTime()>Date.now())return 'En espera';
  const last=String(model.lastReviewStatus||'').toLowerCase();
  if(last.includes('satur')||last.includes('error'))return 'Degradada';
  return 'Operativa';
}
function isModelSelectable(model){
  const state=operationalState(model);
  return model.state==='Activa'&&!configurationProblem(model)&&state!=='Error de configuración'&&state!=='En espera';
}
function cleanModel(m){
  const problem=configurationProblem(m),total=Number(m.successCount||0)+Number(m.failureCount||0);
  const x={...m,keyConfigured:!!resolveKey(m),configurationReady:!problem,configurationProblem:problem,
    operationalState:operationalState(m),
    successRate:total?Math.round(Number(m.successCount||0)/total*100):null,
    averageLatencyMs:Math.round(Number(m.averageLatencyMs||0))
  };
  delete x.apiKeyEnc;
  return x;
}

async function saveModelConfig(model,apiKey=''){
  const config={...model};
  ['apiKey','apiKeyEnc','lastTest','lastTestAt','lastTestMessage','lastReviewStatus','lastReviewAt','lastReviewMessage','lastReviewJob','keyConfigured','configurationReady','configurationProblem','operationalState','successRate','successCount','failureCount','saturationCount','consecutiveFailures','averageLatencyMs','circuitOpenUntil','configurationError','configurationErrorMessage','lastSuccessAt','lastFailureAt'].forEach(k=>delete config[k]);
  const encrypted=apiKey?encryptSecret(apiKey):null;
  await pool.query(`INSERT INTO ai_models(id,config,api_key_enc,updated_at) VALUES($1,$2::jsonb,$3,NOW())
    ON CONFLICT(id) DO UPDATE SET
      config=EXCLUDED.config,
      api_key_enc=COALESCE(EXCLUDED.api_key_enc,ai_models.api_key_enc),
      configuration_error=CASE WHEN EXCLUDED.api_key_enc IS NOT NULL THEN FALSE ELSE ai_models.configuration_error END,
      configuration_error_message=CASE WHEN EXCLUDED.api_key_enc IS NOT NULL THEN NULL ELSE ai_models.configuration_error_message END,
      circuit_open_until=CASE WHEN EXCLUDED.api_key_enc IS NOT NULL THEN NULL ELSE ai_models.circuit_open_until END,
      last_review_status=CASE WHEN EXCLUDED.api_key_enc IS NOT NULL THEN 'Sin revisión' ELSE ai_models.last_review_status END,
      last_review_message=CASE WHEN EXCLUDED.api_key_enc IS NOT NULL THEN NULL ELSE ai_models.last_review_message END,
      updated_at=NOW()`,[model.id,JSON.stringify(config),encrypted]);
  const all=await loadModels(); return all.find(x=>x.id===model.id);
}
async function updateModelTest(id,status,message=''){
  const msg=String(message||'').slice(0,1200),permanent=permanentConfigurationError(msg),saturated=status==='Saturada';
  await pool.query(`UPDATE ai_models SET
    last_test=$2,last_test_at=NOW(),last_test_message=$3,
    configuration_error=CASE WHEN $2='Correcta' THEN FALSE WHEN $4 THEN TRUE ELSE configuration_error END,
    configuration_error_message=CASE WHEN $2='Correcta' THEN NULL WHEN $4 THEN $3 ELSE configuration_error_message END,
    circuit_open_until=CASE WHEN $2='Correcta' THEN NULL WHEN $5 THEN NOW()+INTERVAL '10 minutes' ELSE circuit_open_until END,
    consecutive_failures=CASE WHEN $2='Correcta' THEN 0 ELSE consecutive_failures END,
    last_review_status=CASE WHEN $2='Correcta' AND configuration_error THEN 'Sin revisión' ELSE last_review_status END,
    last_review_message=CASE WHEN $2='Correcta' AND configuration_error THEN NULL ELSE last_review_message END,
    updated_at=NOW()
    WHERE id=$1`,[id,status,msg,permanent,saturated]);
}
async function updateModelReviewHealth(model,status,message='',jobId='',latencyMs=null){
  const raw=String(message||''),detail=(raw+(latencyMs!=null?`${raw?' · ':''}${latencyMs} ms`:'' )).slice(0,1200);
  const permanent=permanentConfigurationError(raw),ok=status==='Correcta',saturated=status==='Saturada';
  const latency=Number.isFinite(Number(latencyMs))?Math.max(0,Number(latencyMs)):null;
  if(['Procesando','Disponible','Cancelada'].includes(status)){
    await pool.query(`UPDATE ai_models SET last_review_status=$2,last_review_at=NOW(),last_review_message=$3,last_review_job=$4,updated_at=NOW() WHERE id=$1`,[model.id,status,detail,jobId]);
    return;
  }
  if(ok){
    await pool.query(`UPDATE ai_models SET
      last_review_status=$2,last_review_at=NOW(),last_review_message=$3,last_review_job=$4,
      success_count=success_count+1,consecutive_failures=0,
      average_latency_ms=CASE WHEN $5::double precision IS NULL THEN average_latency_ms WHEN success_count=0 THEN $5 ELSE ((average_latency_ms*success_count)+$5)/(success_count+1) END,
      circuit_open_until=NULL,configuration_error=FALSE,configuration_error_message=NULL,last_success_at=NOW(),updated_at=NOW()
      WHERE id=$1`,[model.id,status,detail,jobId,latency]);
    return;
  }
  await pool.query(`UPDATE ai_models SET
    last_review_status=$2,last_review_at=NOW(),last_review_message=$3,last_review_job=$4,
    failure_count=failure_count+1,
    saturation_count=saturation_count+CASE WHEN $5 THEN 1 ELSE 0 END,
    consecutive_failures=consecutive_failures+1,
    circuit_open_until=CASE
      WHEN $6 THEN NULL
      WHEN $5 THEN NOW()+CASE WHEN consecutive_failures>=1 THEN INTERVAL '20 minutes' ELSE INTERVAL '10 minutes' END
      WHEN consecutive_failures>=1 THEN NOW()+INTERVAL '15 minutes'
      ELSE circuit_open_until END,
    configuration_error=CASE WHEN $6 THEN TRUE ELSE configuration_error END,
    configuration_error_message=CASE WHEN $6 THEN $3 ELSE configuration_error_message END,
    last_failure_at=NOW(),updated_at=NOW()
    WHERE id=$1`,[model.id,status,detail,jobId,saturated,permanent]);
}

async function createJob(job){ await pool.query(`INSERT INTO review_jobs(id,cedula,file_name,status,step,reviewers,message,failures,provider_statuses,consumes_attempt) VALUES($1,$2,$3,$4,$5,0,'','[]'::jsonb,'{}'::jsonb,FALSE)`,[job.id,job.cedula,job.file,job.status,job.step]); }

async function reserveStudentJob(job){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(`INSERT INTO student_limits(cedula,total_allowed) VALUES($1,3) ON CONFLICT(cedula) DO NOTHING`,[job.cedula]);
    const lim=await client.query(`SELECT total_allowed FROM student_limits WHERE cedula=$1 FOR UPDATE`,[job.cedula]);
    const allowed=Number(lim.rows[0]?.total_allowed||3);
    const usage=await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='complete' AND consumes_attempt=TRUE)::int AS used,
        COUNT(*) FILTER (WHERE status='processing')::int AS processing
      FROM review_jobs WHERE cedula=$1
    `,[job.cedula]);
    const used=Number(usage.rows[0]?.used||0),processing=Number(usage.rows[0]?.processing||0);
    if(used+processing>=allowed){
      await client.query('ROLLBACK');
      return {ok:false,used,processing,allowed,available:Math.max(0,allowed-used-processing)};
    }
    await client.query(`INSERT INTO review_jobs(id,cedula,file_name,status,step,reviewers,message,failures,provider_statuses,consumes_attempt) VALUES($1,$2,$3,$4,$5,0,'','[]'::jsonb,'{}'::jsonb,FALSE)`,[job.id,job.cedula,job.file,job.status,job.step]);
    await client.query('COMMIT');
    return {ok:true,used,processing:processing+1,allowed,available:Math.max(0,allowed-used-processing-1)};
  }catch(err){
    try{await client.query('ROLLBACK')}catch{}
    throw err;
  }finally{client.release()}
}
async function persistJob(job){ await pool.query(`UPDATE review_jobs SET status=$2,step=$3,reviewers=$4,message=$5,failures=$6::jsonb,provider_statuses=$7::jsonb,result=$8::jsonb,consumes_attempt=$9,updated_at=NOW() WHERE id=$1`,[job.id,job.status,job.step,job.reviewers||0,job.message||'',JSON.stringify(job.failures||[]),JSON.stringify(job.providerStatuses||{}),job.result?JSON.stringify(job.result):null,!!job.consumesAttempt]); }
async function getJob(id){
  const {rows}=await pool.query(`SELECT * FROM review_jobs WHERE id=$1`,[id]);
  return rows[0]||null;
}
async function getStudentState(cedula){
  const lim=await pool.query(`SELECT total_allowed FROM student_limits WHERE cedula=$1`,[cedula]); const allowed=Number(lim.rows[0]?.total_allowed||3);
  const usage=await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status='complete' AND consumes_attempt=TRUE)::int AS used,
      COUNT(*) FILTER (WHERE status='processing')::int AS processing
    FROM review_jobs WHERE cedula=$1
  `,[cedula]);
  const used=Number(usage.rows[0]?.used||0),inProgress=Number(usage.rows[0]?.processing||0);
  const rev=await pool.query(`SELECT id,result,created_at FROM review_jobs WHERE cedula=$1 AND status='complete' AND result IS NOT NULL ORDER BY created_at ASC`,[cedula]);
  const reviews=rev.rows.map((r,i)=>({...r.result,id:r.id,n:i+1,date:r.result?.date||r.created_at}));
  return {used,inProgress,allowed,available:Math.max(0,allowed-used-inProgress),reviews};
}
async function grantAttempts(cedula,count=1){ count=Math.max(1,Math.min(20,Number(count)||1)); await pool.query(`INSERT INTO student_limits(cedula,total_allowed) VALUES($1,3+$2) ON CONFLICT(cedula) DO UPDATE SET total_allowed=student_limits.total_allowed+$2,updated_at=NOW()`,[cedula,count]); return getStudentState(cedula); }
async function restoreAttempt(jobId){ await pool.query(`UPDATE review_jobs SET consumes_attempt=FALSE,updated_at=NOW() WHERE id=$1`,[jobId]); }
async function listJobs(){ const {rows}=await pool.query(`
  SELECT r.id,r.cedula,r.file_name,r.status,r.step,r.reviewers,r.message,r.failures,r.provider_statuses,r.result,r.consumes_attempt,r.created_at,r.updated_at,
         COALESCE(sl.total_allowed,3)::int AS total_allowed,
         ROW_NUMBER() OVER (PARTITION BY r.cedula ORDER BY r.created_at ASC)::int AS review_number
  FROM review_jobs r
  LEFT JOIN student_limits sl ON sl.cedula=r.cedula
  ORDER BY r.created_at DESC LIMIT 300
`); return rows; }

module.exports={pool,initDb,loadModels,resolveKey,cloudflareAccountId,configurationProblem,permanentConfigurationError,operationalState,isModelSelectable,cleanModel,saveModelConfig,updateModelTest,updateModelReviewHealth,createJob,reserveStudentJob,persistJob,getJob,getStudentState,grantAttempts,restoreAttempt,listJobs};
