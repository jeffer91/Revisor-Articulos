const { RUBRIC } = require('./catalog');

const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const strip=v=>String(v||'').replace(/\s+/g,' ').trim();
const lower=v=>strip(v).toLowerCase();

const CRITERIA = {
  'Coherencia título–problema–pregunta–objetivos':'Exigir trazabilidad clara entre título, problema, pregunta cuando corresponda y objetivos. El título debe representar exactamente lo investigado.',
  'Problema y justificación':'El problema debe estar sustentado con evidencia o argumentación documentada, no solo afirmado. Valorar relevancia, beneficiarios, necesidad y factibilidad.',
  'Fundamentación teórica y antecedentes':'Exigir fuentes pertinentes y actuales, conceptos centrales sustentados, comparación entre autores, antecedentes útiles y verdadero estado del conocimiento. No premiar cantidad de citas sin síntesis.',
  'Diseño metodológico':'Exigir enfoque, tipo, alcance y diseño correctamente identificados, justificados y coherentes con los objetivos y la naturaleza del estudio.',
  'Instrumentos y rigor de la obtención de información':'Evaluar el rigor de instrumentos o técnicas según el diseño. Cuantitativo: origen, construcción/adaptación, variables/dimensiones, validez, confiabilidad y escalas cuando corresponda. Cualitativo: guía/protocolo, credibilidad, triangulación, saturación y trazabilidad. Documental/revisión: matriz/protocolo de extracción, fuentes y criterios reproducibles.',
  'Población, muestra y recopilación':'Exigir población/unidad de análisis claramente definida y selección justificada. Cuantitativo: muestreo y tamaño. Cualitativo: criterios de selección y saturación/pertinencia. Documental: corpus, fuentes y criterios de inclusión/exclusión. El procedimiento de recopilación debe ser reproducible.',
  'Procesamiento y análisis de datos':'Exigir técnicas estadísticas o cualitativas apropiadas y justificadas, correspondencia con variables/categorías y consistencia de los cálculos o procedimientos visibles. No afirmar que cálculos no visibles son correctos.',
  'Resultados':'Deben responder realmente a los objetivos, mostrar evidencia suficiente y no incluir afirmaciones que los datos presentados no permiten sostener.',
  'Discusión académica':'Debe interpretar y contrastar los resultados con literatura pertinente, explicar coincidencias/diferencias, reconocer limitaciones y aportar interpretación propia; no basta repetir los resultados.',
  'Conclusiones':'Deben cubrir los objetivos y derivarse únicamente de los resultados obtenidos. No es obligatorio numerar una conclusión por objetivo si la cobertura es inequívoca.',
  'Aporte, utilidad y propuesta':'Valorar aporte académico o aplicado, utilidad y pertinencia. No exigir novedad científica absoluta. Si el artículo promete una propuesta, debe estar realmente desarrollada y sustentada.',
  'Calidad académica formal':'Valorar redacción académica, consistencia, APA, tablas/figuras, referencias y cumplimiento formal. Ética y confidencialidad, cuando sean aplicables, son además condiciones críticas independientes. No penalizar ORCID ni año/volumen provisional de la revista.'
};

const REVIEW_LANES = [
  {
    id:'problem-foundation',
    label:'Problema y fundamentación',
    categories:['Coherencia título–problema–pregunta–objetivos','Problema y justificación','Fundamentación teórica y antecedentes'],
    focus:['título','titulo','problema','pregunta','objetivo','justificación','justificacion','antecedente','fundamentación','fundamentacion','marco teórico','marco teorico','estado del arte','referencias']
  },
  {
    id:'methodology-analysis',
    label:'Metodología y análisis',
    categories:['Diseño metodológico','Instrumentos y rigor de la obtención de información','Población, muestra y recopilación','Procesamiento y análisis de datos'],
    focus:['metodolog','enfoque','tipo de investigación','tipo de investigacion','alcance','diseño','diseno','población','poblacion','muestra','muestreo','instrumento','entrevista','encuesta','observación','observacion','matriz','validez','confiabilidad','triangulación','triangulacion','saturación','saturacion','recopilación','recopilacion','recolección','recoleccion','procesamiento','análisis','analisis','estadíst','cualitativ']
  },
  {
    id:'results-closure',
    label:'Resultados y cierre académico',
    categories:['Resultados','Discusión académica','Conclusiones','Aporte, utilidad y propuesta','Calidad académica formal'],
    focus:['resultados','discusión','discusion','limitaciones','conclusiones','aporte','utilidad','propuesta','recomendaciones','tabla','figura','referencias','bibliografía','bibliografia','ética','etica','confidencialidad','consentimiento']
  }
];

