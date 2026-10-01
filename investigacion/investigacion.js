(() => {
  const { api, esc, toast } = window.Revisor;
  const $ = s => document.querySelector(s);
  let file = null, lastArticleText = '', currentJobId = '';

  const show = id => {
    ['#view-upload','#view-process','#view-result','#view-learning','#view-dataset'].forEach(x=>$(x)?.classList.remove('active'));
    $(id)?.classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  };
  let sessionPromise=null;
  async function ensureResearchSession(){
    sessionStorage.removeItem('revisor_student_token');
    sessionStorage.removeItem('revisor_student_cedula');
    const existing=sessionStorage.getItem('revisor_research_token');
    if(existing)return existing;
    if(sessionPromise)return sessionPromise;
    sessionPromise=api('/research/session',{method:'POST',body:'{}'}).then(auth=>{
      if(!auth?.token)throw new Error('No fue posible iniciar la sesión de revisión.');
      sessionStorage.setItem('revisor_research_token',auth.token);
      return auth.token;
    }).finally(()=>{sessionPromise=null});
    return sessionPromise;
  }
  void ensureResearchSession().catch(err=>console.error('research session:',err));

  const statuses=['Cumple','Parcial alto','Parcial','Parcial bajo','No cumple'];
  const metric=(label,value,sub='')=>`<div class="card metric metric-accent"><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}</div><div class="metric-sub">${esc(sub)}</div></div>`;
  const statusBadge=status=>{const s=String(status||'Sin dato'),k=s==='Cumple'?'success':s==='No cumple'?'danger':s.includes('bajo')?'warning':'info';return `<span class="badge badge-${k}">${esc(s)}</span>`};
  const evidence=value=>Array.isArray(value)?value.join(' · '):String(value||'');

  async function loadLearning(jobId=''){
    await ensureResearchSession();
    show('#view-learning');
    const [stats,jobs]=await Promise.all([api('/research/lab/stats'),api('/research/lab/jobs?limit=50')]);
    $('#learning-stats').innerHTML=metric('Artículos',stats.articles,'guardados para investigación')+metric('Validados',stats.reviewed_articles,'artículos con decisión humana')+metric('Ejemplos',stats.examples,'listos para entrenamiento')+metric('Motor',stats.shadowVersion,stats.rubricVersion);
    $('#learning-jobs').innerHTML=`<table><thead><tr><th>Artículo</th><th>Estado</th><th>Validaciones</th><th>Rúbrica</th><th></th></tr></thead><tbody>${jobs.map(j=>`<tr><td><strong>${esc(j.file_name)}</strong><div class="small muted">${new Date(j.created_at).toLocaleString('es-EC')}</div></td><td>${esc(j.status)}</td><td>${esc(j.validated)} / ${esc(stats.totalMicrocriteria)}</td><td>${esc(j.rubric_version)}</td><td><button class="btn btn-outline btn-sm" data-open-lab="${esc(j.job_id)}">Comparar</button></td></tr>`).join('')||'<tr><td colspan="5" class="muted">Todavía no hay revisiones de investigación.</td></tr>'}</tbody></table>`;
    if(jobId)await loadLabDetail(jobId);
  }

  async function loadLabDetail(jobId){
    const data=await api(`/research/lab/reviews/${jobId}`),card=$('#learning-detail-card');
    card.classList.remove('hidden');card.dataset.jobId=jobId;
    $('#learning-detail-title').textContent=data.file;
    $('#learning-detail-meta').textContent=`${data.validated} / ${data.total} validados · ${data.shadowVersion} · ${data.rubricVersion}`;
    renderComparison(data);
    card.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderComparison(data){
    const only=$('#only-disagreements')?.checked;
    const rows=(data.rows||[]).filter(r=>!only||String(r.shadow?.status||'')!==String(r.external?.status||''));
    $('#learning-comparison').innerHTML=`<table><thead><tr><th>Microcriterio</th><th>ITSQMET sombra</th><th>Externa V4</th><th>Decisión humana</th><th>Evidencia / nota</th><th></th></tr></thead><tbody>${rows.map(r=>{
      const selected=r.validation?.final_status||r.external?.status||'Parcial';
      return `<tr data-micro-row="${esc(r.id)}"><td><strong>${esc(r.id)}</strong> · ${esc(r.label)}<div class="small muted">${esc(r.category)} · ${esc(r.weight)} pts</div></td><td>${statusBadge(r.shadow?.status)}<div class="small muted">conf. ${Math.round(Number(r.shadow?.confidence||0)*100)}%</div></td><td>${statusBadge(r.external?.status)}<div class="small muted">${esc(evidence(r.external?.evidence).slice(0,180))}</div></td><td><select class="select validation-status">${statuses.map(s=>`<option${s===selected?' selected':''}>${esc(s)}</option>`).join('')}</select></td><td><textarea class="textarea validation-note" rows="2" placeholder="Evidencia o nota del investigador">${esc(r.validation?.note||evidence(r.external?.evidence).slice(0,500))}</textarea></td><td><button class="btn btn-primary btn-sm save-validation">${r.validation?'Actualizar':'Validar'}</button></td></tr>`;
    }).join('')||'<tr><td colspan="6" class="muted">No hay discrepancias con el filtro actual.</td></tr>'}</tbody></table>`;
  }

  async function saveValidation(button){
    const row=button.closest('[data-micro-row]'),jobId=$('#learning-detail-card').dataset.jobId;
    if(!row||!jobId)return;
    button.disabled=true;
    try{
      const finalStatus=row.querySelector('.validation-status').value,note=row.querySelector('.validation-note').value;
      await api(`/research/lab/reviews/${jobId}/validate`,{method:'POST',body:JSON.stringify({microcriterionId:row.dataset.microRow,finalStatus,evidence:note,note})});
      toast('Validación guardada y convertida en ejemplo de entrenamiento.','success');
      await loadLabDetail(jobId);
    }catch(err){toast(err.message||'No se pudo guardar la validación.','danger')}finally{button.disabled=false}
  }

  async function loadDataset(){
    await ensureResearchSession();show('#view-dataset');
    const [stats,rows]=await Promise.all([api('/research/lab/stats'),api('/research/lab/dataset?limit=200')]);
    $('#dataset-stats').innerHTML=metric('Ejemplos',stats.examples,'validación humana')+metric('Artículos',stats.articles,'en investigación')+metric('Microcriterios',stats.totalMicrocriteria,'rúbrica vigente')+metric('Rúbrica',stats.rubricVersion,stats.shadowVersion);
    $('#dataset-table').innerHTML=`<table><thead><tr><th>Artículo</th><th>Microcriterio</th><th>Etiqueta humana</th><th>Extracto de entrenamiento</th><th>Versión</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.file_name)}</td><td><strong>${esc(r.microcriterion_id)}</strong><div class="small muted">${esc(r.target?.label||'')}</div></td><td>${statusBadge(r.target?.finalStatus)}</td><td>${esc(String(r.article_excerpt||'').slice(0,360))}</td><td>${esc(r.rubric_version)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">Aún no hay ejemplos validados. Abre Aprendizaje y valida microcriterios.</td></tr>'}</tbody></table>`;
  }

  const setFile = f => {
    if(!f)return;
    if(!/\.(pdf|docx)$/i.test(f.name)){alert('Solo se aceptan archivos PDF o DOCX.');return;}
    if(f.size>25*1024*1024){alert('El archivo supera el límite de 25 MB.');return;}
    file=f;
    $('#selected-file').innerHTML=`<div class="file-chip"><div style="font-size:24px">▤</div><div class="grow"><strong>${esc(f.name)}</strong><span>${(f.size/1024/1024).toFixed(2)} MB</span></div></div>`;
    $('#start-review').disabled=false;
  };

  $('#choose-file')?.addEventListener('click',()=>$('#article-file').click());
  $('#article-file')?.addEventListener('change',e=>setFile(e.target.files[0]));
  $('#dropzone')?.addEventListener('dragover',e=>{e.preventDefault();e.currentTarget.classList.add('drag')});
  $('#dropzone')?.addEventListener('dragleave',e=>e.currentTarget.classList.remove('drag'));
  $('#dropzone')?.addEventListener('drop',e=>{e.preventDefault();e.currentTarget.classList.remove('drag');setFile(e.dataTransfer.files[0])});

  async function extractPdf(f){
    if(!window.pdfjsLib)throw new Error('No se pudo cargar el lector PDF.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const data=new Uint8Array(await f.arrayBuffer());
    const pdf=await window.pdfjsLib.getDocument({data}).promise;
    if(pdf.numPages>100)throw new Error('El PDF supera el límite de 100 páginas.');
    const pages=[];
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i),content=await page.getTextContent();
      const text=(content.items||[]).map(x=>x.str||'').join(' ').replace(/\s+/g,' ').trim();
      pages.push(`\n[Página ${i}]\n${text}`);
    }
    return pages.join('\n').trim();
  }

  async function extractDocx(f){
    if(!window.mammoth)throw new Error('No se pudo cargar el lector DOCX.');
    const out=await window.mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()});
    return String(out.value||'').trim();
  }

  const extractText=f=>/\.pdf$/i.test(f.name)?extractPdf(f):extractDocx(f);

  function renderLaneProgress(lanes=[]){
    const box=$('#lane-progress');if(!box)return;
    const state={complete:['✓','Completado','badge-success'],processing:['…','Procesando','badge-info'],failed:['!','No completado','badge-danger'],pending:['·','Pendiente','badge-warning']};
    box.innerHTML=(lanes||[]).map(l=>{
      const [icon,label,klass]=state[l.status]||state.pending;
      return `<div class="step"><div class="step-icon">${icon}</div><div class="step-text"><strong>${esc(l.label)}</strong><span><span class="badge ${klass}">${label}</span></span></div></div>`;
    }).join('');
  }

  function renderResult(r){
    $('#result-meta').textContent=`${r.file} · ${new Date(r.date).toLocaleString('es-EC')}`;
    $('#score-card').innerHTML=`<div class="score-big">${esc(r.score)}</div><div class="score-caption">Nota académica / 100</div><div style="margin-top:10px"><span class="badge ${r.approved?'badge-success':'badge-danger'}">${r.approved?'APROBADO':'NO APROBADO'}</span></div>`;
    $('#result-summary').innerHTML=`<p><strong>Carriles completos:</strong> ${esc(r.reviewers)}</p><p><strong>Comentarios prioritarios:</strong> ${esc((r.observations||[]).length)}</p>${r.approvalBlocked?'<div class="alert alert-danger"><div>!</div><div><strong>Condición crítica</strong><div class="small">Existe una condición académica crítica confirmada que impide la aprobación hasta corregirse.</div></div></div>':''}`;
    $('#critical-alerts').innerHTML=(r.critical||[]).map(x=>`<div class="alert alert-danger" style="margin-bottom:10px"><div>!</div><div><strong>Alerta crítica</strong><div class="small">${esc(x)}</div></div></div>`).join('');
    $('#rubric-result').innerHTML=(r.categories||[]).map(([n,m,s])=>`<div style="margin:13px 0"><div style="display:flex;justify-content:space-between;gap:15px"><strong>${esc(n)}</strong><span>${esc(s)} / ${esc(m)}</span></div><div class="progress" style="margin-top:7px"><span style="width:${Math.min(100,(Number(s)||0)/(Number(m)||1)*100)}%"></span></div></div>`).join('');
    $('#observations-result').innerHTML=(r.observations||[]).map(o=>`<div class="accordion-item open"><div class="accordion-head"><span class="badge ${o.severity==='Crítico'?'badge-danger':o.severity==='Alto'?'badge-warning':'badge-info'}">${esc(o.severity)}</span><div class="grow"><strong>${esc(o.page||'Ubicación no determinada')} · ${esc(o.section)}</strong><div class="small muted">${esc(o.title)}</div></div></div><div class="accordion-body"><dl>${o.original?`<dt>Texto observado</dt><dd>${esc(o.original)}</dd>`:''}<dt>Problema</dt><dd>${esc(o.problem||'')}</dd><dt>Corrección</dt><dd>${esc(o.fix||'')}</dd></dl></div></div>`).join('') || '<p class="muted">Sin observaciones prioritarias.</p>';
    show('#view-result');
  }

  function resetProcessView(message='Preparando revisión…'){
    show('#view-process');
    $('#process-title').textContent='Analizando artículo';
    $('#process-subtitle').textContent='No cierres esta pestaña mientras se completa la revisión.';
    $('#process-progress').style.width='18%';
    $('#process-text').innerHTML=`<strong>${esc(message)}</strong>`;
    $('#process-error').innerHTML='';
  }

  async function monitorReview(jobId){
    const deadline=Date.now()+20*60*1000;
    let status;
    do{
      if(Date.now()>deadline){
        $('#process-title').textContent='La revisión continúa';
        $('#process-subtitle').textContent='El servidor sigue procesando el artículo.';
        $('#process-error').innerHTML='<div class="alert alert-warning"><div>!</div><div><strong>La revisión continúa en el servidor</strong><div class="small">No inicies otra revisión mientras este trabajo siga activo.</div></div></div>';
        return;
      }
      await new Promise(r=>setTimeout(r,1800));
      status=await api(`/reviews/${jobId}/status`);
      renderLaneProgress(status.lanes||[]);
      const completed=(status.lanes||[]).filter(x=>x.status==='complete').length;
      const processing=(status.lanes||[]).filter(x=>x.status==='processing').length;
      const pct=status.status==='complete'?100:Math.min(94,18+(completed*23)+(processing?9:0));
      $('#process-progress').style.width=`${pct}%`;
      $('#process-text').innerHTML=`<strong>${esc(status.message||'Analizando criterios y consolidando observaciones…')}</strong>`;
    }while(!['complete','incomplete','failed'].includes(status.status));

    if(status.status!=='complete'){
      const partial=status.status==='incomplete';
      $('#process-title').textContent=partial?'Revisión parcialmente completada':'No fue posible completar la revisión';
      $('#process-subtitle').textContent=partial?'Los carriles completados quedaron guardados.':'La revisión terminó por un problema técnico.';
      const completed=(status.lanes||[]).filter(x=>x.status==='complete').length;
      $('#process-progress').style.width=`${Math.max(18,Math.round(completed/3*100))}%`;
      const details=(status.failures||[]).slice(-5).map(x=>`<li><strong>${esc(x.lane||'Carril')}</strong> · ${esc(x.provider||'Proveedor')} / ${esc(x.model||'Modelo')}: ${esc(x.status||'Error')}</li>`).join('');
      const retryLabel=partial?'Reintentar solo lo pendiente':'Reintentar revisión';
      $('#process-error').innerHTML=`<div class="alert ${partial?'alert-warning':'alert-danger'}"><div>!</div><div><strong>${partial?'Quedó un carril pendiente':'La revisión se interrumpió'}</strong><div class="small">${esc(status.message||'No fue posible completar la revisión.')}</div>${details?`<ul class="small" style="margin:10px 0 0 18px">${details}</ul>`:''}<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="retry-review">${retryLabel}</button><button class="btn btn-outline btn-sm" id="back-upload">Volver</button></div></div></div>`;
      $('#retry-review')?.addEventListener('click',()=>void retryPendingReview());
      $('#back-upload')?.addEventListener('click',()=>show('#view-upload'));
      return;
    }

    const result=await api(`/reviews/${jobId}`);
    $('#process-title').textContent='Revisión completada';
    $('#process-subtitle').textContent='Los tres carriles académicos finalizaron correctamente.';
    $('#process-progress').style.width='100%';
    renderResult(result);
  }

  async function retryPendingReview(){
    if(!currentJobId||lastArticleText.length<700){await startReview();return;}
    resetProcessView('Reanudando únicamente los carriles pendientes…');
    try{
      await ensureResearchSession();
      await api(`/reviews/${currentJobId}/retry`,{method:'POST',body:JSON.stringify({articleText:lastArticleText})});
      await monitorReview(currentJobId);
    }catch(err){
      console.error(err);
      $('#process-title').textContent='No fue posible reanudar la revisión';
      $('#process-subtitle').textContent='Los carriles ya completados permanecen guardados.';
      $('#process-error').innerHTML=`<div class="alert alert-danger"><div>!</div><div><strong>Error al reintentar</strong><div class="small">${esc(err.message||'Ocurrió un error técnico.')}</div><div style="margin-top:12px"><button class="btn btn-outline btn-sm" id="back-upload">Volver</button></div></div></div>`;
      $('#back-upload')?.addEventListener('click',()=>show('#view-upload'));
    }
  }

  async function startReview(){
    if(!file)return;
    show('#view-process');
    $('#process-title').textContent='Analizando artículo';
    $('#process-subtitle').textContent='No cierres esta pestaña mientras se completa la revisión.';
    $('#process-progress').style.width='8%';
    $('#process-text').innerHTML='<strong>Extrayendo contenido del artículo…</strong>';
    $('#process-error').innerHTML='';
    renderLaneProgress([]);
    try{
      await ensureResearchSession();
      const articleText=await extractText(file);
      if(articleText.length<700)throw new Error('No se pudo extraer suficiente texto del artículo. Verifica que el PDF tenga texto seleccionable.');
      if(articleText.length>2500000)throw new Error('El documento extraído es demasiado extenso para una revisión segura.');
      lastArticleText=articleText;
      $('#process-progress').style.width='18%';
      $('#process-text').innerHTML='<strong>Iniciando evaluación académica…</strong>';
      const start=await api('/reviews',{method:'POST',body:JSON.stringify({fileName:file.name,articleText})});
      currentJobId=start.id;
      await monitorReview(currentJobId);
    }catch(err){
      console.error(err);
      if(/sesión|session|401/i.test(String(err.message||'')))sessionStorage.removeItem('revisor_research_token');
      $('#process-title').textContent='No fue posible completar la revisión';
      $('#process-subtitle').textContent='Se produjo un problema antes de finalizar el análisis.';
      $('#process-error').innerHTML=`<div class="alert alert-danger"><div>!</div><div><strong>Error de revisión</strong><div class="small">${esc(err.message||'Ocurrió un error técnico.')}</div><div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="retry-review">Reintentar revisión</button><button class="btn btn-outline btn-sm" id="back-upload">Volver</button></div></div></div>`;
      $('#retry-review')?.addEventListener('click',()=>void retryPendingReview());
      $('#back-upload')?.addEventListener('click',()=>show('#view-upload'));
    }
  }

  $('#start-review')?.addEventListener('click',startReview);
  $('#open-learning-current')?.addEventListener('click',()=>void loadLearning(currentJobId).catch(err=>toast(err.message||'No se pudo abrir el laboratorio.','danger')));
  $('#refresh-learning')?.addEventListener('click',()=>void loadLearning($('#learning-detail-card')?.dataset.jobId||'').catch(err=>toast(err.message||'No se pudo actualizar.','danger')));
  $('#refresh-dataset')?.addEventListener('click',()=>void loadDataset().catch(err=>toast(err.message||'No se pudo actualizar el dataset.','danger')));
  $('#only-disagreements')?.addEventListener('change',()=>{const jobId=$('#learning-detail-card')?.dataset.jobId;if(jobId)void loadLabDetail(jobId).catch(err=>toast(err.message||'No se pudo filtrar.','danger'))});
  $('#learning-jobs')?.addEventListener('click',event=>{const button=event.target.closest('[data-open-lab]');if(button)void loadLabDetail(button.dataset.openLab).catch(err=>toast(err.message||'No se pudo abrir la revisión.','danger'))});
  $('#learning-comparison')?.addEventListener('click',event=>{const button=event.target.closest('.save-validation');if(button)void saveValidation(button)});
  document.querySelectorAll('[data-research-view]').forEach(link=>link.addEventListener('click',event=>{
    event.preventDefault();
    const view=link.dataset.researchView;
    document.querySelectorAll('.top-nav [data-research-view]').forEach(x=>x.classList.toggle('active',x.dataset.researchView===view));
    if(view==='learning')void loadLearning().catch(err=>toast(err.message||'No se pudo abrir Aprendizaje.','danger'));
    else if(view==='dataset')void loadDataset().catch(err=>toast(err.message||'No se pudo abrir el Dataset.','danger'));
    else show('#view-upload');
  }));
  $('#new-review')?.addEventListener('click',()=>{
    file=null;lastArticleText='';currentJobId='';$('#selected-file').innerHTML='';$('#article-file').value='';$('#start-review').disabled=true;show('#view-upload');
  });
})();
