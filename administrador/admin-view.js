(() => {
  const { $, formatDate, esc }=window.Revisor;
  const V={};
  const e=v=>esc(v);
  const n=v=>Number.isFinite(Number(v))?Number(v):0;

  V.bars=items=>items.map(([l,v,max=100])=>`<div style="margin:14px 0"><div style="display:flex;justify-content:space-between;font-size:12px"><strong>${e(l)}</strong><span class="muted">${e(v)}</span></div><div class="progress" style="margin-top:6px"><span style="width:${Math.min(100,max?n(v)/n(max)*100:0)}%"></span></div></div>`).join('');

  const frequencies=reviews=>{
    const map=new Map();
    reviews.forEach(r=>(r.observations||[]).forEach(o=>{const key=String(o.section||'General').trim()||'General';map.set(key,(map.get(key)||0)+1)}));
    return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  };

  V.dashboard=(models,students,reviews,alerts)=>{
    const completed=reviews.filter(r=>r.status==='Completa'),avg=completed.reduce((s,r)=>s+n(r.score),0)/Math.max(1,completed.length);
    const active=models.filter(m=>m.state==='Activa').length,operational=models.filter(m=>m.operationalState==='Operativa'||m.operationalState==='Degradada').length;
    const metrics=[['Revisiones totales',reviews.length,'Historial centralizado'],['Promedio académico',avg.toFixed(1),'Sobre 100'],['IA operativas',`${operational}/${active}`,'Operativas o degradadas / activas'],['Incompletas',reviews.filter(r=>r.status==='Incompleta').length,'No consumen intento'],['Alertas críticas',alerts.filter(a=>a.type==='Crítica').length,'Requieren atención'],['Estudiantes',students.length,'Registrados localmente']];
    $('#dashboard-metrics').innerHTML=metrics.map(([l,v,s])=>`<div class="card metric metric-accent"><div class="metric-label">${e(l)}</div><div class="metric-value">${e(v)}</div><div class="metric-sub">${e(s)}</div></div>`).join('');
    const approved=completed.filter(r=>r.approved).length;
    $('#grade-distribution').innerHTML=V.bars([['Aprobados',approved,Math.max(1,completed.length)],['No aprobados',completed.length-approved,Math.max(1,completed.length)]]);
    const freq=frequencies(completed);$('#error-frequency').innerHTML=freq.length?V.bars(freq.map(([k,v])=>[k,v,Math.max(1,freq[0][1])])):'<p class="muted">Aún no hay observaciones suficientes.</p>';
    $('#recent-reviews').innerHTML=reviews.slice(0,5).map(r=>`<tr><td><strong>${e(r.student)}</strong><div class="small muted">${e(r.file)}</div></td><td>${e(r.cedula)}</td><td>${e(formatDate(r.date))}</td><td>${e(r.score??'—')}</td><td>${r.plagiarism!=null?e(r.plagiarism)+'%':'—'}</td><td>${r.ai!=null?e(r.ai)+'%':'—'}</td><td><span class="badge ${r.status==='Completa'?'badge-success':'badge-warning'}">${e(r.status)}</span></td></tr>`).join('');
  };

  V.models=(models,q='',st='')=>{
    const stateClass=s=>s==='Operativa'?'badge-success':s==='Degradada'||s==='En espera'?'badge-warning':s==='Error de configuración'?'badge-danger':'badge-neutral';
    $('#models-table').innerHTML=models.filter(m=>(!q||`${m.name} ${m.provider} ${m.model} ${m.reviewType||''} ${m.level||''} ${m.operationalState||''}`.toLowerCase().includes(q.toLowerCase()))&&(!st||m.state===st)).sort((a,b)=>a.priority-b.priority).map(m=>{
      const rate=m.successRate==null?'—':m.successRate+'%',latency=m.averageLatencyMs?((m.averageLatencyMs/1000).toFixed(1)+' s'):'—',last=m.lastReviewStatus||'Sin revisión';
      return `<tr class="model-row"><td><strong>${e(m.name)}</strong><div class="small muted">${e(m.provider)}${m.model?` · ${e(m.model)}`:''}</div><div class="small muted">${e(m.level||'')}${m.stableBackup?' · Respaldo estable':''}</div></td><td><span class="priority-pill">#${e(m.priority)}</span></td><td>${e(m.reviewType||'General')}</td><td><button class="badge ${m.state==='Activa'?'badge-success':'badge-neutral'}" data-toggle-model="${e(m.id)}" style="border:0"><span class="dot"></span>${e(m.state)}</button></td><td><span class="badge ${stateClass(m.operationalState)}">${e(m.operationalState||'—')}</span></td><td><span class="small ${m.lastTest==='Correcta'?'text-success':m.lastTest==='Error'?'text-danger':'muted'}">${e(m.lastTest||'Sin probar')}</span></td><td><span class="small ${last==='Correcta'?'text-success':last==='Error'?'text-danger':'muted'}">${e(last)}</span></td><td><strong>${e(rate)}</strong><div class="small muted">${e(latency)}</div></td><td class="nowrap"><button class="btn btn-outline btn-sm" data-test-model="${e(m.id)}">Probar</button> <button class="btn btn-ghost btn-sm" data-edit-model="${e(m.id)}">Editar</button></td></tr>`;
    }).join('');
  };

  V.students=(students,q='')=>{
    $('#students-table').innerHTML=students.filter(s=>!q||`${s.name} ${s.cedula} ${s.career}`.toLowerCase().includes(q.toLowerCase())).map(s=>`<tr><td><strong>${e(s.name)}</strong></td><td>${e(s.cedula)}</td><td>${e(s.career)}</td><td>${e(s.used)}</td><td><strong>${e(s.available)}</strong></td><td>${s.lastReview?e(formatDate(s.lastReview)):'Sin revisiones'}</td><td><span class="badge badge-success">${e(s.status||s.state||'Activo')}</span></td><td><button class="btn btn-outline btn-sm" data-manage-student="${e(s.id)}">Gestionar</button></td></tr>`).join('');
  };

  V.reviews=(reviews,q='',st='')=>{
    $('#reviews-table').innerHTML=reviews.filter(r=>(!q||`${r.student} ${r.file} ${r.cedula}`.toLowerCase().includes(q.toLowerCase()))&&(!st||r.status===st)).map(r=>`<tr><td><strong>${e(r.student)}</strong><div class="small muted">${e(r.file)}</div></td><td>#${e(r.n??'—')}</td><td>${e(formatDate(r.date))}</td><td>${e(r.score??'—')}</td><td>${r.plagiarism!=null?e(r.plagiarism)+'%':'—'}</td><td>${r.ai!=null?e(r.ai)+'%':'—'}</td><td>${e(r.reviewers)}</td><td><span class="badge ${r.status==='Completa'?'badge-success':'badge-warning'}">${e(r.status)}</span></td><td><button class="btn btn-outline btn-sm" data-view-review="${e(r.id)}">Ver</button></td></tr>`).join('');
  };

  V.stats=(models,reviews)=>{
    const completed=reviews.filter(r=>r.status==='Completa'),avgUnique=completed.reduce((s,r)=>s+n(r.uniqueReviewers??r.reviewers),0)/Math.max(1,completed.length);
    const cards=[['Aprobación',`${Math.round(100*completed.filter(r=>r.approved).length/Math.max(1,completed.length))}%`],['Similitud orientativa media',`${Math.round(completed.reduce((s,r)=>s+n(r.plagiarism),0)/Math.max(1,completed.length))}%`],['Posible IA media',`${Math.round(completed.reduce((s,r)=>s+n(r.ai),0)/Math.max(1,completed.length))}%`],['Revisores únicos promedio',avgUnique.toFixed(1)]];
    $('#stats-cards').innerHTML=cards.map(([l,v])=>`<div class="card metric"><div class="metric-label">${e(l)}</div><div class="metric-value">${e(v)}</div></div>`).join('');
    const freq=frequencies(completed);$('#stats-errors').innerHTML=freq.length?V.bars(freq.map(([k,v])=>[k,v,Math.max(1,freq[0][1])])):'<p class="muted">Aún no hay observaciones suficientes.</p>';
    $('#model-performance').innerHTML=models.filter(m=>m.state==='Activa').sort((a,b)=>(b.successRate??-1)-(a.successRate??-1)).slice(0,8).map(m=>`<tr><td>${e(m.name)}</td><td>${m.successRate==null?'—':e(m.successRate)+'%'}</td><td>${m.averageLatencyMs?e((m.averageLatencyMs/1000).toFixed(1))+'s':'—'}</td></tr>`).join('');
  };

  V.alerts=alerts=>{$('#alerts-table').innerHTML=alerts.map(a=>`<tr><td><span class="badge ${a.type==='Crítica'?'badge-danger':'badge-warning'}">${e(a.type)}</span></td><td>${e(a.student)}</td><td>${e(formatDate(a.date))}</td><td>${e(a.detail)}</td><td>${e(a.state)}</td></tr>`).join('');};
  window.AdminView=V;
})();
