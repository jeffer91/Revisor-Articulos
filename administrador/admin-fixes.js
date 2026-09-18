(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const color=status=>{const s=String(status||'').toLowerCase();if(s.includes('correct')||s.includes('operativa'))return '#159455';if(s.includes('satur')||s.includes('proces')||s.includes('degradada')||s.includes('en espera'))return '#d99000';if(s.includes('error'))return '#d64545';if(s.includes('sin configurar'))return '#202630';return '#98a2b3'};
  const health=(status,message='')=>`<span title="${esc(message)}" style="display:inline-flex;align-items:center;gap:7px;white-space:nowrap"><span style="width:10px;height:10px;border-radius:50%;background:${color(status)};display:inline-block"></span><span class="small">${esc(status||'Sin datos')}</span></span>`;

  function installHealthView(){
    if(!window.AdminView?.models)return false;
    const header=document.querySelector('#section-ias table thead tr');
    if(header)header.innerHTML='<th>IA</th><th>Prioridad</th><th>Función</th><th>Estado</th><th>Operación</th><th>Prueba manual</th><th>Último uso</th><th>Éxito / latencia</th><th>Acciones</th>';
    window.AdminView.models=(models,q='',st='')=>{
      const tbody=document.getElementById('models-table');if(!tbody)return;
      tbody.innerHTML=models.filter(m=>(!q||`${m.name} ${m.provider} ${m.model} ${m.reviewType||''} ${m.operationalState||''}`.toLowerCase().includes(q.toLowerCase()))&&(!st||m.state===st)).sort((a,b)=>a.priority-b.priority).map(m=>{
        const operation=m.operationalState||'—';
        const rate=m.successRate==null?'—':`${m.successRate}%`;
        const latency=m.averageLatencyMs?`${(m.averageLatencyMs/1000).toFixed(1)} s`:'—';
        return `<tr class="model-row"><td><strong>${esc(m.name)}</strong><div class="small muted">${esc(m.provider)}${m.model?` · ${esc(m.model)}`:''}</div><div class="small muted">${esc(m.level||'')}${m.stableBackup?' · Respaldo estable':''}</div></td><td><span class="priority-pill">#${esc(m.priority)}</span></td><td>${esc(m.reviewType||'General')}</td><td><button class="badge ${m.state==='Activa'?'badge-success':'badge-neutral'}" data-toggle-model="${esc(m.id)}" style="border:0"><span class="dot"></span>${esc(m.state)}</button></td><td>${health(operation,m.configurationProblem||m.configurationErrorMessage||'')}</td><td>${health(m.lastTest||'Sin probar',m.lastTestMessage||'')}</td><td>${health(m.lastReviewStatus||'Sin revisión',m.lastReviewMessage||'')}</td><td><strong>${esc(rate)}</strong><div class="small muted">${esc(latency)}</div></td><td class="nowrap"><button class="btn btn-outline btn-sm" data-test-model="${esc(m.id)}">Probar</button> <button class="btn btn-ghost btn-sm" data-edit-model="${esc(m.id)}">Editar</button></td></tr>`;
      }).join('');
    };
    return true;
  }

  const render=models=>{if(!installHealthView())return;window.AdminView.models(models,document.getElementById('model-search')?.value||'',document.getElementById('model-status')?.value||'')};
  window.addEventListener('revisor-models-updated',e=>render(e.detail||[]));
  setTimeout(()=>{installHealthView();try{const m=JSON.parse(localStorage.getItem('revisor_models')||'[]');if(m.length)render(m)}catch{}},0);

  const readModels=()=>{try{return JSON.parse(localStorage.getItem('revisor_models')||'[]')}catch{return[]}};
  const readStudents=()=>{try{return JSON.parse(localStorage.getItem('revisor_known_students')||'[]')}catch{return[]}};
  const saveRemoteStudentState=(cedula,state)=>localStorage.setItem(`revisor_student_state_${cedula}`,JSON.stringify({used:Number(state.used)||0,available:Number(state.available)||0,reviews:Array.isArray(state.reviews)?state.reviews:[]}));
  const findStudent=id=>readStudents().find(s=>s.id===id||s.cedula===id);

  async function showStudentManager(id){
    const s=findStudent(id);if(!s)return;
    let state={used:s.used||0,available:s.available??3,reviews:[]};
    try{state=await window.Revisor.api(`/students/${s.cedula}/state`);saveRemoteStudentState(s.cedula,state)}catch(err){console.warn(err)}
    const body=document.getElementById('student-modal-body');if(!body)return;
    body.innerHTML=`<div class="grid grid-2"><div class="card metric"><div class="metric-label">Usadas</div><div class="metric-value">${esc(state.used)}</div></div><div class="card metric"><div class="metric-label">Disponibles</div><div class="metric-value">${esc(state.available)}</div></div></div><h3 style="margin-top:20px">${esc(s.name)}</h3><p class="muted">${esc(s.cedula)} · ${esc(s.career||'')}</p><div class="toolbar"><button class="btn btn-primary" data-add-attempt="${esc(id)}">+ Agregar revisión</button><button class="btn btn-outline" data-restore-attempt="${esc(id)}">Restaurar intento</button></div><div class="small muted">Los cambios se guardan centralmente y no eliminan el historial.</div>`;
    window.Revisor.modal('student-modal');
  }

  document.addEventListener('click',async event=>{
    const toggle=event.target.closest('[data-toggle-model]');
    if(toggle){
      event.preventDefault();event.stopImmediatePropagation();
      const models=readModels(),m=models.find(x=>x.id===toggle.dataset.toggleModel);if(!m)return;
      const next=m.state==='Activa'?'Inactiva':'Activa';
      try{await window.Revisor.api(`/admin/models/${encodeURIComponent(m.id)}`,{method:'PUT',body:JSON.stringify({state:next})});m.state=next;localStorage.setItem('revisor_models',JSON.stringify(models));render(models);window.Revisor.toast(`IA ${next.toLowerCase()}.`,'success')}catch(err){window.Revisor.toast(err.message,'danger')}
      return;
    }

    const manage=event.target.closest('[data-manage-student]');
    if(manage){event.preventDefault();event.stopImmediatePropagation();await showStudentManager(manage.dataset.manageStudent);return}

    const add=event.target.closest('[data-add-attempt]');
    if(add){
      event.preventDefault();event.stopImmediatePropagation();const s=findStudent(add.dataset.addAttempt);if(!s)return;
      try{const state=await window.Revisor.api(`/admin/students/${s.cedula}/grant`,{method:'POST',body:JSON.stringify({count:1})});saveRemoteStudentState(s.cedula,state);window.Revisor.toast('Revisión adicional asignada.','success');await showStudentManager(s.id)}catch(err){window.Revisor.toast(err.message,'danger')}
      return;
    }

    const restore=event.target.closest('[data-restore-attempt]');
    if(restore){
      event.preventDefault();event.stopImmediatePropagation();const s=findStudent(restore.dataset.restoreAttempt);if(!s)return;
      try{const state=await window.Revisor.api(`/admin/students/${s.cedula}/grant`,{method:'POST',body:JSON.stringify({count:1})});saveRemoteStudentState(s.cedula,state);window.Revisor.toast('Intento restaurado.','success');await showStudentManager(s.id)}catch(err){window.Revisor.toast(err.message,'danger')}
      return;
    }
  },true);

  let testingId=null;
  document.addEventListener('click',event=>{const btn=event.target.closest('[data-test-model]');if(btn)testingId=btn.dataset.testModel||null},true);
  const result=document.getElementById('test-result');if(!result)return;
  const observer=new MutationObserver(()=>{
    const text=(result.textContent||'').toLowerCase();if(!/high demand|saturad|temporar|rate limit|429|503|overloaded|capacity/.test(text))return;
    const alert=result.querySelector('.alert-danger');if(alert){alert.classList.remove('alert-danger');alert.classList.add('alert-warning');const strong=alert.querySelector('strong');if(strong)strong.textContent='Saturación temporal'}
    if(testingId){try{const models=readModels(),m=models.find(x=>x.id===testingId);if(m){m.lastTest='Saturada';localStorage.setItem('revisor_models',JSON.stringify(models));render(models)}}catch{}}
  });
  observer.observe(result,{childList:true,subtree:true,characterData:true});
})();
