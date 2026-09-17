const { RUBRIC } = require('./catalog');
const ai = require('./ai');

const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const strip=v=>String(v||'').replace(/\s+/g,' ').trim();
const lower=v=>strip(v).toLowerCase();
const round1=n=>Math.round((Number(n)||0)*10)/10;

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
  'Calidad académica formal':'Valorar redacción académica, consistencia, APA, tablas/figuras, referencias y cumplimiento formal. Ética y confidencialidad se revisan además como salvaguardas cuando realmente correspondan. No penalizar ORCID ni año/volumen provisional de la revista.'
};

const MICROCRITERIA = {
  'Coherencia título–problema–pregunta–objetivos':[
    ['coh-1','Correspondencia entre título y problema',2],
    ['coh-2','Correspondencia entre problema, pregunta cuando aplique y objetivo general',2],
    ['coh-3','Coherencia entre objetivo general y objetivos específicos',2],
    ['coh-4','Delimitación y representación exacta de lo investigado',2]
  ],
  'Problema y justificación':[
    ['prob-1','Evidencia de existencia y magnitud del problema',2],
    ['prob-2','Relevancia, beneficiarios y necesidad del estudio',2],
    ['prob-3','Justificación y factibilidad suficientemente sustentadas',2]
  ],
  'Fundamentación teórica y antecedentes':[
    ['teo-1','Conceptos centrales correctamente sustentados',2.5],
    ['teo-2','Pertinencia y actualidad de fuentes',2.5],
    ['teo-3','Síntesis y contraste entre autores/antecedentes',2.5],
    ['teo-4','Estado del conocimiento, vacío o posición del estudio',2.5]
  ],
  'Diseño metodológico':[
    ['met-1','Enfoque metodológico identificado y coherente',3],
    ['met-2','Tipo y alcance del estudio identificados y coherentes',3],
    ['met-3','Diseño metodológico identificado y técnicamente apropiado',3],
    ['met-4','Coherencia del diseño con los objetivos',4],
    ['met-5','Justificación metodológica y reproducibilidad general',2]
  ],
  'Instrumentos y rigor de la obtención de información':[
    ['inst-1','Origen, construcción, adaptación o protocolo equivalente',3],
    ['inst-2','Variables/dimensiones/categorías o estructura equivalente',3],
    ['inst-3','Validez o rigor equivalente según el enfoque',3],
    ['inst-4','Confiabilidad, credibilidad, triangulación o control equivalente',3]
  ],
  'Población, muestra y recopilación':[
    ['pob-1','Población, unidad de análisis o corpus claramente definido',2],
    ['pob-2','Selección, muestreo o criterios de inclusión/exclusión justificados',2],
    ['pob-3','Suficiencia del tamaño, saturación o pertinencia del corpus',2],
    ['pob-4','Procedimiento de recopilación/recolección reproducible',2]
  ],
  'Procesamiento y análisis de datos':[
    ['ana-1','Preparación, codificación, depuración o procesamiento descrito',2],
    ['ana-2','Técnica de análisis apropiada al tipo de datos y objetivos',3],
    ['ana-3','Justificación de la técnica y criterios de interpretación',2],
    ['ana-4','Consistencia y reproducibilidad del análisis visible',3]
  ],
  'Resultados':[
    ['res-1','Cobertura de los objetivos mediante resultados',3],
    ['res-2','Evidencia suficiente para sustentar los hallazgos',3],
    ['res-3','Claridad y consistencia de tablas, figuras o exposición de datos',2],
    ['res-4','Interpretaciones limitadas a lo que permiten los datos',2]
  ],
  'Discusión académica':[
    ['dis-1','Contraste explícito con literatura pertinente',2],
    ['dis-2','Interpretación propia de los hallazgos',2],
    ['dis-3','Explicación de coincidencias, diferencias o implicaciones',2],
    ['dis-4','Reconocimiento razonable de limitaciones',2]
  ],
  'Conclusiones':[
    ['con-1','Cobertura de los objetivos',2],
    ['con-2','Sustento exclusivo en resultados obtenidos',2],
    ['con-3','Ausencia de generalizaciones o afirmaciones no demostradas',2]
  ],
  'Aporte, utilidad y propuesta':[
    ['apo-1','Utilidad académica, profesional o institucional',1.5],
    ['apo-2','Aporte y pertinencia en el contexto estudiado',1.5],
    ['apo-3','Propuesta desarrollada y sustentada cuando el artículo la promete; equivalente de aplicación cuando no la promete',1]
  ],
  'Calidad académica formal':[
    ['for-1','Redacción académica y coherencia formal',0.75],
    ['for-2','APA, citas y referencias',0.75],
    ['for-3','Tablas, figuras y elementos gráficos',0.5],
    ['for-4','Consistencia con formato institucional',0.5],
    ['for-5','Declaraciones éticas/confidencialidad cuando sean realmente aplicables o equivalente formal',0.5]
  ]
};

