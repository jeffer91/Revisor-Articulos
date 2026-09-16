(() => {
  const { $, $$, api, firebaseGetStudent, toast, modal, config } = window.Revisor;
  const D = window.STUDENT_DEMO_DATA;
  const V = window.StudentView;
  let file=null, student=null, result=null, tab='academico';

  const nav=n=>{$$('[id^="student-section-"]').forEach(s=>s.classList.remove('active'));$(`#student-section-${n}`)?.classList.add('active');$$('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===n));$('.top-nav')?.classList.remove('open');history.replaceState?.(null,'',`#${n}`);};
  document.addEventListener('click',e=>{const n=e.target.closest('[data-nav]');if(n){e.preventDefault();nav(n.dataset.nav);}});

  const localStateKey=cedula=>`revisor_student_state_${cedula}`;
  const loadStudentState=cedula=>{try{return JSON.parse(localStorage.getItem(localStateKey(cedula))||'null');}catch{return null;}};
  const saveStudentState=()=>{if(!student?.cedula)return;localStorage.setItem(localStateKey(student.cedula),JSON.stringify({used:student.used,available:student.available,reviews:student.reviews||[]}));};

  const mapFirebaseStudent=data=>{
    const cedula=String(data.cedula||data.id||data.firebaseDocumentId||'').trim();
    const local=loadStudentState(cedula)||{};
    const reviews=Array.isArray(local.reviews)?local.reviews:[];
    const used=Number.isFinite(local.used)?local.used:reviews.filter(r=>r.status!=='Incompleta').length;
    const available=Number.isFinite(local.available)?local.available:Math.max(0,3-used);
    return {
      id:data.id||cedula, cedula,
      name:data.nombres||'Estudiante',
      career:data.nombreCarreraActual||'', careerCode:data.codigoCarreraActual||'', campus:data.sede||'',
      institutionalEmail:data.correoInstitucional||'', personalEmail:data.correoPersonal||'', phone:data.celular||'',
      used, available, reviews, firebaseDocumentId:data.firebaseDocumentId||cedula
    };
  };

  const refresh=()=>{
    V.summary(student); V.reviews(student);
    const o=(student.reviews||[]).map(r=>`<option value="${r.id}">Revisión ${r.n} · ${r.score}/100</option>`).join('');
    $('#compare-a').innerHTML=o; $('#compare-b').innerHTML=o;
    if(student.reviews.length>1){$('#compare-a').value=student.reviews[0].id;$('#compare-b').value=student.reviews.at(-1).id;}
  };

  const showApp=s=>{
    student=s;
    $('#student-login-view').classList.add('hidden');
    $('#student-app-view').classList.remove('hidden');
    $('#student-name-pill').textContent=s.name;
    $('#welcome-title').textContent=`Hola, ${s.name.split(' ')[0]}`;
    refresh(); nav('inicio');
  };

  $('#student-login').addEventListener('submit',async e=>{
    e.preventDefault();
    const cedula=$('#student-id').value.trim();
    $('#student-login-msg').textContent='Consultando registro en UTET…';
    if(!/^\d{10}$/.test(cedula)){$('#student-login-msg').textContent='Ingresa una cédula válida de 10 dígitos.';return;}
    try{
      const data=await firebaseGetStudent(cedula);
      if(!data){$('#student-login-msg').textContent='Estudiante no registrado. Verifica tu cédula o comunícate con la coordinación.';return;}
      sessionStorage.setItem('revisor_student_cedula',cedula);
      showApp(mapFirebaseStudent(data));
      toast('Registro validado en Firebase.','success');
    }catch(err){
      console.error(err);
      if(err.message==='FIREBASE_PERMISSION_DENIED') $('#student-login-msg').textContent='No fue posible validar el registro por permisos de Firestore.';
      else $('#student-login-msg').textContent='No fue posible consultar Firebase en este momento. Intenta nuevamente.';
    }
  });

  $('#student-logout').addEventListener('click',()=>{sessionStorage.removeItem('revisor_student_cedula');location.reload();});

  const setFile=f=>{if(!f)return;if(!/\.(pdf|docx)$/i.test(f.name)){toast('Solo se aceptan archivos PDF o DOCX.','danger');return;}file=f;$('#selected-file').innerHTML=`<div class="file-chip"><div style="font-size:24px">▤</div><div class="grow"><strong>${f.name}</strong><span>${(f.size/1024/1024).toFixed(2)} MB</span></div><button class="btn btn-ghost btn-sm" id="remove-file">✕</button></div>`;$('#start-review').disabled=false;};
  $('#choose-file').addEventListener('click',()=>$('#article-file').click());
  $('#article-file').addEventListener('change',e=>setFile(e.target.files[0]));
  $('#dropzone').addEventListener('dragover',e=>{e.preventDefault();e.currentTarget.classList.add('drag')});
  $('#dropzone').addEventListener('dragleave',e=>e.currentTarget.classList.remove('drag'));
  $('#dropzone').addEventListener('drop',e=>{e.preventDefault();e.currentTarget.classList.remove('drag');setFile(e.dataTransfer.files[0])});

  $('#start-review').addEventListener('click',()=>{
    if(!file)return;
    if(student.available<=0){toast('No tienes revisiones disponibles.','danger');return;}
    $('#attempts-confirm').innerHTML=`<strong>Revisiones disponibles: ${student.available}</strong><div class="small">Si no se alcanzan 3 IA exitosas, el intento no se descuenta.</div>`;
    modal('confirm-review-modal');
  });

  const labels=['Archivo recibido','Estructura y formato institucional','Evaluación académica','Verificación de referencias','Análisis de similitud','Posible uso de IA','Consolidación de observaciones','Generación de informe'];
  const progress=i=>{$('#process-progress').style.width=`${Math.round(i/labels.length*100)}%`;$('#process-steps').innerHTML=labels.map((l,x)=>`<div class="step ${x<i?'done':x===i?'active':''}"><div class="step-icon">${x<i?'✓':x+1}</div><div class="step-text"><strong>${l}</strong><span>${x<i?'Completado':x===i?'Procesando…':'Pendiente'}</span></div></div>`).join('');};
  const showResult=r=>{result=r;tab='academico';V.resultCards(r);$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.resultTab==='academico'));V.panel(r,'academico',D.rubric);nav('resultado');};

  async function runReal(){
    modal('confirm-review-modal',false);
    if(!config.API_BASE_URL){
      toast('El servicio de revisión con IA todavía no está conectado al backend seguro.','danger');
      return;
    }
    nav('proceso'); progress(0);
    try{
      const f=new FormData(); f.append('file',file); f.append('cedula',student.cedula);
      const start=await api('/reviews',{method:'POST',body:f});
      let status,i=1;
      do{
        await new Promise(r=>setTimeout(r,1800));
        status=await api(`/reviews/${start.id}/status`);
        i=Math.min(labels.length-1,Math.max(i,status.step||i)); progress(i);
      }while(!['complete','incomplete','failed'].includes(status.status));
      if(status.status==='complete'){
        const r=await api(`/reviews/${start.id}`);
        student.reviews.push(r); student.used++; student.available--;
        saveStudentState(); refresh(); showResult(r); toast('Revisión completada.','success');
      }else{
        nav('nueva'); toast('No fue posible completar la revisión. Tu intento no fue descontado. Intenta nuevamente más tarde.','danger');
      }
    }catch(err){
      console.error(err); nav('nueva'); toast('No fue posible completar la revisión. Tu intento no fue descontado.','danger');
    }
  }
  $('#confirm-start').addEventListener('click',runReal);

  document.addEventListener('click',e=>{
    if(e.target.closest('#remove-file')){file=null;$('#selected-file').innerHTML='';$('#article-file').value='';$('#start-review').disabled=true;}
    const t=e.target.closest('[data-result-tab]');if(t){$$('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');tab=t.dataset.resultTab;V.panel(result,tab,D.rubric);}
    const a=e.target.closest('[data-accordion]');if(a)a.closest('.accordion-item').classList.toggle('open');
    const o=e.target.closest('[data-open-result]');if(o){const r=student.reviews.find(x=>x.id===o.dataset.openResult);if(r)showResult(r);}
  });

  $('#compare-btn').addEventListener('click',()=>{
    const a=student.reviews.find(r=>r.id===$('#compare-a').value),b=student.reviews.find(r=>r.id===$('#compare-b').value);
    if(!a||!b||a.id===b.id){toast('Selecciona dos revisiones diferentes.','danger');return;}
    const diff=(b.score-a.score).toFixed(1),ac=a.categories||[],bc=b.categories||[];
    $('#compare-result').innerHTML=`<div class="grid grid-4"><div class="card metric"><div class="metric-label">Cambio de nota</div><div class="metric-value ${diff>=0?'text-success':'text-danger'}">${diff>=0?'+':''}${diff}</div></div><div class="card metric"><div class="metric-label">Similitud</div><div class="metric-value">${a.plagiarism}% → ${b.plagiarism}%</div></div><div class="card metric"><div class="metric-label">Posible IA</div><div class="metric-value">${a.ai}% → ${b.ai}%</div></div><div class="card metric"><div class="metric-label">Errores</div><div class="metric-value">${a.errors??'—'} → ${b.errors??'—'}</div></div></div>${bc.length?`<div class="table-wrap" style="margin-top:18px"><table><thead><tr><th>Área</th><th>Revisión ${a.n}</th><th>Revisión ${b.n}</th><th>Cambio</th></tr></thead><tbody>${bc.map((c,i)=>{const av=ac[i]?.[2]||0,ch=(c[2]-av).toFixed(1);return `<tr><td>${c[0]}</td><td>${av}/${c[1]}</td><td>${c[2]}/${c[1]}</td><td class="${ch>=0?'text-success':'text-danger'}">${ch>=0?'+':''}${ch}</td></tr>`}).join('')}</tbody></table></div>`:''}`;
  });

  $('#download-report').addEventListener('click',()=>{
    if(!result)return;
    const txt=[`REVISIÓN ACADÉMICA ITSQMET`,`Archivo: ${result.file}`,`Nota académica: ${result.score}/100`,`Similitud: ${result.plagiarism}%`,`Posible IA: ${result.ai}%`,`IA exitosas: ${result.reviewers}`,'',...(result.observations||[]).map(o=>`${o.severity} · ${o.section} · ${o.title}\n${o.problem}\nCorrección: ${o.fix}\n`)].join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain;charset=utf-8'}));a.download='informe-revision.txt';a.click();URL.revokeObjectURL(a.href);
  });
})();
