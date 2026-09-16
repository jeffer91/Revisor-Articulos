(() => {
  const { $, $$, api, firebaseGetStudent, toast, modal, config } = window.Revisor;
  const V = window.AdminView;
  const seed = window.ADMIN_DEMO_DATA;

  let models = JSON.parse(localStorage.getItem('revisor_models') || 'null') || seed.models;
  let students = JSON.parse(localStorage.getItem('revisor_known_students') || '[]');
  let reviews = [];
  let alerts = JSON.parse(localStorage.getItem('revisor_alerts') || '[]');

  const saveModels = () => localStorage.setItem('revisor_models', JSON.stringify(models));
  const saveStudents = () => localStorage.setItem('revisor_known_students', JSON.stringify(students));
  const saveAlerts = () => localStorage.setItem('revisor_alerts', JSON.stringify(alerts));
  const stateKey = cedula => `revisor_student_state_${cedula}`;
  const loadState = cedula => { try { return JSON.parse(localStorage.getItem(stateKey(cedula)) || 'null'); } catch { return null; } };
  const saveState = (cedula, state) => localStorage.setItem(stateKey(cedula), JSON.stringify(state));

  function syncReviews() {
    reviews = [];
    students.forEach(s => {
      const st = loadState(s.cedula) || {used:0,available:3,reviews:[]};
      s.used = Number.isFinite(st.used) ? st.used : 0;
      s.available = Number.isFinite(st.available) ? st.available : Math.max(0, 3 - s.used);
      s.lastReview = st.reviews?.at(-1)?.date || '';
      (st.reviews || []).forEach(r => reviews.push({
        ...r,
        student: s.name,
        cedula: s.cedula,
        status: r.status || 'Completa',
        reviewers: r.reviewers || 0
      }));
    });
  }

  const render = () => {
    syncReviews();
    V.dashboard(models, students, reviews, alerts);
    V.models(models, $('#model-search')?.value || '', $('#model-status')?.value || '');
    V.students(students, $('#student-search')?.value || '');
    V.reviews(reviews, $('#review-search')?.value || '', $('#review-status')?.value || '');
    V.stats(models, reviews);
    V.alerts(alerts);
  };

  const showApp = () => {
    $('#login-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
    render();
  };

  const sha256 = async text => {
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,'0')).join('');
  };

  $('#admin-login').addEventListener('submit', async e => {
    e.preventDefault();
    const usuario = $('#admin-user').value.trim();
    const pin = $('#admin-pin').value.trim();
    $('#admin-login-msg').textContent = 'Validando credenciales…';
    try {
      const hash = await sha256(`${usuario}:${pin}`);
      if (hash !== config.ADMIN_LOGIN_HASH) {
        $('#admin-login-msg').textContent = 'Usuario o PIN incorrectos.';
        return;
      }
      sessionStorage.setItem('revisor_admin_auth','1');
      $('#admin-login-msg').textContent = '';
      showApp();
    } catch {
      $('#admin-login-msg').textContent = 'No fue posible validar el acceso.';
    }
  });

  $('#logout').addEventListener('click', () => {
    sessionStorage.removeItem('revisor_admin_auth');
    location.reload();
  });
  if (sessionStorage.getItem('revisor_admin_auth') === '1') showApp();

  const nav = n => {
    $$('.section').forEach(s => s.classList.remove('active'));
    $(`#section-${n}`)?.classList.add('active');
    $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === n));
    $('.top-nav')?.classList.remove('open');
    history.replaceState?.(null,'',`#${n}`);
  };
  document.addEventListener('click', e => {
    const n = e.target.closest('[data-nav]');
    if (n) { e.preventDefault(); nav(n.dataset.nav); }
  });

  const set = (id,v) => $(id).value = v ?? '';

  function compactModelForm() {
    const grid = $('#model-form .form-grid');
    if (!grid || grid.dataset.compact === '1') return;
    grid.dataset.compact = '1';
    const field = id => $(id)?.closest('.field');
    const reviewTypeField = field('#model-review-type');
    const reviewLabel = reviewTypeField?.querySelector('label');
    if (reviewLabel) reviewLabel.textContent = 'Función';
    const keyField = field('#model-key');
    keyField?.classList.remove('full');
    keyField?.classList.add('compact-wide');
    field('#model-name')?.classList.add('compact-wide');
    field('#model-endpoint')?.classList.add('compact-wide');
    const specialtyField = field('#model-specialty');
    specialtyField?.classList.add('hidden');

    const main = document.createElement('div');
    main.className = 'model-main-fields';
    ['#model-name','#model-provider','#model-model','#model-endpoint','#model-key','#model-priority','#model-state','#model-review-type'].forEach(id => {
      const el = field(id); if (el) main.appendChild(el);
    });

    const details = document.createElement('details');
    details.className = 'advanced-settings';
    details.innerHTML = '<summary>Configuración avanzada</summary><div class="advanced-settings-grid"></div>';
    const advanced = details.querySelector('.advanced-settings-grid');
    ['#model-weight','#model-timeout','#model-temperature','#model-tokens','#model-prompt','#model-specialty'].forEach(id => {
      const el = field(id); if (el) advanced.appendChild(el);
    });
    grid.replaceChildren(main, details);

    const header = $('#section-ias table thead tr');
    if (header) header.innerHTML = '<th>IA</th><th>Prioridad</th><th>Función</th><th>Estado</th><th>Prueba</th><th>Acciones</th>';

    if (!$('#model-compact-style')) {
      const style = document.createElement('style');
      style.id = 'model-compact-style';
      style.textContent = `
        #section-ias .card{padding:15px}
        #section-ias table{min-width:720px}
        #section-ias th,#section-ias td{padding:9px 11px}
        #section-ias .model-row td:first-child{min-width:260px}
        .priority-pill{display:inline-flex;min-width:34px;justify-content:center;padding:4px 8px;border-radius:999px;background:#f2f4f7;font-size:12px;font-weight:800;color:#475467}
        #model-modal .modal-panel{width:min(650px,calc(100% - 30px))}
        #model-modal .modal-body{padding:16px 20px}
        #model-modal .modal-head,#model-modal .modal-foot{padding:13px 18px}
        .model-main-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
        .model-main-fields .compact-wide{grid-column:1/-1}
        .model-main-fields .field{gap:4px}
        .model-main-fields .input,.model-main-fields .select{padding:8px 10px}
        .advanced-settings{margin-top:14px;border:1px solid var(--border);border-radius:12px;background:#fafafa;overflow:hidden}
        .advanced-settings summary{padding:10px 12px;font-size:12px;font-weight:800;color:#475467;cursor:pointer;user-select:none}
        .advanced-settings[open] summary{border-bottom:1px solid var(--border)}
        .advanced-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px}
        .advanced-settings-grid .field.full{grid-column:1/-1}
        .advanced-settings-grid .textarea{min-height:72px}
        @media(max-width:700px){.model-main-fields,.advanced-settings-grid{grid-template-columns:1fr}.model-main-fields .compact-wide,.advanced-settings-grid .field.full{grid-column:auto}}
      `;
      document.head.appendChild(style);
    }
  }
  compactModelForm();

  function openModel(m=null) {
    $('#model-modal-title').textContent = m ? 'Editar IA' : 'Agregar IA';
    set('#model-id',m?.id); set('#model-name',m?.name); set('#model-provider',m?.provider);
    set('#model-model',m?.model); set('#model-endpoint',m?.endpoint); set('#model-key','');
    set('#model-priority',m?.priority || models.length+1); set('#model-weight',m?.weight ?? 1);
    set('#model-state',m?.state || 'Activa'); set('#model-specialty',m?.specialty);
    set('#model-timeout',m?.timeout || 90); set('#model-temperature',m?.temperature ?? .2);
    set('#model-tokens',m?.tokens || 6000); set('#model-review-type',m?.reviewType || 'General');
    set('#model-prompt',m?.prompt);
    const advanced = $('#model-form .advanced-settings'); if (advanced) advanced.open = false;
    modal('model-modal');
  }

  $('#model-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('#model-id').value || `model-${Date.now()}`;
    const old = models.find(m => m.id === id);
    const m = {
      ...(old || {}), id,
      name: $('#model-name').value.trim(), provider: $('#model-provider').value.trim(),
      model: $('#model-model').value.trim(), endpoint: $('#model-endpoint').value.trim(),
      priority: +$('#model-priority').value, weight: +$('#model-weight').value,
      state: $('#model-state').value, specialty: $('#model-specialty').value.trim(),
      timeout: +$('#model-timeout').value, temperature: +$('#model-temperature').value,
      tokens: +$('#model-tokens').value, reviewType: $('#model-review-type').value,
      prompt: $('#model-prompt').value, lastTest: old?.lastTest || 'Sin probar'
    };
    const key = $('#model-key').value.trim();
    if (key) sessionStorage.setItem(`revisor_key_${id}`, key);
    try {
      if (config.API_BASE_URL) {
        await api(old ? `/admin/models/${id}` : '/admin/models', {
          method: old ? 'PUT' : 'POST', body: JSON.stringify({...m, apiKey:key || undefined})
        });
      }
      old ? Object.assign(old,m) : models.push(m);
      saveModels(); render(); modal('model-modal',false); toast('IA guardada.','success');
    } catch (err) { toast(`No fue posible guardar la IA: ${err.message}`,'danger'); }
  });

  async function directTestModel(m,id) {
    const key = sessionStorage.getItem(`revisor_key_${id}`);
    if (!m.endpoint) throw new Error('Configura el endpoint del modelo.');
    if (!key && !/ollama/i.test(m.provider)) throw new Error('Ingresa la API key en Editar IA antes de probar.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (m.timeout || 90) * 1000);
    const started = performance.now();
    const isGemini = /gemini/i.test(m.provider) || /generativelanguage/i.test(m.endpoint);
    const url = isGemini && key && !m.endpoint.includes('key=') ? `${m.endpoint}${m.endpoint.includes('?')?'&':'?'}key=${encodeURIComponent(key)}` : m.endpoint;
    const headers = {'Content-Type':'application/json'};
    if (!isGemini && key) headers.Authorization = `Bearer ${key}`;
    const prompt = 'Revisa académicamente esta frase de prueba e identifica una mejora metodológica: “Se aplicó una encuesta y los resultados fueron positivos”. Responde brevemente.';
    const body = isGemini
      ? {contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:m.temperature ?? .2,maxOutputTokens:Math.min(m.tokens || 6000,800)}}
      : {model:m.model,messages:[{role:'user',content:prompt}],temperature:m.temperature ?? .2,max_tokens:Math.min(m.tokens || 6000,800)};
    try {
      const res = await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.error?.message || data?.message || `HTTP ${res.status}`);
      const text = isGemini ? data?.candidates?.[0]?.content?.parts?.[0]?.text : data?.choices?.[0]?.message?.content;
      return {time:((performance.now()-started)/1000).toFixed(1),tokens:data?.usage?.total_tokens ?? '—',text:text || 'Respuesta recibida correctamente.'};
    } finally { clearTimeout(timer); }
  }

  async function testModel(id) {
    const m = models.find(x => x.id === id); if (!m) return;
    modal('test-modal'); $('#test-result').innerHTML = `<div class="alert alert-info"><strong>Probando ${m.name}…</strong></div>`;
    try {
      const d = config.API_BASE_URL ? await api(`/admin/models/${id}/test`,{method:'POST'}) : await directTestModel(m,id);
      m.lastTest = 'Correcta'; saveModels(); render();
      $('#test-result').innerHTML = `<div class="alert alert-success"><strong>IA operativa</strong></div><div class="grid grid-3"><div class="card metric"><div class="metric-label">Tiempo</div><div class="metric-value">${d.time || 'OK'}</div></div><div class="card metric"><div class="metric-label">Tokens</div><div class="metric-value">${d.tokens ?? '—'}</div></div><div class="card metric"><div class="metric-label">Estado</div><div class="metric-value text-success">OK</div></div></div><div class="card"><h3>Mini revisión</h3><p>${d.text || d.response || 'Respuesta recibida correctamente.'}</p></div>`;
    } catch(err) {
      m.lastTest = 'Error'; saveModels(); render();
      $('#test-result').innerHTML = `<div class="alert alert-danger"><strong>Error de prueba</strong><div class="small">${err.message}</div></div>`;
    }
  }

  async function lookupStudent() {
    const q = $('#student-search').value.trim();
    if (!/^\d{10}$/.test(q) || students.some(s => s.cedula === q)) return;
    try {
      const d = await firebaseGetStudent(q); if (!d) return;
      const s = {id:q,cedula:q,name:d.nombres || 'Estudiante',career:d.nombreCarreraActual || '',used:0,available:3,lastReview:'',status:'Activo'};
      students.push(s); saveStudents(); render(); toast('Estudiante cargado desde Firebase.','success');
    } catch(err) { console.warn(err); }
  }

  function manageStudent(id) {
    const s = students.find(x => x.id === id); if (!s) return;
    $('#student-modal-body').innerHTML = `<div class="grid grid-2"><div class="card metric"><div class="metric-label">Usadas</div><div class="metric-value">${s.used}</div></div><div class="card metric"><div class="metric-label">Disponibles</div><div class="metric-value">${s.available}</div></div></div><h3 style="margin-top:20px">${s.name}</h3><p class="muted">${s.cedula} · ${s.career}</p><div class="toolbar"><button class="btn btn-primary" data-add-attempt="${id}">+ Agregar revisión</button><button class="btn btn-outline" data-restore-attempt="${id}">Restaurar intento</button></div><div class="small muted">Restaurar un intento no elimina el historial.</div>`;
    modal('student-modal');
  }

  function viewReview(id) {
    const r = reviews.find(x => x.id === id); if (!r) return;
    $('#review-modal-body').innerHTML = `<div class="grid grid-3"><div class="card"><div class="score-big">${r.score ?? '—'}</div><div class="score-caption">Nota académica / 100</div></div><div class="card metric"><div class="metric-label">Similitud</div><div class="metric-value">${r.plagiarism != null ? r.plagiarism+'%' : '—'}</div></div><div class="card metric"><div class="metric-label">Posible IA</div><div class="metric-value">${r.ai != null ? r.ai+'%' : '—'}</div></div></div><div style="margin-top:18px" class="alert ${r.status==='Completa'?'alert-success':'alert-warning'}"><div><strong>${r.status}</strong><div class="small muted">${r.reviewers} IA exitosas.</div></div></div>`;
    modal('review-modal');
  }

  document.addEventListener('click', e => {
    if (e.target.closest('#add-model-btn')) openModel();
    const edit=e.target.closest('[data-edit-model]'); if(edit) openModel(models.find(m=>m.id===edit.dataset.editModel));
    const test=e.target.closest('[data-test-model]'); if(test) testModel(test.dataset.testModel);
    const tog=e.target.closest('[data-toggle-model]'); if(tog){const m=models.find(x=>x.id===tog.dataset.toggleModel);m.state=m.state==='Activa'?'Inactiva':'Activa';saveModels();render();}
    const mg=e.target.closest('[data-manage-student]'); if(mg) manageStudent(mg.dataset.manageStudent);
    const add=e.target.closest('[data-add-attempt]'); if(add){const s=students.find(x=>x.id===add.dataset.addAttempt);const st=loadState(s.cedula)||{used:0,available:3,reviews:[]};st.available=(st.available ?? 3)+1;saveState(s.cedula,st);render();manageStudent(s.id);toast('Revisión adicional asignada.','success');}
    const rs=e.target.closest('[data-restore-attempt]'); if(rs){const s=students.find(x=>x.id===rs.dataset.restoreAttempt);const st=loadState(s.cedula)||{used:0,available:3,reviews:[]};if(st.used>0)st.used--;st.available=(st.available ?? 3)+1;saveState(s.cedula,st);render();manageStudent(s.id);toast('Intento restaurado.','success');}
    const vr=e.target.closest('[data-view-review]'); if(vr) viewReview(vr.dataset.viewReview);
  });

  $('#model-search').addEventListener('input',render);
  $('#student-search').addEventListener('input',()=>{render();lookupStudent();});
  $('#review-search').addEventListener('input',render);
  $('#model-status').addEventListener('change',render);
  $('#review-status').addEventListener('change',render);

  $('#export-summary').addEventListener('click',()=>{
    const csv=['Estudiante,Cedula,Nota,Plagio,Posible IA,Estado',...reviews.map(r=>`${r.student},${r.cedula},${r.score??''},${r.plagiarism??''},${r.ai??''},${r.status}`)].join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='resumen-revisiones.csv';a.click();URL.revokeObjectURL(a.href);
  });

  const initial=(location.hash||'#inicio').slice(1);
  if(['inicio','ias','estudiantes','revisiones','informes','estadisticas','alertas'].includes(initial)) nav(initial);
})();