const SECTION_PATTERNS = {
  resumen:/\bresumen\b/i,
  abstract:/\babstract\b/i,
  palabrasClave:/\bpalabras\s+clave\b|\bkeywords?\b/i,
  introduccion:/\bintroducci[oó]n\b/i,
  objetivos:/\bobjetivos?\b/i,
  metodologia:/\bmetodolog[ií]a\b|\bmateriales\s+y\s+m[eé]todos\b|\bm[eé]todos\b/i,
  resultados:/\bresultados\b/i,
  discusion:/\bdiscusi[oó]n\b/i,
  conclusiones:/\bconclusiones?\b/i,
  referencias:/\breferencias(?:\s+bibliogr[aá]ficas)?\b|\bbibliograf[ií]a\b/i
};

function firstIndex(text,re){
  const m=String(text||'').match(re);
  return m&&Number.isFinite(m.index)?m.index:-1;
}

function extractReferenceBlock(text){
  const refs=firstIndex(text,/\breferencias(?:\s+bibliogr[aá]ficas)?\b/i);
  const bib=firstIndex(text,/\bbibliograf[ií]a\b/i);
  const candidates=[refs,bib].filter(i=>i>=0);
  const idx=candidates.length?Math.min(...candidates):-1;
  return idx>=0?String(text).slice(idx):'';
}

function automaticObservation(section,title,problem,fix,severity='Alto'){
  return {severity,section,points:0,page:section,title,original:'',problem,why:'La evidencia y la trazabilidad deben ser visibles en el artículo para poder evaluarlas.',fix,proposal:'',source:'Automático'};
}