const LEVEL_VALUE = new Map([
  ['cumple',1],['completo',1],['100',1],['100%',1],
  ['parcial alto',.75],['alto',.75],['75',.75],['75%',.75],
  ['parcial',.5],['medio',.5],['50',.5],['50%',.5],
  ['parcial bajo',.25],['bajo',.25],['25',.25],['25%',.25],
  ['no cumple',0],['ausente',0],['incompatible',0],['0',0],['0%',0]
]);

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

function firstIndex(text,re){const m=String(text||'').match(re);return m&&Number.isFinite(m.index)?m.index:-1}
function extractReferenceBlock(text){
  const refs=firstIndex(text,/\breferencias(?:\s+bibliogr[aá]ficas)?\b/i),bib=firstIndex(text,/\bbibliograf[ií]a\b/i),candidates=[refs,bib].filter(i=>i>=0),idx=candidates.length?Math.min(...candidates):-1;
  return idx>=0?String(text).slice(idx):'';
}
function automaticObservation(section,title,problem,fix,severity='Alto'){
  return {severity,section,points:0,page:section,title,original:'',problem,why:'La evidencia y la trazabilidad deben ser visibles en el artículo para poder evaluarlas.',fix,proposal:'',source:'Automático'};
}

function analyzeAutomatic(text){
  const source=String(text||'').replace(/\u0000/g,' ').trim(),normalized=strip(source),presence={};
  for(const [key,re] of Object.entries(SECTION_PATTERNS))presence[key]=re.test(source);
  const pageMatches=[...source.matchAll(/\[P[aá]gina\s+(\d+)\]/gi)].map(m=>Number(m[1])).filter(Number.isFinite),pageCount=pageMatches.length?Math.max(...pageMatches):null,wordCount=normalized?normalized.split(/\s+/).length:0;
  const refs=extractReferenceBlock(source),refYears=[...refs.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(m=>Number(m[1])).filter(y=>y>=1900&&y<=new Date().getFullYear()+1),currentYear=new Date().getFullYear(),recentYears=refYears.filter(y=>y>=currentYear-5),recentRatio=refYears.length?Math.round(recentYears.length/refYears.length*100):null,doiCount=(refs.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi)||[]).length,urlCount=(refs.match(/https?:\/\/\S+/gi)||[]).length,refStart=refs?source.indexOf(refs):source.length,citationYearCount=[...source.slice(0,refStart).matchAll(/\b(19\d{2}|20\d{2})\b/g)].length;
  const core=['introduccion','metodologia','resultados','discusion','conclusiones','referencias'],presentCore=core.filter(k=>presence[k]).length,ordered=core.map(k=>({k,i:firstIndex(source,SECTION_PATTERNS[k])})).filter(x=>x.i>=0),orderOk=ordered.length>=4&&ordered.every((x,i)=>i===0||x.i>ordered[i-1].i);
  let formalScore=(presentCore/core.length)*2.1;if(presence.resumen)formalScore+=.25;if(presence.abstract)formalScore+=.15;if(presence.palabrasClave)formalScore+=.15;if(orderOk)formalScore+=.35;formalScore=round1(clamp(formalScore,0,3));
  const observations=[];
  if(!presence.metodologia)observations.push(automaticObservation('Metodología','No se detectó una sección metodológica','No se identificó Metodología, Métodos o Materiales y métodos como sección reconocible.','Identificar explícitamente el diseño metodológico, las unidades de análisis, técnicas/instrumentos, procedimiento y análisis.','Crítico'));
  if(!presence.resultados)observations.push(automaticObservation('Resultados','No se detectó la sección de resultados','No se identificó una sección Resultados en el texto extraído.','Presentar resultados claramente identificados y vinculados con los objetivos.','Crítico'));
  if(!presence.discusion)observations.push(automaticObservation('Discusión','No se detectó la discusión','No se identificó una sección de Discusión.','Incorporar una discusión que contraste los resultados con literatura y explicite limitaciones.','Alto'));
  if(!presence.conclusiones)observations.push(automaticObservation('Conclusiones','No se detectaron conclusiones','No se identificó una sección Conclusiones.','Incluir conclusiones sustentadas en los resultados y que cubran los objetivos.','Alto'));
  if(!presence.referencias)observations.push(automaticObservation('Referencias','No se detectó la lista de referencias','No se identificó una sección de Referencias o Bibliografía.','Incluir la lista completa de fuentes citadas en el artículo.','Crítico'));
  if(refYears.length&&recentRatio!==null&&recentRatio<50)observations.push(automaticObservation('Referencias','Baja proporción de referencias recientes',`Aproximadamente ${recentRatio}% de los años detectados en la lista de referencias corresponden a los últimos cinco años. El cálculo es orientativo y no distingue autores clásicos indispensables.`,'Revisar la actualidad de las fuentes y justificar las referencias clásicas indispensables.','Medio'));
  const humanData=/participantes?|pacientes?|encuestad|entrevistad|datos personales|historias? cl[ií]nicas?|menores de edad/i.test(source),ethicsSignal=/consentimiento|confidencialidad|anonimi|comit[eé] de [eé]tica|consideraciones? [eé]ticas?/i.test(source);
  if(humanData&&!ethicsSignal)observations.push(automaticObservation('Ética y confidencialidad','Revisar tratamiento ético','El texto contiene señales de trabajo con personas o datos personales, pero no se detectó una mención clara de consentimiento, confidencialidad, anonimización o consideración ética. Esto no demuestra por sí solo una infracción y debe verificarse según el riesgo, los datos tratados y la normativa aplicable.','Explicitar las salvaguardas éticas y de confidencialidad aplicables o justificar por qué no corresponden.','Alto'));
  return {wordCount,pageCount,presence,formalStructureScore:formalScore,referenceSignals:{yearMentions:refYears.length,recentRatio,doiCount,urlCount,citationYearMentions:citationYearCount},observations:observations.slice(0,10)};
}

