(() => {
  const { api, esc } = window.Revisor;
  const $ = s => document.querySelector(s);
  let file = null;

  const show = id => {
    ['#view-upload','#view-process','#view-result'].forEach(x=>$(x)?.classList.remove('active'));
    $(id)?.classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  };
  const showApp=()=>{
    $('#research-login-view')?.classList.add('hidden');
    $('#research-app')?.classList.remove('hidden');
    show('#view-upload');
  };
  const logout=()=>{
    sessionStorage.removeItem('revisor_research_token');
    location.reload();
  };

  $('#research-login')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const usuario=$('#research-user')?.value.trim()||'',pin=$('#research-pin')?.value.trim()||'',msg=$('#research-login-msg');
    if(msg)msg.textContent='Validando acceso…';
    try{
      const auth=await api('/research/login',{method:'POST',body:JSON.stringify({usuario,pin})});
      if(!auth?.token)throw new Error('No fue posible crear la sesión.');
      sessionStorage.removeItem('revisor_student_token');sessionStorage.removeItem('revisor_student_cedula');sessionStorage.setItem('revisor_research_token',auth.token);
      if(msg)msg.textContent='';
      showApp();
    }catch(err){if(msg)msg.textContent=err.message||'No fue posible validar el acceso.'}
  });
  $('#research-logout')?.addEventListener('click',logout);
  if(sessionStorage.getItem('revisor_research_token'))showApp();

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
      const articleText=await extractText(file);
      if(articleText.length<700)throw new Error('No se pudo extraer suficiente texto del artículo. Verifica que el PDF tenga texto seleccionable.');
      if(articleText.length>2500000)throw new Error('El documento extraído es demasiado extenso para una revisión segura.');
      $('#process-progress').style.width='18%';
      $('#process-text').innerHTML='<strong>Iniciando evaluación académica…</strong>';
      const start=await api('/reviews',{method:'POST',body:JSON.stringify({fileName:file.name,articleText})});
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
        status=await api(`/reviews/${start.id}/status`);
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
        $('#process-subtitle').textContent=partial?'Uno de los carriles académicos no logró finalizar.':'La revisión terminó por un problema técnico.';
        const completed=(status.lanes||[]).filter(x=>x.status==='complete').length;
        $('#process-progress').style.width=`${Math.max(18,Math.round(completed/3*100))}%`;
        const details=(status.failures||[]).slice(-5).map(x=>`<li><strong>${esc(x.lane||'Carril')}</strong> · ${esc(x.provider||'Proveedor')} / ${esc(x.model||'Modelo')}: ${esc(x.status||'Error')}</li>`).join('');
        $('#process-error').innerHTML=`<div class="alert ${partial?'alert-warning':'alert-danger'}"><div>!</div><div><strong>${partial?'Quedó un carril pendiente':'La revisión se interrumpió'}</strong><div class="small">${esc(status.message||'No fue posible completar la revisión.')}</div>${details?`<ul class="small" style="margin:10px 0 0 18px">${details}</ul>`:''}<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="retry-review">Reintentar revisión</button><button class="btn btn-outline btn-sm" id="back-upload">Volver</button></div></div></div>`;
        $('#retry-review')?.addEventListener('click',()=>void startReview());
        $('#back-upload')?.addEventListener('click',()=>show('#view-upload'));
        return;
      }

      const result=await api(`/reviews/${start.id}`);
      $('#process-title').textContent='Revisión completada';
      $('#process-subtitle').textContent='Los tres carriles académicos finalizaron correctamente.';
      $('#process-progress').style.width='100%';
      renderResult(result);
    }catch(err){
      console.error(err);
      if(/sesión|session|401/i.test(String(err.message||'')))sessionStorage.removeItem('revisor_research_token');
      $('#process-title').textContent='No fue posible completar la revisión';
      $('#process-subtitle').textContent='Se produjo un problema antes de finalizar el análisis.';
      $('#process-error').innerHTML=`<div class="alert alert-danger"><div>!</div><div><strong>Error de revisión</strong><div class="small">${esc(err.message||'Ocurrió un error técnico.')}</div><div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="retry-review">Reintentar revisión</button><button class="btn btn-outline btn-sm" id="back-upload">Volver</button></div></div></div>`;
      $('#retry-review')?.addEventListener('click',()=>void startReview());
      $('#back-upload')?.addEventListener('click',()=>show('#view-upload'));
    }
  }

  $('#start-review')?.addEventListener('click',startReview);
  $('#new-review')?.addEventListener('click',()=>{
    file=null;$('#selected-file').innerHTML='';$('#article-file').value='';$('#start-review').disabled=true;show('#view-upload');
  });
})();
