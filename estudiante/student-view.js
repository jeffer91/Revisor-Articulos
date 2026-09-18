(() => {
  const { $, formatDate, esc }=window.Revisor,V={};
  const e=v=>esc(v);
  const num=v=>Number.isFinite(Number(v))?Number(v):0;

  V.summary=s=>{
    const r=s.reviews||[],last=r.at(-1);
    $('#student-summary').innerHTML=[['Revisiones disponibles',s.available,'De 3 iniciales'],['Revisiones usadas',s.used,'Historial conservado'],['Última nota',last?.score??'—','Sobre 100'],['Estado',last?(last.approved?'Aprobado':'No aprobado'):'Sin revisión',last?`${num(last.reviewers)} carriles completos`:'']]
      .map(([l,v,x])=>`<div class="card metric metric-accent"><div class="metric-label">${e(l)}</div><div class="metric-value">${e(v)}</div><div class="metric-sub">${e(x)}</div></div>`).join('');
    $('#last-review').innerHTML=last?`<div class="score-big" style="font-size:42px">${e(last.score)}</div><div class="score-caption">Nota académica</div><div style="margin-top:12px" class="small muted">${e(formatDate(last.date))} · ${e(last.file)}</div><div style="margin-top:12px"><button class="btn btn-outline btn-sm" data-open-result="${e(last.id)}">Ver resultado</button></div>`:'<p class="muted">Aún no tienes revisiones.</p>';
  };

  V.reviews=s=>{
    $('#reviews-list').innerHTML=(s.reviews||[]).length?(s.reviews||[]).map(r=>`<div class="card"><div class="toolbar"><span class="badge ${r.approved?'badge-success':'badge-danger'}">Revisión ${e(r.n)}</span><span class="spacer"></span><strong>${e(r.score)}/100</strong></div><p class="small muted">${e(formatDate(r.date))}<br>${e(r.file)}</p><div class="grid grid-2"><div><span class="small muted">Similitud orientativa</span><strong style="display:block">${e(r.plagiarism)}%</strong></div><div><span class="small muted">Posible IA</span><strong style="display:block">${e(r.ai)}%</strong></div></div><button class="btn btn-outline btn-block" style="margin-top:14px" data-open-result="${e(r.id)}">Ver resultado</button></div>`).join(''):'<div class="card"><p class="muted">Aún no tienes revisiones.</p></div>';
  };

  V.resultCards=r=>{
    const block=r.approvalBlocked?`<div class="alert alert-danger" style="margin-bottom:10px"><div>!</div><div><strong>Condición crítica de aprobación</strong><div class="small">${e(r.approvalBlockReason||'Existe una condición académica crítica que debe corregirse antes de aprobar.')}</div></div></div>`:'';
    const critical=(r.critical||[]).map(x=>`<div class="alert alert-danger" style="margin-bottom:10px"><div>!</div><div><strong>Alerta crítica</strong><div class="small">${e(x)}</div></div></div>`).join('');
    const red=r.redundancy==='high'?'alta':r.redundancy==='reduced'?'reducida':r.redundancy==='minimal'?'mínima':'—';
    $('#result-meta').textContent=`Revisión #${r.n} · ${formatDate(r.date)} · ${r.file} · 3 carriles completos · redundancia ${red}`;
    const pending=(r.criticalConfirmations||[]).filter(x=>x.pending).length?'<div class="alert alert-warning" style="margin-bottom:10px"><div>!</div><div><strong>Alerta crítica pendiente de confirmación</strong><div class="small">No se aplicó bloqueo automático porque no hubo un segundo revisor independiente disponible.</div></div></div>':'';
    $('#critical-alerts').innerHTML=block+pending+critical;
    $('#result-cards').innerHTML=`<div class="card"><div class="score-big">${e(r.score)}</div><div class="score-caption">Nota académica / 100</div><div style="margin-top:10px"><span class="badge ${r.approved?'badge-success':'badge-danger'}">${r.approved?'APROBADO':'NO APROBADO'}</span></div></div><div class="card metric"><div class="metric-label">Similitud orientativa</div><div class="metric-value">${e(r.plagiarism)}%</div><div class="metric-sub">Nivel ${e(r.plagiarismRisk||'—')}</div></div><div class="card metric"><div class="metric-label">Posible IA</div><div class="metric-value">${e(r.ai)}%</div><div class="metric-sub">Nivel ${e(r.aiRisk||'—')}</div></div>`;
  };

  V.panel=(r,tab,rubric)=>{
    if(tab==='academico'){
      const cats=(r.categories||rubric).map(([n,m,s])=>`<div style="margin:13px 0"><div style="display:flex;justify-content:space-between"><strong>${e(n)}</strong><span>${e(s)} / ${e(m)}</span></div><div class="progress" style="margin-top:7px"><span style="width:${Math.min(100,m?num(s)/num(m)*100:0)}%"></span></div></div>`).join('');
      const obs=(r.observations||[]).map(o=>`<div class="accordion-item"><div class="accordion-head" data-accordion><span class="badge ${o.severity==='Crítico'?'badge-danger':o.severity==='Alto'?'badge-warning':'badge-info'}">${e(o.severity)}</span><div class="grow"><strong>${e(o.page||'Ubicación no determinada')} · ${e(o.section)}</strong><div class="small muted">${e(o.title)}</div></div><span>⌄</span></div><div class="accordion-body"><dl>${o.original?`<dt>Texto observado</dt><dd>${e(o.original)}</dd>`:''}<dt>Problema</dt><dd>${e(o.problem)}</dd><dt>Corrección</dt><dd>${e(o.fix)}</dd></dl></div></div>`).join('');
      $('#result-panel').innerHTML=`<div class="grid grid-2"><div><h3>Desglose de 100 puntos</h3>${cats}</div><div><h3>Comentarios prioritarios</h3>${obs||'<p class="muted">Sin observaciones prioritarias.</p>'}</div></div>`;
    }else if(tab==='plagio'){
      $('#result-panel').innerHTML=`<div class="alert alert-info"><div>ℹ</div><div><strong>Indicador orientativo de similitud textual</strong><div class="small">Este porcentaje es una estimación de los modelos y no equivale a un informe de antiplagio externo. No modifica automáticamente la nota académica.</div></div></div><h3 style="margin-top:18px">Coincidencias señaladas</h3>${(r.plagiarismMatches||[]).map(m=>`<div class="accordion-item open"><div class="accordion-head"><span class="badge badge-warning">Revisar</span><div class="grow"><strong>${e(m.type||'Coincidencia')}</strong><div class="small muted">${e(m.page||'')} · ${e(m.source||'Fuente no verificada')}</div></div></div><div class="accordion-body"><p>${e(m.fragment||'')}</p></div></div>`).join('')||'<p class="muted">No se señalaron coincidencias relevantes.</p>'}`;
    }else{
      $('#result-panel').innerHTML=`<div class="alert alert-warning"><div>!</div><div><strong>Indicador orientativo</strong><div class="small">Este análisis no constituye una prueba definitiva de uso de inteligencia artificial.</div></div></div><h3 style="margin-top:18px">Fragmentos señalados</h3>${(r.aiFlags||[]).map(f=>`<div class="accordion-item open"><div class="accordion-head"><span class="badge badge-info">${e(f.level||'Revisar')}</span><div class="grow"><strong>${e(f.page||'')}</strong><div class="small muted">${e(f.reason||'')}</div></div></div><div class="accordion-body"><p>${e(f.fragment||'')}</p></div></div>`).join('')||'<p class="muted">No se señalaron fragmentos relevantes.</p>'}`;
    }
  };
  window.StudentView=V;
})();