function automaticSummary(auto){
  const present=Object.entries(auto.presence||{}).filter(([,v])=>v).map(([k])=>k).join(', ')||'ninguna sección reconocida',refs=auto.referenceSignals||{};
  return `VALIDACIÓN AUTOMÁTICA (señales, no sustituyen el juicio académico):\n- Palabras aproximadas: ${auto.wordCount}.\n- Páginas detectadas: ${auto.pageCount??'no disponible'}.\n- Secciones detectadas: ${present}.\n- Señal estructural orientativa del bloque formal: ${auto.formalStructureScore}/3.\n- Años detectados en referencias: ${refs.yearMentions||0}; proporción reciente aproximada: ${refs.recentRatio==null?'no calculable':refs.recentRatio+'%'}.\n- DOI detectados: ${refs.doiCount||0}; URL detectadas: ${refs.urlCount||0}.\nNo conviertas automáticamente estas señales en errores si el contenido visible demuestra lo contrario.`;
}

function collectWindows(text,terms,limit){
  const source=String(text||''),low=source.toLowerCase(),windows=[],seen=[];
  const add=(start,end,label)=>{start=Math.max(0,start);end=Math.min(source.length,end);if(end-start<300)return;if(seen.some(([a,b])=>Math.max(a,start)<Math.min(b,end)))return;seen.push([start,end]);windows.push(`\n[Contexto: ${label}]\n${source.slice(start,end)}`)};
  add(0,Math.min(source.length,10000),'inicio del artículo');
  for(const term of terms){let from=0,hits=0;while(hits<2){const idx=low.indexOf(term.toLowerCase(),from);if(idx<0)break;add(idx-3500,idx+8500,term);from=idx+term.length;hits++;if(windows.join('').length>=limit)break}if(windows.join('').length>=limit)break}
  if(/referenc|bibliograf/i.test(terms.join(' '))){const r=extractReferenceBlock(source);if(r)add(Math.max(0,source.length-r.length),source.length,'referencias')}
  let out=windows.join('\n');if(out.length>limit)out=out.slice(0,limit);return out||source.slice(0,limit);
}

