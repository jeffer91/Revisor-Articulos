const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {RUBRIC}=require('../catalog');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

assert.strictEqual(RUBRIC.reduce((sum,row)=>sum+Number(row[1]||0),0),100,'La rúbrica debe sumar 100 puntos.');

const hybrid=read('hybrid-v4.js');
const microBlock=hybrid.slice(hybrid.indexOf('const MICROCRITERIA'),hybrid.indexOf('const LEVEL_VALUE'));
const matches=[...microBlock.matchAll(/\['[^']+','[^']*',\s*([0-9.]+)\]/g)];
assert.strictEqual(matches.length,47,'Deben existir 47 microcriterios.');
assert.strictEqual(matches.reduce((sum,m)=>sum+Number(m[1]),0),100,'Los microcriterios deben sumar 100 puntos.');
assert.ok(hybrid.includes('.slice(0,5)'), 'La salida final debe limitar comentarios prioritarios.');
assert.ok(hybrid.includes('modelFamily'), 'La verificación crítica debe distinguir familias de modelos.');
assert.ok(hybrid.includes('missingLaneMicrocriteria'), 'La revisión debe poder detectar y reparar microcriterios faltantes.');
assert.ok(hybrid.includes('providerContextBudget'), 'Cada proveedor debe respetar un presupuesto de contexto.');

const server=read('server-v4.js');
assert.ok(!/ADMIN_LOGIN_HASH=process\.env\.ADMIN_LOGIN_HASH\|\|['"][a-f0-9]{64}/i.test(server),'No debe existir hash administrativo fallback.');
assert.ok(server.includes("url.pathname==='/student/login'"),'Debe existir login de estudiante.');
assert.ok(server.includes('reserveStudentJob(job)'), 'Los intentos deben reservarse de forma atómica.');
assert.ok(server.includes("verifySession(bearer(req),['student','research'])"), 'Las revisiones deben exigir sesión.');
assert.ok(server.includes('FINAL_RECOVERY_DELAY_MS'), 'Debe existir recuperación final de carriles sin repetir los ya completados.');
assert.ok(server.includes('laneProgress(job)'), 'El estado público debe informar el progreso por carril.');
assert.ok(server.includes('serializePartialSuccesses'), 'Los carriles completados deben persistirse cuando una revisión queda parcial.');
assert.ok(server.includes("/retry$/i"), 'Debe existir una ruta para reanudar una revisión parcial.');
assert.ok(server.includes("runReview(job,articleText,{resume:true})"), 'El reintento debe reanudar el mismo trabajo y no crear otra revisión.');
assert.ok(server.includes("respaldo\\s+(estable|din[aá]mico)"), 'El respaldo dinámico existente debe reconocerse en tiempo de ejecución.');

const ai=read('ai.js');
assert.ok(ai.includes('Entrada excedida'), 'Los límites de contexto/tokens deben clasificarse por separado.');
assert.ok(ai.includes('HTTP ${status}:'), 'Los errores de proveedor deben conservar el código HTTP.');

const research=fs.readFileSync(path.join(root,'..','investigacion','investigacion.js'),'utf8');
assert.ok(research.includes('Reintentar solo lo pendiente'), 'Investigación debe reintentar únicamente el carril pendiente.');
assert.ok(research.includes('/retry'), 'Investigación debe usar el endpoint de reanudación.');

const store=read('store.js');
assert.ok(store.includes("['Procesando','Disponible','Cancelada'].includes(status)"),'Procesando no debe contabilizarse como fallo.');
assert.ok(store.includes('FOR UPDATE'),'La reserva de intentos debe usar bloqueo transaccional.');

console.log('Smoke tests V4: OK');

const config=fs.readFileSync(path.join(root,'..','assets','config.js'),'utf8');
assert.ok(!config.includes('ADMIN_LOGIN_HASH'),'El frontend no debe publicar el hash administrativo.');
assert.ok(!config.includes('FIREBASE:'),'El frontend no debe publicar la configuración de acceso institucional.');
assert.ok(!fs.existsSync(path.join(root,'server-v2.js'))&&!fs.existsSync(path.join(root,'server-v3.js')),'Las orquestaciones antiguas no deben quedar en producción.');
assert.ok(!fs.existsSync(path.join(root,'..','assets','ai-policy.js')),'La política antigua 3-5 IA debe permanecer eliminada.');