function analyzeAutomatic(text){
  const source=String(text||'').replace(/\u0000/g,' ').trim();
  const normalized=strip(source);
  const presence={};
  for(const [key,re] of Object.entries(SECTION_PATTERNS))presence[key]=re.test(source);

  const pageMatches=[...source.matchAll(/\[P[aá]gina\s+(\d+)\]/gi)].map(m=>Number(m[1])).filter(Number.isFinite);
  const pageCount=pageMatches.length?Math.max(...pageMatches):null;
  const wordCount=normalized?normalized.split(/\s+/).length:0;
  const refs=extractReferenceBlock(source);
  const refYears=[...refs.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(m=>Number(m[1])).filter(y=>y>=1900&&y<=new Date().getFullYear()+1);
  const currentYear=new Date().getFullYear();
  const recentYears=refYears.filter(y=>y>=currentYear-5);
  const recentRatio=refYears.length?Math.round(recentYears.length/refYears.length*100):null;
  const doiCount=(refs.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi)||[]).length;
  const urlCount=(refs.match(/https?:\/\/\S+/gi)||[]).length;
  const refStart=refs?source.indexOf(refs):source.length;
  const citationYearCount=[...source.slice(0,refStart).matchAll(/\b(19\d{2}|20\d{2})\b/g)].length;

  const core=['introduccion','metodologia','resultados','discusion','conclusiones','referencias'];
  const presentCore=core.filter(k=>presence[k]).length;
  const ordered=core.map(k=>({k,i:firstIndex(source,SECTION_PATTERNS[k])})).filter(x=>x.i>=0);
  const orderOk=ordered.length>=4&&ordered.every((x,i)=>i===0||x.i>ordered[i-1].i);
  let formalScore=(presentCore/core.length)*2.1;
  if(presence.resumen)formalScore+=.25;
  if(presence.abstract)formalScore+=.15;
  if(presence.palabrasClave)formalScore+=.15;
  if(orderOk)formalScore+=.35;
  formalScore=Math.round(clamp(formalScore,0,3)*10)/10;

  const observations=[];
  if(!presence.metodologia)observations.push(automaticObservation('Metodología','No se detectó una sección metodológica','No se identificó Metodología, Métodos o Materiales y métodos como sección reconocible.','Identificar explícitamente el diseño metodológico, las unidades de análisis, técnicas/instrumentos, procedimiento y análisis.','Crítico'));
  if(!presence.resultados)observations.push(automaticObservation('Resultados','No se detectó la sección de resultados','No se identificó una sección Resultados en el texto extraído.','Presentar resultados claramente identificados y vinculados con los objetivos.','Crítico'));
  if(!presence.discusion)observations.push(automaticObservation('Discusión','No se detectó la discusión','No se identificó una sección de Discusión.','Incorporar una discusión que contraste los resultados con literatura y explicite limitaciones.','Alto'));
  if(!presence.conclusiones)observations.push(automaticObservation('Conclusiones','No se detectaron conclusiones','No se identificó una sección Conclusiones.','Incluir conclusiones sustentadas en los resultados y que cubran los objetivos.','Alto'));
  if(!presence.referencias)observations.push(automaticObservation('Referencias','No se detectó la lista de referencias','No se identificó una sección de Referencias o Bibliografía.','Incluir la lista completa de fuentes citadas en el artículo.','Crítico'));
  if(refYears.length&&recentRatio!==null&&recentRatio<50)observations.push(automaticObservation('Referencias','Baja proporción de referencias recientes',`Aproximadamente ${recentRatio}% de los años detectados en la lista de referencias corresponden a los últimos cinco años. El cálculo es orientativo y no distingue autores clásicos indispensables.`,'Revisar la actualidad de las fuentes y justificar las referencias clásicas indispensables.','Medio'));

  const humanData=/participantes?|pacientes?|encuestad|entrevistad|datos personales|historias? cl[ií]nicas?|menores de edad/i.test(source);
  const ethicsSignal=/consentimiento|confidencialidad|anonimi|comit[eé] de [eé]tica|consideraciones? [eé]ticas?/i.test(source);
  if(humanData&&!ethicsSignal)observations.push(automaticObservation('Ética y confidencialidad','Revisar tratamiento ético','El texto contiene señales de trabajo con personas o datos personales, pero no se detectó una mención clara de consentimiento, confidencialidad, anonimización o consideración ética. Esta señal debe ser confirmada según el diseño real.','Explicitar las salvaguardas éticas y de confidencialidad aplicables o justificar por qué no corresponden.','Alto'));

  return {
    wordCount,pageCount,presence,formalStructureScore:formalScore,
    referenceSignals:{yearMentions:refYears.length,recentRatio,doiCount,urlCount,citationYearMentions:citationYearCount},
    observations:observations.slice(0,10)
  };
}

function automaticSummary(auto){
  const present=Object.entries(auto.presence||{}).filter(([,v])=>v).map(([k])=>k).join(', ')||'ninguna sección reconocida';
  const refs=auto.referenceSignals||{};
  return `VALIDACIÓN AUTOMÁTICA (señales, no sustituyen el juicio académico):\n- Palabras aproximadas: ${auto.wordCount}.\n- Páginas detectadas: ${auto.pageCount??'no disponible'}.\n- Secciones detectadas: ${present}.\n- Señal estructural orientativa del bloque formal: ${auto.formalStructureScore}/3.\n- Años detectados en referencias: ${refs.yearMentions||0}; proporción reciente aproximada: ${refs.recentRatio==null?'no calculable':refs.recentRatio+'%'}.\n- DOI detectados: ${refs.doiCount||0}; URL detectadas: ${refs.urlCount||0}.\nNo conviertas automáticamente estas señales en errores si el contenido visible demuestra lo contrario.`;
}

function collectWindows(text,terms,limit){
  const source=String(text||''),low=source.toLowerCase(),windows=[],seen=[];
  const add=(start,end,label)=>{
    start=Math.max(0,start);end=Math.min(source.length,end);
    if(end-start<300)return;
    if(seen.some(([a,b])=>Math.max(a,start)<Math.min(b,end)))return;
    seen.push([start,end]);windows.push(`\n[Contexto: ${label}]\n${source.slice(start,end)}`);
  };
  add(0,Math.min(source.length,10000),'inicio del artículo');
  for(const term of terms){
    let from=0,hits=0;
    while(hits<2){
      const idx=low.indexOf(term.toLowerCase(),from);if(idx<0)break;
      add(idx-3500,idx+8500,term);from=idx+term.length;hits++;
      if(windows.join('').length>=limit)break;
    }
    if(windows.join('').length>=limit)break;
  }
  if(/referenc|bibliograf/i.test(terms.join(' '))){const r=extractReferenceBlock(source);if(r)add(Math.max(0,source.length-r.length),source.length,'referencias')}
  let out=windows.join('\n');if(out.length>limit)out=out.slice(0,limit);return out||source.slice(0,limit);
}