function articleForLane(text,model,lane){const providerLimit=Math.max(12000,Number(model.maxInputChars)||90000),laneLimit=Math.min(providerLimit,lane.id==='methodology-analysis'?65000:60000);return collectWindows(text,lane.focus,laneLimit)}

function laneMicrocriteria(lane){return lane.categories.flatMap(category=>(MICROCRITERIA[category]||[]).map(([id,label,weight])=>({id,label,weight,category})))}

function buildSpecializedPrompt(articleText,model,lane,auto){
  const maxima=new Map(RUBRIC);
  const allowed=lane.categories.map(n=>`${n}: ${maxima.get(n)} puntos\nCriterio: ${CRITERIA[n]}\nMicrocriterios:\n${(MICROCRITERIA[n]||[]).map(([id,label,weight])=>`  - ${id} | ${label} | ${weight} pts`).join('\n')}`).join('\n\n');
  const exactNames=lane.categories.map(n=>`- ${n}`).join('\n');
  const exactMicro=laneMicrocriteria(lane).map(m=>`- ${m.id}`).join('\n');
  return `Actúa como revisor exigente, proporcional y verificable de un ARTÍCULO ACADÉMICO institucional. No es arbitraje de artículo científico.\nTu carril es: ${lane.label}.\nFunción configurada del proveedor/modelo: ${model.reviewType||'General'}.\n\nCATEGORÍAS Y MICROCRITERIOS:\n${allowed}\n\nNOMBRES EXACTOS DE CATEGORÍAS:\n${exactNames}\n\nIDs EXACTOS DE MICROCRITERIOS:\n${exactMicro}\n\nESCALA OBLIGATORIA PARA CADA MICROCRITERIO:\n- Cumple = 100% del peso.\n- Parcial alto = 75%.\n- Parcial = 50%.\n- Parcial bajo = 25%.\n- No cumple = 0%.\n\nREGLAS DE CALIFICACIÓN:\n- El puntaje máximo se gana con evidencia explícita y suficiente.\n- 0% SOLO se usa cuando el elemento está completamente ausente o es claramente incompatible con el estudio. Si existe evidencia pero está incompleta, poco justificada o débilmente descrita, usa 25%, 50% o 75%; NUNCA 0 por mera insuficiencia de detalle.\n- No uses "No aplica" para regalar o quitar puntos. Si un microcriterio no corresponde literalmente al diseño, evalúa su EQUIVALENTE metodológico y escríbelo en appliedAs.\n- Para cualitativos adapta validez/confiabilidad a credibilidad, triangulación, saturación, protocolo o equivalente pertinente.\n- Para documentales/revisiones adapta población/muestra a corpus/fuentes/criterios de inclusión-exclusión y adapta instrumento a matriz/protocolo de extracción/análisis.\n- Para estudios de caso/aplicados adapta cada microcriterio a la unidad de análisis, procedimiento y evidencia realmente utilizados.\n- Evalúa únicamente las categorías de tu carril.\n- No inventes fuentes, DOI, autores, páginas, resultados, cálculos, pruebas estadísticas ni procedimientos.\n- No afirmes que un cálculo es correcto si no puedes comprobarlo. Evalúa lo visible y la pertinencia de la técnica.\n- No prescribas ANOVA, t de Student, Wilcoxon u otra prueba específica si el diseño, la distribución y los datos visibles no permiten justificarla. En ese caso indica que debe identificarse y justificarse la técnica apropiada.\n- No declares una referencia falsa/inexistente solo porque no la reconozcas. Solo puede marcarse como inexistente si existe verificación externa suficiente.\n- La pregunta de investigación se exige solo cuando corresponda; la trazabilidad título-problema-objetivos sí es obligatoria.\n- Evita doble penalización: identifica el error raíz una vez; ajusta cada microcriterio realmente afectado, pero no repitas la misma observación como varios errores distintos.\n- No generes observaciones positivas. Si el problema es "ninguno", no incluyas esa observación.\n- Ética/confidencialidad: la ausencia de una mención a comité de ética NO es por sí sola una violación. Si hay personas o datos, normalmente marca Alto/Requiere verificación cuando falten salvaguardas. Solo propone Crítico si hay evidencia clara de una omisión grave aplicable por el riesgo, sensibilidad de datos, población vulnerable, intervención o exigencia normativa/institucional visible.\n- Similitud y posible uso de IA son indicadores separados y no alteran automáticamente la nota.\n\nCONDICIONES CRÍTICAS CANDIDATAS:\nSolo marca critical y severidad Crítico ante evidencia clara de un defecto que pueda comprometer de forma sustancial la validez o legitimidad: incompatibilidad grave objetivos-metodología; procedimiento esencial ausente/inválido; técnica/instrumento esencial sin rigor suficiente; población/corpus no identificable cuando impide reproducibilidad; análisis técnicamente inadecuado; resultados principales sin evidencia; conclusiones que contradicen/exceden claramente resultados; omisión ética grave realmente aplicable; o referencia inexistente verificada externamente.\nUna condición crítica será confirmada después por una SEGUNDA IA independiente antes de bloquear la aprobación.\n\n${automaticSummary(auto)}\n\nDevuelve SOLO JSON válido:\n{\n "studyType":"cuantitativo|cualitativo|mixto|documental/revisión|estudio de caso/aplicado|otro",\n "categories":[["Nombre exacto",MAXIMO,PUNTAJE_ORIENTATIVO]],\n "microcriteria":[{"id":"id exacto","status":"Cumple|Parcial alto|Parcial|Parcial bajo|No cumple","evidence":"evidencia breve y real","appliedAs":"criterio literal o equivalente metodológico aplicado"}],\n "observations":[{"severity":"Crítico|Alto|Medio|Bajo","section":"...","points":0,"page":"sección o ubicación","title":"...","original":"fragmento real breve","problem":"...","why":"...","fix":"...","proposal":"..."}],\n "critical":[],\n "similarityEstimate":0,\n "similarityRisk":"Bajo|Medio|Alto|Crítico",\n "similarityMatches":[],\n "aiEstimate":0,\n "aiRisk":"Bajo|Medio|Alto",\n "aiFlags":[]\n}\nDebes devolver TODOS los microcriterios de este carril con sus IDs exactos. El backend calculará la nota a partir de esos estados, no de tu suma global. Máximo 10 observaciones reales que requieran corrección.\n\nEXTRACTO DEL ARTÍCULO PRIORIZADO PARA ESTE CARRIL:\n${articleText}`;
}

