(() => {
  const { api } = window.Revisor;
  const $ = s => document.querySelector(s);
  let file = null;

  const show = id => {
    ['#view-upload','#view-process','#view-result'].forEach(x=>$(x)?.classList.remove('active'));
    $(id)?.classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  };

  const setFile = f => {
    if(!f)return;
    if(!/\.(pdf|docx)$/i.test(f.name)){alert('Solo se aceptan archivos PDF o DOCX.');return;}
    file=f;
    $('#selected-file').innerHTML=`<div class="file-chip"><div style="font-size:24px">▤</div><div class="grow"><strong>${f.name}</strong><span>${(f.size/1024/1024).toFixed(2)} MB</span></div></div>`;
    $('#start-review').disabled=false;
  };

  $('#choose-file').addEventListener('click',()=>$('#article-file').click());
  $('#article-file').addEventListener('change',e=>setFile(e.target.files[0]));
  $('#dropzone').addEventListener('dragover',e=>{e.preventDefault();e.currentTarget.classList.add('drag')});
  $('#dropzone').addEventListener('dragleave',e=>e.currentTarget.classList.remove('drag'));
  $('#dropzone').addEventListener('drop',e=>{e.preventDefault();e.currentTarget.classList.remove('drag');setFile(e.dataTransfer.files[0])});

  async function extractPdf(f){
    if(!window.pdfjsLib)throw new Error('No se pudo cargar el lector PDF.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const data=new Uint8Array(await f.arrayBuffer());
    const pdf=await window.pdfjsLib.getDocument({data}).promise;
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
  const technicalId=()=>`99${String(Math.floor(Math.random()*100000000)).padStart(8,'0')}`;

  function renderResult(r){
    $('#result-meta').textContent=`${r.file} · ${new Date(r.date).toLocaleString('es-EC')}`;
    $('#score-card').innerHTML=`<div class="score-big">${r.score}</div><div class="score-caption">Nota académica / 100</div><div style="margin-top:10px"><span class="badge ${r.approved?'badge-success':'badge-danger'}">${r.approved?'APROBADO':'NO APROBADO'}</span></div>`;
    $('#result-summary').innerHTML=`<p><strong>Revisores exitosos:</strong> ${r.reviewers}</p><p><strong>Observaciones:</strong> ${(r.observations||[]).length}</p>${r.approvalBlocked?'<div class="alert alert-danger"><div>!</div><div><strong>Condición crítica</strong><div class="small">Existe una condición académica crítica que impide la aprobación hasta corregirse.</div></div></div>':''}`;
    $('#critical-alerts').innerHTML=(r.critical||[]).map(x=>`<div class="alert alert-danger" style="margin-bottom:10px"><div>!</div><div><strong>Alerta crítica</strong><div class="small">${x}</div></div></div>`).join('');
    $('#rubric-result').innerHTML=(r.categories||[]).map(([n,m,s])=>`<div style="margin:13px 0"><div style="display:flex;justify-content:space-between;gap:15px"><strong>${n}</strong><span>${s} / ${m}</span></div><div class="progress" style="margin-top:7px"><span style="width:${Math.min(100,(Number(s)||0)/(Number(m)||1)*100)}%"></span></div></div>`).join('');
    $('#observations-result').innerHTML=(r.observations||[]).map(o=>`<div class="accordion-item open"><div class="accordion-head"><span class="badge ${o.severity==='Crítico'?'badge-danger':o.severity==='Alto'?'badge-warning':'badge-info'}">${o.severity}</span><div class="grow"><strong>${o.page||'Ubicación no determinada'} · ${o.section}</strong><div class="small muted">${o.title}</div></div></div><div class="accordion-body"><dl>${o.original?`<dt>Texto observado</dt><dd>${o.original}</dd>`:''}<dt>Problema</dt><dd>${o.problem||''}</dd><dt>Corrección</dt><dd>${o.fix||''}</dd></dl></div></div>`).join('') || '<p class="muted">Sin observaciones relevantes.</p>';
    show('#view-result');
  }

  async function startReview(){
    if(!file)return;
    show('#view-process');
    $('#process-progress').style.width='8%';
    $('#process-text').innerHTML='<strong>Extrayendo contenido del artículo…</strong>';
    $('#process-error').innerHTML='';
    try{
      const articleText=await extractText(file);
      if(articleText.length<700)throw new Error('No se pudo extraer suficiente texto del artículo. Verifica que el PDF tenga texto seleccionable.');
      $('#process-progress').style.width='18%';
      $('#process-text').innerHTML='<strong>Iniciando evaluación académica…</strong>';
      const start=await api('/reviews',{method:'POST',body:JSON.stringify({cedula:technicalId(),fileName:file.name,articleText})});
      const deadline=Date.now()+10*60*1000;
      let status;
      do{
        if(Date.now()>deadline)throw new Error('La revisión superó el tiempo máximo de espera.');
        await new Promise(r=>setTimeout(r,1800));
        status=await api(`/reviews/${start.id}/status`);
        const pct=Math.min(92,18+(Number(status.step||1)/8)*74);
        $('#process-progress').style.width=`${pct}%`;
        $('#process-text').innerHTML='<strong>Analizando criterios y consolidando observaciones…</strong>';
      }while(!['complete','incomplete','failed'].includes(status.status));
      if(status.status!=='complete')throw new Error(status.message||'No fue posible completar la revisión.');
      const result=await api(`/reviews/${start.id}`);
      $('#process-progress').style.width='100%';
      renderResult(result);
    }catch(err){
      console.error(err);
      $('#process-error').innerHTML=`<div class="alert alert-danger"><div>!</div><div><strong>No fue posible completar la revisión</strong><div class="small">${err.message||'Ocurrió un error técnico.'}</div><div style="margin-top:12px"><button class="btn btn-outline btn-sm" id="retry">Volver</button></div></div></div>`;
      $('#retry')?.addEventListener('click',()=>show('#view-upload'));
    }
  }

  $('#start-review').addEventListener('click',startReview);
  $('#new-review').addEventListener('click',()=>{
    file=null;$('#selected-file').innerHTML='';$('#article-file').value='';$('#start-review').disabled=true;show('#view-upload');
  });
})();