function articleForLane(text,model,lane){
  const providerLimit=Math.max(12000,Number(model.maxInputChars)||90000);
  const laneLimit=Math.min(providerLimit,lane.id==='methodology-analysis'?65000:60000);
  return collectWindows(text,lane.focus,laneLimit);
}

function buildSpecializedPrompt(articleText,model,lane,auto){
  const maxima=new Map(RUBRIC);
  const allowed=lane.categories.map(n=>`${n}: ${maxima.get(n)} puntos\nCriterio: ${CRITERIA[n]}`).join('\n\n');
  const exactNames=lane.categories.map(n=>`- ${n}`).join('\n');
  return `Actúa como revisor MUY EXIGENTE de un ARTÍCULO ACADÉMICO institucional. No es arbitraje de artículo científico.\nTu carril es: ${lane.label}.\nFunción configurada del proveedor/modelo: ${model.reviewType||'General'}.\n\nCATEGORÍAS QUE DEBES EVALUAR:\n${allowed}\n\nNOMBRES EXACTOS QUE DEBEN APARECER EN categories:\n${exactNames}\n\nREGLAS DE CALIFICACIÓN ESTRICTA:\n- El puntaje máximo se GANA; no se presume. Solo otorga 100% del criterio si existe evidencia explícita y suficiente de todos sus elementos relevantes.\n- Guía orientativa: 100%=cumplimiento completo y sustentado; 75%=bueno con brechas menores; 50%=parcial o insuficientemente justificado; 25%=débil; 0%=ausente, incompatible o no demostrable. Usa valores intermedios cuando la evidencia lo justifique.\n- Evalúa solo las categorías de tu carril y devuelve únicamente esas categorías en categories.\n- No inventes contenido, fuentes, DOI, autores, páginas, resultados, cálculos ni procedimientos. Si no es visible, trátalo como no demostrado.\n- No declares que un cálculo estadístico es correcto si no puedes comprobarlo con los datos visibles; evalúa su pertinencia y consistencia observable.\n- No declares una referencia falsa/inexistente solo porque no la reconozcas. Solo puede marcarse como inexistente si una verificación externa lo demuestra.\n- La pregunta de investigación se exige solo cuando corresponda al diseño; siempre se exige trazabilidad entre título, problema y objetivos.\n- Adapta los criterios al tipo de estudio. No castigues un estudio cualitativo, documental, revisión, estudio de caso o investigación aplicada por no usar instrumentos o muestreo cuantitativos. Evalúa su equivalente metodológico real.\n- En estudios cualitativos considera selección pertinente, saturación cuando corresponda, credibilidad, triangulación y protocolos de obtención/análisis.\n- En estudios documentales/revisiones considera corpus, fuentes, criterios de inclusión/exclusión, estrategia de búsqueda cuando corresponda y matriz/protocolo de extracción/análisis.\n- En estudios cuantitativos considera variables/dimensiones, validez, confiabilidad, muestreo, tamaño, escalas y análisis estadístico cuando corresponda.\n- Evita DOBLE PENALIZACIÓN: identifica el error raíz una sola vez. Si genera consecuencias en otras categorías, ajusta únicamente el puntaje de cada criterio realmente incumplido, sin repetir la misma deducción completa ni duplicar observaciones.\n- La discusión académica debe interpretar y contrastar; repetir resultados no equivale a discutirlos.\n- No exijas originalidad científica absoluta: valora aporte académico/aplicado, utilidad y pertinencia.\n- Si el artículo promete una propuesta y no la desarrolla, penaliza Aporte, utilidad y propuesta de forma fuerte. Si no promete propuesta, no la exijas.\n- Ética/confidencialidad: si el estudio trabaja con personas, datos sensibles o información que requiera salvaguardas y estas no se evidencian, genera alerta Crítico cuando la omisión comprometa la validez/legitimidad del estudio.\n- La plantilla institucional ÉLITE sigue siendo referencia formal, pero el bloque formal vale solo 3 puntos. ORCID y año/volumen provisional de revista no se penalizan.\n- Similitud y posible uso de IA son indicadores separados y NO modifican automáticamente la nota.\n\nCONDICIONES CRÍTICAS DE APROBACIÓN:\nMarca en critical y con observación de severidad Crítico cuando exista evidencia clara de: incompatibilidad grave entre objetivos y metodología; ausencia o invalidez esencial del procedimiento de obtención de datos; instrumento/técnica esencial sin rigor suficiente; población/corpus no identificable cuando impide reproducibilidad; análisis de datos técnicamente inadecuado; resultados sin evidencia que los sustente; conclusiones que contradicen o exceden claramente los resultados; omisión ética grave cuando aplica; o referencia inexistente confirmada externamente.\nUna alerta crítica debe describir el problema concreto, no usar etiquetas genéricas.\n\n${automaticSummary(auto)}\n\nDevuelve SOLO JSON válido:\n{\n "categories":[["Nombre exacto",MAXIMO,PUNTAJE]],\n "observations":[{"severity":"Crítico|Alto|Medio|Bajo","section":"...","points":0,"page":"sección o ubicación","title":"...","original":"fragmento real breve","problem":"...","why":"...","fix":"...","proposal":"..."}],\n "critical":[],\n "similarityEstimate":0,\n "similarityRisk":"Bajo|Medio|Alto|Crítico",\n "similarityMatches":[],\n "aiEstimate":0,\n "aiRisk":"Bajo|Medio|Alto",\n "aiFlags":[]\n}\nMáximo 10 observaciones útiles dentro de tu carril.\n\nEXTRACTO DEL ARTÍCULO PRIORIZADO PARA ESTE CARRIL:\n${articleText}`;
}