function statusRatio(status){
  const s=lower(status);if(LEVEL_VALUE.has(s))return LEVEL_VALUE.get(s);const n=Number(String(status||'').replace('%',''));if(Number.isFinite(n))return clamp(n/100,0,1);return null;
}

function normalizeObservation(o){
  const problem=strip(o?.problem||'');
  if(!problem||/^(ningun[oa]?|n\/a|no aplica|sin problema|no se (identifica|identifican|observa|observan) problemas?)\.?$/i.test(problem))return null;
  return {severity:['Crítico','Alto','Medio','Bajo'].includes(o?.severity)?o.severity:'Medio',section:String(o?.section||'General').slice(0,100),points:clamp(o?.points||0,0,20),page:String(o?.page||o?.section||'Sección no especificada').slice(0,120),title:String(o?.title||'Observación').slice(0,180),original:String(o?.original||'').slice(0,700),problem:problem.slice(0,1200),why:String(o?.why||'').slice(0,1200),fix:String(o?.fix||'').slice(0,1200),proposal:String(o?.proposal||'').slice(0,1600),source:'IA'};
}

function normalizePartial(x,lane){
  const expected=laneMicrocriteria(lane),incoming=Array.isArray(x?.microcriteria)?x.microcriteria:[],microMap=new Map();
  for(const m of incoming){const id=String(m?.id||'').trim();if(!expected.some(e=>e.id===id))continue;const ratio=statusRatio(m?.status);if(ratio==null)continue;microMap.set(id,{id,ratio,status:String(m.status||''),evidence:strip(m?.evidence||'').slice(0,800),appliedAs:strip(m?.appliedAs||'').slice(0,500)})}
  const categoryMap=new Map();
  for(const category of lane.categories){const defs=(MICROCRITERIA[category]||[]),score=defs.reduce((sum,[id,,weight])=>sum+weight*(microMap.get(id)?.ratio??0),0);categoryMap.set(category,round1(score))}
  const observations=(Array.isArray(x?.observations)?x.observations:[]).slice(0,14).map(normalizeObservation).filter(Boolean);
  return {studyType:strip(x?.studyType||''),microMap,categoryMap,observations,critical:(Array.isArray(x?.critical)?x.critical:[]).map(String).map(strip).filter(Boolean).slice(0,10),plagiarism:clamp(x?.similarityEstimate||0,0,100),ai:clamp(x?.aiEstimate||0,0,100),plagiarismMatches:(Array.isArray(x?.similarityMatches)?x.similarityMatches:[]).slice(0,8),aiFlags:(Array.isArray(x?.aiFlags)?x.aiFlags:[]).slice(0,8)};
}

