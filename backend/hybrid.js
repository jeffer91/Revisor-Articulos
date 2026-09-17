const { RUBRIC } = require('./catalog');

const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const strip=v=>String(v||'').replace(/\s+/g,' ').trim();
const lower=v=>strip(v).toLowerCase();

const REVIEW_LANES = [
  {
    id:'methodology',
    label:'Metodología y diseño',
    categories:['Objetivos y coherencia','Metodología','Resultados'],
    focus:['objetivo','metodolog','método','metodo','muestra','población','poblacion','instrumento','procedimiento','resultados']
  },
  {
    id:'evidence',
    label:'Resultados, discusión y evidencia',
    categories:['Metodología','Resultados','Discusión','Conclusiones y recomendaciones','Referencias'],
    focus:['metodolog','resultados','discusión','discusion','conclusiones','recomendaciones','referencias','bibliografía','bibliografia']
  },
  {
    id:'coherence',
    label:'Coherencia, redacción y formato',
    categories:['Título y delimitación','Resumen, Abstract y palabras clave','Introducción, antecedentes y problema','Objetivos y coherencia','Redacción y coherencia global','Formato institucional ÉLITE'],
    focus:['resumen','abstract','palabras clave','keywords','introducción','introduccion','antecedentes','problema','objetivo','conclusiones','referencias']
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
  const idx=Math.max(firstIndex(text,/\breferencias(?:\s+bibliogr[aá]ficas)?\b/i),firstIndex(text,/\bbibliograf[ií]a\b/i));
  return idx>=0?String(text).slice(idx):'';
}

function automaticObservation(section,title,problem,fix,severity='Alto'){
  return {severity,section,points:0,page:section,title,original:'',problem,why:'La estructura mínima facilita la trazabilidad y la evaluación académica del artículo.',fix,proposal:'',source:'Automático'};
}

function analyzeAutomatic(text){
  const source=String(text||'').replace(/\u0000/g,' ').trim();
  const normalized=strip(source);
  const presence={};
  for(const [key,re] of Object.entries(SECTION_PATTERNS)) presence[key]=re.test(source);

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
  const inTextYears=[...source.slice(0,refs?source.indexOf(refs):source.length).matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(m=>m[1]);
  const citationYearCount=inTextYears.length;

  let formalScore=0;
  if(presence.resumen) formalScore+=2;
  if(presence.abstract) formalScore+=1;
  if(presence.palabrasClave) formalScore+=1;
  if(presence.introduccion) formalScore+=2;
  if(presence.objetivos) formalScore+=2;
  if(presence.metodologia) formalScore+=2;
  if(presence.resultados) formalScore+=2;
  if(presence.discusion) formalScore+=2;
  if(presence.conclusiones) formalScore+=2;
  if(presence.referencias) formalScore+=2;
  const ordered=['introduccion','metodologia','resultados','discusion','conclusiones','referencias']
    .map(k=>({k,i:firstIndex(source,SECTION_PATTERNS[k])})).filter(x=>x.i>=0);
  const orderOk=ordered.length>=4&&ordered.every((x,i)=>i===0||x.i>ordered[i-1].i);
  if(orderOk) formalScore+=2;
  formalScore=clamp(formalScore,0,20);

  const observations=[];
  if(!presence.resumen) observations.push(automaticObservation('Resumen','No se detectó el resumen','No se identificó una sección de Resumen en el texto extraído.','Incluir un Resumen claramente identificado según el formato institucional.'));
  if(!presence.abstract) observations.push(automaticObservation('Abstract','No se detectó el Abstract','No se identificó una sección Abstract en el texto extraído.','Incluir el Abstract claramente identificado según el formato institucional.','Medio'));
  if(!presence.palabrasClave) observations.push(automaticObservation('Resumen','No se detectaron palabras clave','No se identificó “Palabras clave” o “Keywords” en el texto extraído.','Incluir palabras clave y keywords en la ubicación institucional correspondiente.','Medio'));
  if(!presence.metodologia) observations.push(automaticObservation('Metodología','No se detectó una sección metodológica','No se identificó Metodología, Métodos o Materiales y métodos como sección reconocible.','Identificar explícitamente la sección metodológica y describir diseño, población/muestra, instrumentos, procedimiento y análisis.','Crítico'));
  if(!presence.resultados) observations.push(automaticObservation('Resultados','No se detectó la sección de resultados','No se identificó una sección Resultados en el texto extraído.','Presentar los resultados en una sección claramente identificada.','Crítico'));
  if(!presence.discusion) observations.push(automaticObservation('Discusión','No se detectó la discusión','No se identificó una sección Discusión en el texto extraído.','Separar e identificar la discusión de los resultados cuando corresponda al formato institucional.','Alto'));
  if(!presence.conclusiones) observations.push(automaticObservation('Conclusiones','No se detectaron conclusiones','No se identificó una sección Conclusiones.','Incluir conclusiones vinculadas con objetivos, resultados y alcance del estudio.','Alto'));
  if(!presence.referencias) observations.push(automaticObservation('Referencias','No se detectó la lista de referencias','No se identificó una sección de Referencias o Bibliografía.','Incluir la lista completa de referencias citadas en el artículo.','Crítico'));
  if(refYears.length&&recentRatio!==null&&recentRatio<50) observations.push(automaticObservation('Referencias','Baja proporción de referencias recientes',`Aproximadamente ${recentRatio}% de los años detectados en la lista de referencias corresponden a los últimos cinco años. Este cálculo es orientativo y no distingue autores clásicos indispensables.`,'Revisar la actualidad de las fuentes y justificar las referencias clásicas que sean indispensables.','Medio'));

  return {
    wordCount,pageCount,presence,formalStructureScore:formalScore,
    referenceSignals:{yearMentions:refYears.length,recentRatio,doiCount,urlCount,citationYearMentions:citationYearCount},
    observations:observations.slice(0,10)
  };
}

function automaticSummary(auto){
  const present=Object.entries(auto.presence||{}).filter(([,v])=>v).map(([k])=>k).join(', ')||'ninguna sección reconocida';
  const refs=auto.referenceSignals||{};
  return `VALIDACIÓN AUTOMÁTICA (señales, no sustituyen el juicio académico):\n- Palabras aproximadas: ${auto.wordCount}.\n- Páginas detectadas: ${auto.pageCount??'no disponible'}.\n- Secciones detectadas: ${present}.\n- Puntaje estructural orientativo para el bloque formal: ${auto.formalStructureScore}/20.\n- Años detectados en referencias: ${refs.yearMentions||0}; proporción reciente aproximada: ${refs.recentRatio==null?'no calculable':refs.recentRatio+'%'}.\n- DOI detectados: ${refs.doiCount||0}; URL detectadas: ${refs.urlCount||0}.\nNo conviertas automáticamente estas señales en errores si el contenido visible demuestra lo contrario.`;
}

function collectWindows(text,terms,limit){
  const source=String(text||'');
  const low=source.toLowerCase();
  const windows=[];
  const seen=[];
  const add=(start,end,label)=>{
    start=Math.max(0,start);end=Math.min(source.length,end);
    if(end-start<300)return;
    if(seen.some(([a,b])=>Math.max(a,start)<Math.min(b,end)))return;
    seen.push([start,end]);windows.push(`\n[Contexto: ${label}]\n${source.slice(start,end)}`);
  };
  add(0,Math.min(source.length,9000),'inicio del artículo');
  for(const term of terms){
    const idx=low.indexOf(term.toLowerCase());
    if(idx>=0)add(idx-3500,idx+9000,term);
    if(windows.join('').length>=limit)break;
  }
  if(/referenc|bibliograf/i.test(terms.join(' '))){const r=extractReferenceBlock(source);if(r)add(Math.max(0,source.length-r.length),source.length,'referencias')}
  let out=windows.join('\n');
  if(out.length>limit)out=out.slice(0,limit);
  return out||source.slice(0,limit);
}

function articleForLane(text,model,lane){
  const providerLimit=Math.max(12000,Number(model.maxInputChars)||90000);
  const laneLimit=Math.min(providerLimit,lane.id==='coherence'?65000:55000);
  return collectWindows(text,lane.focus,laneLimit);
}

function buildSpecializedPrompt(articleText,model,lane,auto){
  const maxima=new Map(RUBRIC);
  const allowed=lane.categories.map(n=>`${n}: ${maxima.get(n)}`).join('\n');
  return `Actúa como revisor especializado de un ARTÍCULO ACADÉMICO institucional. No es arbitraje de artículo científico.\nTu carril de revisión es: ${lane.label}.\nEl proveedor/modelo tiene como función configurada: ${model.reviewType||'General'}.\n\nEvalúa únicamente estas categorías:\n${allowed}\n\nReglas obligatorias:\n- No puntúes categorías fuera de la lista anterior.\n- Evalúa solo lo visible. No inventes fuentes, DOI, autores, páginas ni resultados.\n- La nota global final será consolidada por otro componente; tú solo produces puntuaciones parciales.\n- Si detectas un error metodológico grave, inclúyelo en critical y en observations con severidad Crítico.\n- Referencias: preferentemente últimos 5 años, salvo clásicos indispensables. Si no puedes verificar externamente una fuente, no la declares inexistente.\n- NO penalizar ORCID ni el año/volumen provisional de la revista.\n- Similitud y posible uso de IA son indicadores orientativos separados de la nota.\n- Máximo 8 observaciones de alta utilidad dentro de tu carril.\n\n${automaticSummary(auto)}\n\nDevuelve SOLO JSON válido con esta forma:\n{\n "categories":[["Nombre exacto de una categoría permitida",MAXIMO,PUNTAJE]],\n "observations":[{"severity":"Crítico|Alto|Medio|Bajo","section":"...","points":0,"page":"sección o ubicación","title":"...","original":"fragmento real breve","problem":"...","why":"...","fix":"...","proposal":"..."}],\n "critical":[],\n "similarityEstimate":0,\n "similarityRisk":"Bajo|Medio|Alto|Crítico",\n "similarityMatches":[],\n "aiEstimate":0,\n "aiRisk":"Bajo|Medio|Alto",\n "aiFlags":[]\n}\nIncluye TODAS las categorías permitidas de tu carril, con sus nombres exactos, y ninguna otra.\n\nEXTRACTO DEL ARTÍCULO PRIORIZADO PARA ESTE CARRIL:\n${articleText}`;
}

function normalizePartial(x){
  const allowed=new Map(RUBRIC.map(([n,m])=>[n,m]));
  const categoryMap=new Map();
  for(const row of Array.isArray(x?.categories)?x.categories:[]){
    if(!Array.isArray(row))continue;
    const name=RUBRIC.find(([n])=>lower(n)===lower(row[0]))?.[0];
    if(!name)continue;
    const max=allowed.get(name);categoryMap.set(name,clamp(row[2],0,max));
  }
  const observations=(Array.isArray(x?.observations)?x.observations:[]).slice(0,10).map(o=>({
    severity:['Crítico','Alto','Medio','Bajo'].includes(o?.severity)?o.severity:'Medio',
    section:String(o?.section||'General').slice(0,100),points:clamp(o?.points||0,0,20),
    page:String(o?.page||o?.section||'Sección no especificada').slice(0,120),title:String(o?.title||'Observación').slice(0,180),
    original:String(o?.original||'').slice(0,700),problem:String(o?.problem||'').slice(0,1200),why:String(o?.why||'').slice(0,1200),
    fix:String(o?.fix||'').slice(0,1200),proposal:String(o?.proposal||'').slice(0,1600),source:'IA'
  }));
  return {categoryMap,observations,critical:(Array.isArray(x?.critical)?x.critical:[]).map(String).slice(0,8),plagiarism:clamp(x?.similarityEstimate||0,0,100),ai:clamp(x?.aiEstimate||0,0,100),plagiarismMatches:(Array.isArray(x?.similarityMatches)?x.similarityMatches:[]).slice(0,8),aiFlags:(Array.isArray(x?.aiFlags)?x.aiFlags:[]).slice(0,8)};
}

const median=nums=>{const a=nums.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};
const risk=n=>n>=50?'Alto':n>=25?'Medio':'Bajo';

function consolidateHybrid(successes,fileName,cedula,automatic){
  const normalized=successes.map(s=>({...s,review:normalizePartial(s.result.json)}));
  const categories=RUBRIC.map(([name,max])=>{
    const scores=normalized.map(x=>x.review.categoryMap.get(name)).filter(Number.isFinite);
    let score=scores.length?median(scores):0;
    if(name==='Formato institucional ÉLITE'){
      const autoScore=clamp(automatic?.formalStructureScore||0,0,20);
      score=scores.length?(score*.75+autoScore*.25):autoScore;
    }
    if(name==='Referencias'&&automatic?.presence?.referencias===false)score=Math.min(score,1);
    if(name==='Resumen, Abstract y palabras clave'){
      if(automatic?.presence?.resumen===false)score=Math.min(score,2);
      else if(automatic?.presence?.abstract===false)score=Math.min(score,4.5);
      if(automatic?.presence?.palabrasClave===false)score=Math.min(score,Math.max(0,max-1));
    }
    return [name,max,Math.round(clamp(score,0,max)*10)/10];
  });

  const grouped=new Map();
  const addObservation=(o,reviewerLabel)=>{
    const key=`${o.section}|${o.title}`.toLowerCase().replace(/\s+/g,' ');
    const old=grouped.get(key);
    if(old){old.consensus++;if(reviewerLabel&&!old.reviewers.includes(reviewerLabel))old.reviewers.push(reviewerLabel);if((o.points||0)>(old.points||0))old.points=o.points}
    else grouped.set(key,{...o,consensus:1,reviewers:reviewerLabel?[reviewerLabel]:[]});
  };
  normalized.forEach(x=>x.review.observations.forEach(o=>addObservation(o,x.lane?.label||'Revisor')));
  (automatic?.observations||[]).forEach(o=>addObservation(o,'Validación automática'));

  const rank={Crítico:4,Alto:3,Medio:2,Bajo:1};
  const observations=[...grouped.values()].sort((a,b)=>(rank[b.severity]-rank[a.severity])||(b.consensus-a.consensus)).slice(0,22);
  const critical=[...new Set(normalized.flatMap(x=>x.review.critical))].slice(0,10);
  const methodologicalCritical=critical.some(x=>/metodolog|muestra|diseño|diseno|instrument|an[aá]lisis|validez/i.test(x))||observations.some(o=>o.severity==='Crítico'&&/metodolog|muestra|diseño|diseno|instrument|an[aá]lisis/i.test(`${o.section} ${o.title} ${o.problem}`));
  let score=Math.round(categories.reduce((s,r)=>s+r[2],0)*10)/10;
  if(methodologicalCritical&&score>79)score=79;

  const plagiarism=Math.round(median(normalized.map(x=>x.review.plagiarism)));
  const aiEstimate=Math.round(median(normalized.map(x=>x.review.ai)));
  return {
    id:null,n:1,date:new Date().toISOString(),file:fileName,cedula,engine:'hybrid-v1',
    score,approved:score>=70,reviewers:successes.length,
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