function normalizePartial(x){
  const allowed=new Map(RUBRIC.map(([n,m])=>[n,m])),categoryMap=new Map();
  for(const row of Array.isArray(x?.categories)?x.categories:[]){
    if(!Array.isArray(row))continue;
    const name=RUBRIC.find(([n])=>lower(n)===lower(row[0]))?.[0];if(!name)continue;
    const max=allowed.get(name);categoryMap.set(name,clamp(row[2],0,max));
  }
  const observations=(Array.isArray(x?.observations)?x.observations:[]).slice(0,12).map(o=>({
    severity:['Crítico','Alto','Medio','Bajo'].includes(o?.severity)?o.severity:'Medio',
    section:String(o?.section||'General').slice(0,100),points:clamp(o?.points||0,0,20),
    page:String(o?.page||o?.section||'Sección no especificada').slice(0,120),title:String(o?.title||'Observación').slice(0,180),
    original:String(o?.original||'').slice(0,700),problem:String(o?.problem||'').slice(0,1200),why:String(o?.why||'').slice(0,1200),
    fix:String(o?.fix||'').slice(0,1200),proposal:String(o?.proposal||'').slice(0,1600),source:'IA'
  }));
  return {categoryMap,observations,critical:(Array.isArray(x?.critical)?x.critical:[]).map(String).slice(0,10),plagiarism:clamp(x?.similarityEstimate||0,0,100),ai:clamp(x?.aiEstimate||0,0,100),plagiarismMatches:(Array.isArray(x?.similarityMatches)?x.similarityMatches:[]).slice(0,8),aiFlags:(Array.isArray(x?.aiFlags)?x.aiFlags:[]).slice(0,8)};
}

const median=nums=>{const a=nums.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};
const risk=n=>n>=50?'Alto':n>=25?'Medio':'Bajo';