function validateLaneResponse(result,lane){
  const json=result?.json||{},rows=Array.isArray(json.categories)?json.categories:[],names=rows.filter(Array.isArray).map(r=>lower(r[0])),missingCats=lane.categories.filter(name=>!names.includes(lower(name)));
  if(missingCats.length)throw new Error(`Respuesta incompleta para el carril. Faltan categorías: ${missingCats.join(', ')}`);
  const ids=new Set((Array.isArray(json.microcriteria)?json.microcriteria:[]).map(m=>String(m?.id||'').trim())),missingMicro=laneMicrocriteria(lane).filter(m=>!ids.has(m.id));
  if(missingMicro.length)throw new Error(`Respuesta incompleta para el carril. Faltan microcriterios: ${missingMicro.map(m=>m.id).join(', ')}`);
}

function candidateKey(o){return lower(`${o?.section||''}|${o?.title||''}|${o?.problem||o||''}`).replace(/[^a-záéíóúñ0-9]+/gi,' ').slice(0,500)}

function getCriticalCandidates(successes,automatic){
  const out=[],seen=new Set();
  for(const s of successes){
    const review=normalizePartial(s.result.json,s.lane);
    for(const o of review.observations){
      if(o.severity!=='Crítico')continue;
      const key=candidateKey(o);if(seen.has(key))continue;seen.add(key);
      out.push({id:`crit-${out.length+1}`,sourceModelId:s.model.id,sourceLane:s.lane.id,section:o.section,title:o.title,problem:o.problem,why:o.why,original:o.original,page:o.page,text:o.problem});
    }
    for(const c of review.critical){
      if(review.observations.some(o=>o.severity==='Crítico'&&(lower(c).includes(lower(o.title).slice(0,20))||lower(c).includes(lower(o.section)))))continue;
      const key=candidateKey(c);if(seen.has(key))continue;seen.add(key);out.push({id:`crit-${out.length+1}`,sourceModelId:s.model.id,sourceLane:s.lane.id,section:s.lane.label,title:'Condición crítica candidata',problem:c,why:'',original:'',page:'',text:c});
    }
  }
  for(const o of automatic?.observations||[]){
    if(o.severity!=='Crítico')continue;const key=candidateKey(o);if(seen.has(key))continue;seen.add(key);out.push({id:`crit-${out.length+1}`,sourceModelId:'automatic',sourceLane:'automatic',section:o.section,title:o.title,problem:o.problem,why:o.why,original:o.original||'',page:o.page||o.section,text:`${o.title} — ${o.problem}`});
  }
  return out.slice(0,6);
}

function criticalContext(articleText,candidate){
  const terms=[candidate.section,candidate.title,...String(candidate.problem||'').split(/\s+/).filter(w=>w.length>7).slice(0,5)].filter(Boolean);
  return collectWindows(articleText,terms,24000);
}

