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

function rowToModel(r){ return {...r.config,apiKeyEnc:r.api_key_enc||'',lastTest:r.last_test||'Sin probar',lastTestAt:iso(r.last_test_at),lastTestMessage:r.last_test_message||'',lastReviewStatus:r.last_review_status||'Sin revisión',lastReviewAt:iso(r.last_review_at),lastReviewMessage:r.last_review_message||'',lastReviewJob:r.last_review_job||''}; }
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
function cleanModel(m){ const problem=configurationProblem(m); const x={...m,keyConfigured:!!resolveKey(m),configurationReady:!problem,configurationProblem:problem}; delete x.apiKeyEnc; return x; }

async function saveModelConfig(model,apiKey=''){
  const config={...model};
  ['apiKey','apiKeyEnc','lastTest','lastTestAt','lastTestMessage','lastReviewStatus','lastReviewAt','lastReviewMessage','lastReviewJob','keyConfigured','configurationReady','configurationProblem'].forEach(k=>delete config[k]);
  const encrypted=apiKey?encryptSecret(apiKey):null;
  await pool.query(`INSERT INTO ai_models(id,config,api_key_enc,updated_at) VALUES($1,$2::jsonb,$3,NOW())
    ON CONFLICT(id) DO UPDATE SET config=EXCLUDED.config,api_key_enc=COALESCE(EXCLUDED.api_key_enc,ai_models.api_key_enc),updated_at=NOW()`,[model.id,JSON.stringify(config),encrypted]);
  const all=await loadModels(); return all.find(x=>x.id===model.id);
}
async function updateModelTest(id,status,message=''){ await pool.query(`UPDATE ai_models SET last_test=$2,last_test_at=NOW(),last_test_message=$3,updated_at=NOW() WHERE id=$1`,[id,status,String(message).slice(0,1200)]); }
async function updateModelReviewHealth(model,status,message='',jobId='',latencyMs=null){
  const detail=(String(message||'')+(latencyMs!=null?`${message?' · ':''}${latencyMs} ms`:'' )).slice(0,1200);
  await pool.query(`UPDATE ai_models SET last_review_status=$2,last_review_at=NOW(),last_review_message=$3,last_review_job=$4,updated_at=NOW() WHERE id=$1`,[model.id,status,detail,jobId]);
}

async function createJob(job){ await pool.query(`INSERT INTO review_jobs(id,cedula,file_name,status,step,reviewers,message,failures,provider_statuses,consumes_attempt) VALUES($1,$2,$3,$4,$5,0,'','[]'::jsonb,'{}'::jsonb,FALSE)`,[job.id,job.cedula,job.file,job.status,job.step]); }
async function persistJob(job){ await pool.query(`UPDATE review_jobs SET status=$2,step=$3,reviewers=$4,message=$5,failures=$6::jsonb,provider_statuses=$7::jsonb,result=$8::jsonb,consumes_attempt=$9,updated_at=NOW() WHERE id=$1`,[job.id,job.status,job.step,job.reviewers||0,job.message||'',JSON.stringify(job.failures||[]),JSON.stringify(job.providerStatuses||{}),job.result?JSON.stringify(job.result):null,!!job.consumesAttempt]); }
async function getJob(id){
  const {rows}=await pool.query(`SELECT * FROM review_jobs WHERE id=$1`,[id]); if(!rows[0]) return null; const r=rows[0];
  if(r.status==='processing'&&Date.now()-new Date(r.updated_at).getTime()>15*60*1000){ await pool.query(`UPDATE review_jobs SET status='failed',message='La revisión fue interrumpida. El intento no fue descontado.',updated_at=NOW() WHERE id=$1`,[id]); r.status='failed';r.message='La revisión fue interrumpida. El intento no fue descontado.'; }
  return r;
}
async function getStudentState(cedula){
  const lim=await pool.query(`SELECT total_allowed FROM student_limits WHERE cedula=$1`,[cedula]); const allowed=Number(lim.rows[0]?.total_allowed||3);
  const usedRes=await pool.query(`SELECT COUNT(*)::int n FROM review_jobs WHERE cedula=$1 AND status='complete' AND consumes_attempt=TRUE`,[cedula]); const used=Number(usedRes.rows[0]?.n||0);
  const rev=await pool.query(`SELECT id,result,created_at FROM review_jobs WHERE cedula=$1 AND status='complete' AND result IS NOT NULL ORDER BY created_at ASC`,[cedula]);
  const reviews=rev.rows.map((r,i)=>({...r.result,id:r.id,n:i+1,date:r.result?.date||r.created_at}));
  return {used,allowed,available:Math.max(0,allowed-used),reviews};
}
async function grantAttempts(cedula,count=1){ count=Math.max(1,Math.min(20,Number(count)||1)); await pool.query(`INSERT INTO student_limits(cedula,total_allowed) VALUES($1,$2) ON CONFLICT(cedula) DO UPDATE SET total_allowed=student_limits.total_allowed+$2,updated_at=NOW()`,[cedula,count]); return getStudentState(cedula); }
async function restoreAttempt(jobId){ await pool.query(`UPDATE review_jobs SET consumes_attempt=FALSE,updated_at=NOW() WHERE id=$1`,[jobId]); }
async function listJobs(){ const {rows}=await pool.query(`SELECT id,cedula,file_name,status,step,reviewers,message,failures,provider_statuses,created_at,updated_at FROM review_jobs ORDER BY created_at DESC LIMIT 50`); return rows; }

module.exports={pool,initDb,loadModels,resolveKey,cloudflareAccountId,configurationProblem,cleanModel,saveModelConfig,updateModelTest,updateModelReviewHealth,createJob,persistJob,getJob,getStudentState,grantAttempts,restoreAttempt,listJobs};