function consolidateHybrid(successes,fileName,cedula,automatic){
  const normalized=successes.map(s=>({...s,review:normalizePartial(s.result.json)}));
  const categories=RUBRIC.map(([name,max])=>{
    const scores=normalized.filter(x=>Array.isArray(x.lane?.categories)&&x.lane.categories.includes(name)).map(x=>x.review.categoryMap.get(name)).filter(Number.isFinite);
    let score=scores.length?median(scores):0;
    if(name==='Calidad académica formal'){
      const autoScore=clamp(automatic?.formalStructureScore||0,0,3);
      score=scores.length?(score*.85+autoScore*.15):autoScore;
      if(automatic?.presence?.referencias===false)score=Math.min(score,1);
    }
    return [name,max,Math.round(clamp(score,0,max)*10)/10];
  });

  const grouped=new Map();
  const addObservation=(o,reviewerLabel)=>{
    const key=`${o.section}|${o.title}`.toLowerCase().replace(/\s+/g,' '),old=grouped.get(key);
    if(old){old.consensus++;if(reviewerLabel&&!old.reviewers.includes(reviewerLabel))old.reviewers.push(reviewerLabel);if((o.points||0)>(old.points||0))old.points=o.points}
    else grouped.set(key,{...o,consensus:1,reviewers:reviewerLabel?[reviewerLabel]:[]});
  };
  normalized.forEach(x=>x.review.observations.forEach(o=>addObservation(o,x.lane?.label||'Revisor')));
  (automatic?.observations||[]).forEach(o=>addObservation(o,'Validación automática'));

  const rank={Crítico:4,Alto:3,Medio:2,Bajo:1};
  const observations=[...grouped.values()].sort((a,b)=>(rank[b.severity]-rank[a.severity])||(b.consensus-a.consensus)).slice(0,24);
  const autoCritical=(automatic?.observations||[]).filter(o=>o.severity==='Crítico').map(o=>`${o.section}: ${o.problem}`);
  const critical=[...new Set([...normalized.flatMap(x=>x.review.critical),...autoCritical])].slice(0,12);

  const blockingPattern=/metodolog|diseño|diseno|instrument|validez|confiabilidad|poblaci[oó]n|muestra|muestreo|corpus|recopil|recolecci[oó]n|procedimiento|procesamiento|an[aá]lisis|estad[ií]st|cualitativ|resultados?.*(sin|no|insuficient|incompat)|sin respaldo|sin evidencia|conclusi[oó]n.*(contradic|excede|no corresponde)|[eé]tica|confidencial|consentimiento|referencia.*(falsa|inexistente)|fuente.*(falsa|inexistente)/i;
  const blockingItems=[...critical,...observations.filter(o=>o.severity==='Crítico').map(o=>`${o.section} ${o.title} ${o.problem}`)].filter(x=>blockingPattern.test(String(x)));
  const approvalBlocked=blockingItems.length>0;

  let score=Math.round(categories.reduce((s,r)=>s+r[2],0)*10)/10;
  if(approvalBlocked&&score>69)score=69;

  const plagiarism=Math.round(median(normalized.map(x=>x.review.plagiarism))),aiEstimate=Math.round(median(normalized.map(x=>x.review.ai)));
  return {
    id:null,n:1,date:new Date().toISOString(),file:fileName,cedula,engine:'hybrid-v2-strict',
    score,approved:score>=70&&!approvalBlocked,approvalBlocked,
    approvalBlockReason:approvalBlocked?'Existe al menos una condición académica crítica que debe corregirse antes de aprobar.':'',
    reviewers:successes.length,
    plagiarism,plagiarismRisk:risk(plagiarism),ai:aiEstimate,aiRisk:risk(aiEstimate),
    categories,observations,critical,
    plagiarismMatches:normalized.flatMap(x=>x.review.plagiarismMatches||[]).slice(0,10),
    aiFlags:normalized.flatMap(x=>x.review.aiFlags||[]).slice(0,10),errors:observations.length,
    automaticChecks:{wordCount:automatic?.wordCount||0,pageCount:automatic?.pageCount??null,presence:automatic?.presence||{},formalStructureScore:automatic?.formalStructureScore||0,referenceSignals:automatic?.referenceSignals||{}},
    reviewLanes:successes.map(x=>({lane:x.lane?.id||'',label:x.lane?.label||'',provider:x.model.provider,model:x.model.name})),
    reviewModels:successes.map(x=>({id:x.model.id,name:x.model.name,provider:x.model.provider,priority:x.model.priority,function:x.model.reviewType}))
  };
}

module.exports={REVIEW_LANES,analyzeAutomatic,articleForLane,buildSpecializedPrompt,consolidateHybrid};
