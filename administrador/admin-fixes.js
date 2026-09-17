(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const color=status=>{const s=String(status||'').toLowerCase();if(s.includes('correct'))return '#159455';if(s.includes('satur')||s.includes('proces'))return '#d99000';if(s.includes('error'))return '#d64545';if(s.includes('sin configurar'))return '#202630';return '#98a2b3'};
  const health=(status,message='')=>`<span title="${esc(message)}" style="display:inline-flex;align-items:center;gap:7px;white-space:nowrap"><span style="width:10px;height:10px;border-radius:50%;background:${color(status)};display:inline-block"></span><span class="small">${esc(status||'Sin datos')}</span></span>`;

  function installHealthView(){
    if(!window.AdminView?.models)return false;
    const header=document.querySelector('#section-ias table thead tr');
    if(header)header.innerHTML='<th>IA</th><th>Prioridad</th><th>Función</th><th>Estado</th><th>Conexión</th><th>Última revisión</th><th>Acciones</th>';
    window.AdminView.models=(models,q='',st='')=>{
      const tbody=document.getElementById('models-table');if(!tbody)return;
      tbody.innerHTML=models.filter(m=>(!q||`${m.name} ${m.provider} ${m.model} ${m.reviewType||''}`.toLowerCase().includes(q.toLowerCase()))&&(!st||m.state===st)).sort((a,b)=>a.priority-b.priority).map(m=>{
        const connection=!m.configurationReady?'Sin configurar':(m.lastTest||'Sin probar');
        return `<tr class="model-row"><td><strong>${esc(m.name)}</strong><div class="small muted">${esc(m.provider)}${m.model?` · ${esc(m.model)}`:''}</div><div class="small muted">${esc(m.level||'')}</div></td><td><span class="priority-pill">#${esc(m.priority)}</span></td><td>${esc(m.reviewType||'General')}</td><td><button class="badge ${m.state==='Activa'?'badge-success':'badge-neutral'}" data-toggle-model="${esc(m.id)}" style="border:0"><span class="dot"></span>${esc(m.state)}</button></td><td>${health(connection,m.configurationProblem||m.lastTestMessage||'')}</td><td>${health(m.lastReviewStatus||'Sin revisión',m.lastReviewMessage||'')}</td><td class="nowrap"><button class="btn btn-outline btn-sm" data-test-model="${esc(m.id)}">Probar</button> <button class="btn btn-ghost btn-sm" data-edit-model="${esc(m.id)}">Editar</button></td></tr>`;
      }).join('');
    };
    return true;
  }

  const render=models=>{if(!installHealthView())return;window.AdminView.models(models,document.getElementById('model-search')?.value||'',document.getElementById('model-status')?.value||'')};
  window.addEventListener('revisor-models-updated',e=>render(e.detail||[]));
  setTimeout(()=>{installHealthView();try{const m=JSON.parse(localStorage.getItem('revisor_models')||'[]');if(m.length)render(m)}catch{}},0);

  let testingId=null;
  document.addEventListener('click',event=>{const btn=event.target.closest('[data-test-model]');if(btn)testingId=btn.dataset.testModel||null},true);
  const result=document.getElementById('test-result');if(!result)return;
  const observer=new MutationObserver(()=>{
    const text=(result.textContent||'').toLowerCase();if(!/high demand|saturad|temporar|rate limit|429|503|overloaded|capacity/.test(text))return;
    const alert=result.querySelector('.alert-danger');if(alert){alert.classList.remove('alert-danger');alert.classList.add('alert-warning');const strong=alert.querySelector('strong');if(strong)strong.textContent='Saturación temporal'}
    if(testingId){try{const models=JSON.parse(localStorage.getItem('revisor_models')||'[]'),m=models.find(x=>x.id===testingId);if(m){m.lastTest='Saturada';localStorage.setItem('revisor_models',JSON.stringify(models));render(models)}}catch{}}
  });
  observer.observe(result,{childList:true,subtree:true,characterData:true});
})();