function buildCriticalVerificationPrompt(articleText,candidate){
  return `Actúa como SEGUNDO REVISOR INDEPENDIENTE. No vuelvas a calificar todo el artículo. Revisa ÚNICAMENTE la posible condición crítica descrita abajo y decide si realmente merece condición crítica.\n\nALERTA CANDIDATA:\nSección: ${candidate.section}\nTítulo: ${candidate.title}\nProblema alegado: ${candidate.problem}\nEvidencia citada: ${candidate.original||'No disponible'}\nUbicación: ${candidate.page||'No especificada'}\n\nREGLAS:\n- Confirma solo si la evidencia visible muestra un defecto grave que compromete sustancialmente la validez, reproducibilidad, legitimidad o sustento de los resultados/conclusiones.\n- No confirmes por mera falta de detalle si existe procedimiento y puede calificarse parcialmente.\n- Ética: que no se mencione un comité de ética NO basta para confirmar una violación. Confirma solo si hay una salvaguarda claramente exigible por riesgo, datos sensibles, población vulnerable, intervención o norma visible y la omisión es grave.\n- Estadística: no exijas una prueba específica sin datos suficientes. Una técnica no identificada o poco explicada puede ser una deficiencia alta sin ser necesariamente crítica.\n- Si confirmas, clasifica el impacto: local = afecta un componente esencial pero acotado; major = compromete varios componentes o la interpretación principal; invalidating = invalida de forma sustancial la obtención/análisis de datos o los resultados centrales.\n- Si no hay evidencia suficiente para confirmar, responde confirmed=false.\n\nDevuelve SOLO JSON válido:\n{\n "categories":[["Confirmación crítica",1,1]],\n "observations":[],\n "critical":[],\n "similarityEstimate":0,\n "similarityRisk":"Bajo",\n "similarityMatches":[],\n "aiEstimate":0,\n "aiRisk":"Bajo",\n "aiFlags":[],\n "confirmation":{"candidateId":"${candidate.id}","confirmed":true,"impact":"local|major|invalidating","reason":"justificación concreta y breve"}\n}\n\nCONTEXTO PERTINENTE DEL ARTÍCULO:\n${articleText}`;
}

async function verifyCriticalCandidates(successes,availableModels,articleText,automatic){
  const candidates=getCriticalCandidates(successes,automatic),results=[];
  if(!candidates.length)return results;
  const all=(availableModels||[]).filter(m=>m&&m.state==='Activa');
  for(const candidate of candidates){
    const ordered=[...all].filter(m=>m.id!==candidate.sourceModelId).sort((a,b)=>(Number(a.priority)||999)-(Number(b.priority)||999));
    let verified=null;
    for(const model of ordered){
      try{
        const context=criticalContext(articleText,candidate),runtime={...model,timeout:Math.min(Number(model.timeout)||90,55),temperature:0};
        const out=await ai.callModel(runtime,buildCriticalVerificationPrompt(context,candidate)),c=out?.json?.confirmation;
        if(!c||String(c.candidateId||'')!==candidate.id)throw new Error('La confirmación crítica no devolvió el identificador esperado.');
        verified={candidateId:candidate.id,confirmed:c.confirmed===true,impact:['local','major','invalidating'].includes(c.impact)?c.impact:'local',reason:strip(c.reason||''),verifierModelId:model.id};
        break;
      }catch(err){console.warn(`[critical ${candidate.id}] ${model.provider}/${model.name}: ${String(err?.message||err)}`)}
    }
    results.push(verified||{candidateId:candidate.id,confirmed:false,impact:'local',reason:'No fue posible obtener una segunda confirmación independiente.',verifierModelId:''});
  }
  return results;
}

const median=nums=>{const a=nums.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};
const risk=n=>n>=50?'Alto':n>=25?'Medio':'Bajo';

function impactCap(confirmations){
  const confirmed=confirmations.filter(c=>c.confirmed);
  if(confirmed.some(c=>c.impact==='invalidating'))return 49;
  if(confirmed.some(c=>c.impact==='major'))return 59;
  if(confirmed.some(c=>c.impact==='local'))return 69;
  return 100;
}

