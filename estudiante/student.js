(() => {
  const { $, $$, api, firebaseGetStudent, toast, modal, config } = window.Revisor;
  const D = window.STUDENT_DEMO_DATA;
  const V = window.StudentView;
  let file=null, student=null, result=null, tab='academico';

  const nav=n=>{$$('[id^="student-section-"]').forEach(s=>s.classList.remove('active'));$(`#student-section-${n}`)?.classList.add('active');$$('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===n));$('.top-nav')?.classList.remove('open');history.replaceState?.(null,'',`#${n}`)};
  document.addEventListener('click',e=>{const n=e.target.closest('[data-nav]');if(n){e.preventDefault();nav(n.dataset.nav)}});

  const localStateKey=cedula=>`revisor_student_state_${cedula}`;
  const loadStudentState=cedula=>{try{return JSON.parse(localStorage.getItem(localStateKey(cedula))||'null')}catch{return null}};
  const saveStudentState=()=>{if(!student?.cedula)return;localStorage.setItem(localStateKey(student.cedula),JSON.stringify({used:student.used,available:student.available,reviews:student.reviews||[]}))};

  const mapFirebaseStudent=data=>{
    const cedula=String(data.cedula||data.id||data.firebaseDocumentId||'').trim(),local=loadStudentState(cedula)||{},reviews=Array.isArray(local.reviews)?local.reviews:[];
    const used=Number.isFinite(local.used)?local.used:reviews.length,available=Number.isFinite(local.available)?local.available:Math.max(0,3-used);
    return {id:data.id||cedula,cedula,name:data.nombres||'Estudiante',career:data.nombreCarreraActual||'',careerCode:data.codigoCarreraActual||'',campus:data.sede||'',institutionalEmail:data.correoInstitucional||'',personalEmail:data.correoPersonal||'',phone:data.celular||'',used,available,reviews,firebaseDocumentId:data.firebaseDocumentId||cedula};
  };

  async function applyRemoteState(s){
    if(!config.API_BASE_URL)return s;
    try{
      const remote=await api(`/students/${s.cedula}/state`);
      if(remote&&Array.isArray(remote.reviews)){s.used=Number(remote.used)||0;s.available=Number(remote.available)||0;s.reviews=remote.reviews;saveStudentState()}
    }catch(err){console.warn('No se pudo cargar el historial centralizado:',err)}
    return s;
  }

  const refresh=()=>{
    V.summary(student);V.reviews(student);
    const o=(student.reviews||[]).map(r=>`<option value="${r.id}">Revisión ${r.n} · ${r.score}/100</option>`).join('');
    $('#compare-a').innerHTML=o;$('#compare-b').innerHTML=o;
    if(student.reviews.length>1){$('#compare-a').value=student.reviews[0].id;$('#compare-b').value=student.reviews.at(-1).id}
  };

  const showApp=s=>{student=s;$('#student-login-view').classList.add('hidden');$('#student-app-view').classList.remove('hidden');$('#student-name-pill').textContent=s.name;$('#welcome-title').textContent=`Hola, ${s.name.split(' ')[0]}`;refresh();nav('inicio')};

  $('#student-login').addEventListener('submit',async e=>{
    e.preventDefault();const cedula=$('#student-id').value.trim();$('#student-login-msg').textContent='Consultando registro en UTET…';
    if(!/^\d{10}$/.test(cedula)){$('#student-login-msg').textContent='Ingresa una cédula válida de 10 dígitos.';return}
    try{
      const data=await firebaseGetStudent(cedula);if(!data){$('#student-login-msg').textContent='Estudiante no registrado. Verifica tu cédula o comunícate con la coordinación.';return}
      sessionStorage.setItem('revisor_student_cedula',cedula);const s=mapFirebaseStudent(data);student=s;await applyRemoteState(s);showApp(s);toast('Registro validado.','success');
    }catch(err){console.error(err);$('#student-login-msg').textContent=err.message==='FIREBASE_PERMISSION_DENIED'?'No fue posible validar el registro por permisos de Firestore.':'No fue posible consultar Firebase en este momento. Intenta nuevamente.'}
  });
  $('#student-logout').addEventListener('click',()=>{sessionStorage.removeItem('revisor_student_cedula');location.reload()});

  const setFile=f=>{if(!f)return;if(!/\.(pdf|docx)$/i.test(f.name)){toast('Solo se aceptan archivos PDF o DOCX.','danger');return}file=f;$('#selected-file').innerHTML=`<div class="file-chip"><div style="font-size:24px">▤</div><div class="grow"><strong>${f.name}</strong><span>${(f.size/1024/1024).toFixed(2)} MB</span></div><button class="btn btn-ghost btn-sm" id="remove-file">✕</button></div>`;$('#start-review').disabled=false};
  $('#choose-file').addEventListener('click',()=>$('#article-file').click());
  $('#article-file').addEventListener('change',e=>setFile(e.target.files[0]));
  $('#dropzone').addEventListener('dragover',e=>{e.preventDefault();e.currentTarget.classList.add('drag')});
  $('#dropzone').addEventListener('dragleave',e=>e.currentTarget.classList.remove('drag'));
  $('#dropzone').addEventListener('drop',e=>{e.preventDefault();e.currentTarget.classList.remove('drag');setFile(e.dataTransfer.files[0])});
  $('#start-review').addEventListener('click',()=>{if(!file)return;if(student.available<=0){toast('No tienes revisiones disponibles.','danger');return}$('#attempts-confirm').innerHTML=`<strong>Revisiones disponibles: ${student.available}</strong><div class="small">El intento solo se descuenta cuando se completan los 3 carriles académicos.</div>`;modal('confirm-review-modal')});

  const labels=['Archivo recibido','Validaciones automáticas','Problema y fundamentación','Metodología y análisis','Resultados y cierre académico','Consolidación de observaciones','Condiciones críticas de aprobación','Generación de informe'];
  const progress=i=>{$('#process-progress').style.width=`${Math.round(i/labels.length*100)}%`;$('#process-steps').innerHTML=labels.map((l,x)=>`<div class="step ${x<i?'done':x===i?'active':''}"><div class="step-icon">${x<i?'✓':x+1}</div><div class="step-text"><strong>${l}</strong><span>${x<i?'Completado':x===i?'Procesando…':'Pendiente'}</span></div></div>`).join('')};
  const progressFailed=i=>{i=Math.max(0,Math.min(labels.length-1,Number(i)||0));$('#process-progress').style.width=`${Math.round(i/labels.length*100)}%`;$('#process-steps').innerHTML=labels.map((l,x)=>`<div class="step ${x<i?'done':x===i?'active':''}"><div class="step-icon">${x<i?'✓':x===i?'✕':x+1}</div><div class="step-text"><strong>${l}</strong><span>${x<i?'Completado':x===i?'No completado':'Pendiente'}</span></div></div>`).join('')};
  const showResult=r=>{result=r;tab='academico';V.resultCards(r);$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.resultTab==='academico'));V.panel(r,'academico',D.rubric);nav('resultado')};

  function processOutcome(message,type='danger'){
    let box=$('#process-outcome');if(!box){box=document.createElement('div');box.id='process-outcome';box.style.marginTop='18px';$('#student-section-proceso .card')?.appendChild(box)}
    box.innerHTML=`<div class="alert alert-${type}"><div><strong>${type==='success'?'Revisión completada':'No fue posible completar la revisión'}</strong><div class="small" style="margin-top:4px">${message}</div><div style="margin-top:12px"><button class="btn btn-outline btn-sm" data-retry-review>Volver a Nueva revisión</button></div></div></div>`;
  }
  const clearOutcome=()=>{const b=$('#process-outcome');if(b)b.innerHTML=''};

  async function extractPdfText(sourceFile){
    if(!window.pdfjsLib)throw new Error('No se pudo cargar el lector PDF. Recarga la página e intenta nuevamente.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const data=new Uint8Array(await sourceFile.arrayBuffer()),pdf=await window.pdfjsLib.getDocument({data}).promise,pages=[];
    for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),content=await page.getTextContent(),text=content.items.map(item=>item.str||'').join(' ').replace(/\s+/g,' ').trim();pages.push(`\n[Página ${i}]\n${text}`)}
    return pages.join('\n').trim();
  }
  async function extractDocxText(sourceFile){if(!window.mammoth)throw new Error('No se pudo cargar el lector DOCX. Recarga la página e intenta nuevamente.');const out=await window.mammoth.extractRawText({arrayBuffer:await sourceFile.arrayBuffer()});return String(out.value||'').trim()}
  const extractArticleText=sourceFile=>/\.pdf$/i.test(sourceFile.name)?extractPdfText(sourceFile):/\.docx$/i.test(sourceFile.name)?extractDocxText(sourceFile):Promise.reject(new Error('Formato no compatible.'));

  async function runReal(){
    modal('confirm-review-modal',false);if(!config.API_BASE_URL){toast('El servicio de revisión con IA no está conectado.','danger');return}
    nav('proceso');clearOutcome();let currentStep=0;progress(currentStep);
    try{
      const articleText=await extractArticleText(file);if(articleText.length<700)throw new Error('No se pudo extraer suficiente texto del artículo. Verifica que el PDF tenga texto seleccionable.');
      currentStep=1;progress(currentStep);const start=await api('/reviews',{method:'POST',body:JSON.stringify({cedula:student.cedula,fileName:file.name,articleText})});
      let status,i=2;const deadline=Date.now()+10*60*1000;
      do{
        if(Date.now()>deadline)throw new Error('La revisión superó el tiempo máximo de espera.');
        await new Promise(r=>setTimeout(r,1800));status=await api(`/reviews/${start.id}/status`);i=Math.min(labels.length-1,Math.max(i,status.step||i));currentStep=i;progress(i)
      }while(!['complete','incomplete','failed'].includes(status.status));
      if(status.status==='complete'){
        progress(labels.length);const r=await api(`/reviews/${start.id}`);await applyRemoteState(student);refresh();showResult(r);toast(`Revisión completada con ${r.reviewers} carriles académicos.`,'success');
      }else{
        progressFailed(status.step??currentStep);await applyRemoteState(student);refresh();processOutcome(status.message||'El sistema no alcanzó los 3 carriles académicos. Tu intento no fue descontado.','danger');
      }
    }catch(err){console.error(err);progressFailed(currentStep);await applyRemoteState(student);refresh();processOutcome(`${err.message||'Ocurrió un error técnico.'} Tu intento no fue descontado.`,'danger')}
  }
  $('#confirm-start').addEventListener('click',runReal);

  document.addEventListener('click',e=>{
    if(e.target.closest('#remove-file')){file=null;$('#selected-file').innerHTML='';$('#article-file').value='';$('#start-review').disabled=true}
    if(e.target.closest('[data-retry-review]')){clearOutcome();nav('nueva')}
    const t=e.target.closest('[data-result-tab]');if(t){$$('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');tab=t.dataset.resultTab;V.panel(result,tab,D.rubric)}
    const a=e.target.closest('[data-accordion]');if(a)a.closest('.accordion-item').classList.toggle('open');
    const o=e.target.closest('[data-open-result]');if(o){const r=student.reviews.find(x=>x.id===o.dataset.openResult);if(r)showResult(r)}
  });

  $('#compare-btn').addEventListener('click',()=>{
    const a=student.reviews.find(r=>r.id===$('#compare-a').value),b=student.reviews.find(r=>r.id===$('#compare-b').value);if(!a||!b||a.id===b.id){toast('Selecciona dos revisiones diferentes.','danger');return}
    const diff=(b.score-a.score).toFixed(1),ac=a.categories||[],bc=b.categories||[],aByName=new Map(ac.map(c=>[String(c[0]),c]));
    const common=bc.filter(c=>aByName.has(String(c[0]))).length;
    const rubricNotice=common<Math.min(ac.length,bc.length)?'<div class="alert alert-info" style="margin-top:18px"><div>ℹ</div><div><strong>Rúbricas diferentes</strong><div class="small">Las revisiones fueron realizadas con criterios distintos. Las categorías sin equivalente se muestran como no comparables; la nota global debe interpretarse con cautela.</div></div></div>':'';
    const rows=bc.map(c=>{const old=aByName.get(String(c[0])),av=old?.[2],comparable=Number.isFinite(Number(av)),ch=comparable?(Number(c[2])-Number(av)).toFixed(1):null;return `<tr><td>${c[0]}</td><td>${comparable?`${av}/${old[1]}`:'—'}</td><td>${c[2]}/${c[1]}</td><td class="${ch===null?'':Number(ch)>=0?'text-success':'text-danger'}">${ch===null?'No comparable':`${Number(ch)>=0?'+':''}${ch}`}</td></tr>`}).join('');
    $('#compare-result').innerHTML=`<div class="grid grid-4"><div class="card metric"><div class="metric-label">Cambio de nota</div><div class="metric-value ${diff>=0?'text-success':'text-danger'}">${diff>=0?'+':''}${diff}</div></div><div class="card metric"><div class="metric-label">Similitud</div><div class="metric-value">${a.plagiarism}% → ${b.plagiarism}%</div></div><div class="card metric"><div class="metric-label">Posible IA</div><div class="metric-value">${a.ai}% → ${b.ai}%</div></div><div class="card metric"><div class="metric-label">Errores</div><div class="metric-value">${a.errors??'—'} → ${b.errors??'—'}</div></div></div>${rubricNotice}${bc.length?`<div class="table-wrap" style="margin-top:18px"><table><thead><tr><th>Área</th><th>Revisión ${a.n}</th><th>Revisión ${b.n}</th><th>Cambio</th></tr></thead><tbody>${rows}</tbody></table></div>`:''}`;
  });

  $('#download-report').addEventListener('click',()=>{if(!result)return;const txt=[`REVISIÓN ACADÉMICA ITSQMET`,`Archivo: ${result.file}`,`Nota académica: ${result.score}/100`,`Estado: ${result.approved?'APROBADO':'NO APROBADO'}`,result.approvalBlocked?`Condición crítica: ${result.approvalBlockReason||'Debe corregirse antes de aprobar.'}`:'',`Similitud: ${result.plagiarism}%`,`Posible IA: ${result.ai}%`,`Carriles académicos completos: ${result.reviewers}`,'',...(result.categories||[]).map(c=>`${c[0]}: ${c[2]}/${c[1]}`),'',...(result.observations||[]).map(o=>`${o.severity} · ${o.section} · ${o.title}\n${o.problem}\nCorrección: ${o.fix}\n`)].filter(Boolean).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain;charset=utf-8'}));a.download='informe-revision.txt';a.click();URL.revokeObjectURL(a.href)});
})();