function consolidateHybrid(successes,fileName,cedula,automatic,criticalConfirmations=[]){
  const normalized=successes.map(s=>({...s,review:normalizePartial(s.result.json,s.lane)}));
  const categories=RUBRIC.map(([name,max])=>{
    const scores=normalized.filter(x=>Array.isArray(x.lane?.categories)&&x.lane.categories.includes(name)).map(x=>x.review.categoryMap.get(name)).filter(Number.isFinite);let score=scores.length?median(scores):0;
    if(name==='Calidad académica formal'){
      const autoScore=clamp(automatic?.formalStructureScore||0,0,3);score=scores.length?(score*.9+autoScore*.1):autoScore;if(automatic?.presence?.referencias===false)score=Math.min(score,1.25);
    }
    return [name,max,round1(clamp(score,0,max))];
  });

  const candidates=getCriticalCandidates(successes,automatic),confirmationMap=new Map((criticalConfirmations||[]).map(c=>[c.candidateId,c])),grouped=new Map();
  const addObservation=(o,reviewerLabel)=>{
    const normalizedObs=normalizeObservation(o);if(!normalizedObs)return;let finalObs={...normalizedObs};
    if(finalObs.severity==='Crítico'){
      const matched=candidates.find(c=>candidateKey(c)===candidateKey(finalObs));
      if(!matched||!confirmationMap.get(matched.id)?.confirmed)finalObs.severity='Alto';
    }
    const key=`${finalObs.section}|${finalObs.title}`.toLowerCase().replace(/\s+/g,' '),old=grouped.get(key);
    if(old){old.consensus++;if(reviewerLabel&&!old.reviewers.includes(reviewerLabel))old.reviewers.push(reviewerLabel);if((finalObs.points||0)>(old.points||0))old.points=finalObs.points;if(finalObs.severity==='Crítico')old.severity='Crítico'}
    else grouped.set(key,{...finalObs,consensus:1,reviewers:reviewerLabel?[reviewerLabel]:[]});
  };
  normalized.forEach(x=>x.review.observations.forEach(o=>addObservation(o,x.lane?.label||'Revisor')));(automatic?.observations||[]).forEach(o=>addObservation(o,'Validación automática'));
  const rank={Crítico:4,Alto:3,Medio:2,Bajo:1},observations=[...grouped.values()].sort((a,b)=>(rank[b.severity]-rank[a.severity])||(b.consensus-a.consensus)).slice(0,24),confirmedCandidates=candidates.filter(c=>confirmationMap.get(c.id)?.confirmed),critical=confirmedCandidates.map(c=>`${c.title}: ${c.problem}${confirmationMap.get(c.id)?.reason?` — Confirmación independiente: ${confirmationMap.get(c.id).reason}`:''}`).slice(0,10),approvalBlocked=critical.length>0,rawScore=round1(categories.reduce((s,r)=>s+r[2],0)),cap=impactCap(criticalConfirmations),score=round1(Math.min(rawScore,cap));
  const plagiarism=Math.round(median(normalized.map(x=>x.review.plagiarism))),aiEstimate=Math.round(median(normalized.map(x=>x.review.ai)));
  return {
    id:null,n:1,date:new Date().toISOString(),file:fileName,cedula,engine:'hybrid-v3-microcriteria',score,rawScore,criticalCap:cap<100?cap:null,approved:score>=70&&!approvalBlocked,approvalBlocked,approvalBlockReason:approvalBlocked?'Una segunda revisión independiente confirmó al menos una condición académica crítica. La nota se ajustó según el impacto confirmado.':'',reviewers:successes.length,
    plagiarism,plagiarismRisk:risk(plagiarism),ai:aiEstimate,aiRisk:risk(aiEstimate),categories,observations,critical,
    criticalConfirmations:(criticalConfirmations||[]).map(c=>({candidateId:c.candidateId,confirmed:!!c.confirmed,impact:c.impact,reason:c.reason})),
    microcriteria:normalized.flatMap(x=>laneMicrocriteria(x.lane).map(m=>{const v=x.review.microMap.get(m.id);return {id:m.id,category:m.category,label:m.label,weight:m.weight,status:v?.status||'No cumple',ratio:v?.ratio??0,evidence:v?.evidence||'',appliedAs:v?.appliedAs||''}})),
    plagiarismMatches:normalized.flatMap(x=>x.review.plagiarismMatches||[]).slice(0,10),aiFlags:normalized.flatMap(x=>x.review.aiFlags||[]).slice(0,10),errors:observations.length,
    automaticChecks:{wordCount:automatic?.wordCount||0,pageCount:automatic?.pageCount??null,presence:automatic?.presence||{},formalStructureScore:automatic?.formalStructureScore||0,referenceSignals:automatic?.referenceSignals||{}},
    reviewLanes:successes.map(x=>({lane:x.lane?.id||'',label:x.lane?.label||''})),
    reviewModels:successes.map(x=>({id:x.model.id,name:x.model.name,provider:x.model.provider,priority:x.model.priority,function:x.model.reviewType}))
  };
}

module.exports={REVIEW_LANES,MICROCRITERIA,analyzeAutomatic,articleForLane,buildSpecializedPrompt,validateLaneResponse,getCriticalCandidates,verifyCriticalCandidates,consolidateHybrid};
