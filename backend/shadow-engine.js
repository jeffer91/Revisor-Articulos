const VERSION='itsqmet-shadow-v0.1.0';

const CATEGORY_SIGNALS={
  'Coherencia título–problema–pregunta–objetivos':['problema','pregunta','objetivo general','objetivos específicos','objetivos especificos'],
  'Problema y justificación':['problema','justificación','justificacion','beneficiarios','relevancia','necesidad'],
  'Fundamentación teórica y antecedentes':['marco teórico','marco teorico','fundamentación','fundamentacion','antecedentes','estado del arte','referencias'],
  'Diseño metodológico':['metodología','metodologia','método','metodo','enfoque','diseño','diseno','alcance'],
  'Instrumentos y rigor de la obtención de información':['instrumento','encuesta','entrevista','observación','observacion','validez','confiabilidad','triangulación','triangulacion'],
  'Población, muestra y recopilación':['población','poblacion','muestra','muestreo','unidad de análisis','unidad de analisis','recolección','recoleccion'],
  'Procesamiento y análisis de datos':['procesamiento','análisis','analisis','codificación','codificacion','estadíst','cualitativ'],
  'Resultados':['resultados','hallazgos','tabla','figura','datos'],
  'Discusión académica':['discusión','discusion','coincide','difiere','implicaciones','limitaciones'],
  'Conclusiones':['conclusiones','conclusión','conclusion'],
  'Aporte, utilidad y propuesta':['aporte','utilidad','propuesta','recomendaciones','aplicación','aplicacion'],
  'Calidad académica formal':['referencias','bibliografía','bibliografia','doi','ética','etica','confidencialidad','consentimiento']
};

const normalize=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const escRe=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function evidenceFor(text,signals){
  const plain=String(text||'').replace(/\s+/g,' ').trim(),normalized=normalize(plain);
  let best=null;
  for(const raw of signals){
    const signal=normalize(raw),idx=normalized.indexOf(signal);
    if(idx>=0&&(best===null||idx<best.idx))best={idx,signal:raw};
  }
  if(!best)return '';
  const start=Math.max(0,best.idx-90),end=Math.min(plain.length,best.idx+190);
  return `${start?'…':''}${plain.slice(start,end).trim()}${end<plain.length?'…':''}`;
}

function scoreSignals(text,signals){
  const source=normalize(text),unique=new Set();
  for(const signal of signals){
    const normalized=normalize(signal);
    if(source.includes(normalized))unique.add(normalized);
  }
  return unique.size;
}

function review(text,microcriteria,automatic={}){
  const source=String(text||''),wordCount=Number(automatic.wordCount||source.split(/\s+/).filter(Boolean).length),items=[];
  for(const [category,criteria] of Object.entries(microcriteria||{})){
    const categorySignals=CATEGORY_SIGNALS[category]||[];
    for(const [id,label,weight] of criteria){
      const labelWords=normalize(label).split(/[^a-z0-9]+/).filter(x=>x.length>=6).slice(0,4);
      const signals=[...categorySignals,...labelWords];
      const hits=scoreSignals(source,signals),hasEvidence=hits>0;
      let status='Parcial bajo',confidence=.35;
      if(hits>=5&&wordCount>=1800){status='Parcial alto';confidence=.62}
      else if(hits>=2&&wordCount>=900){status='Parcial';confidence=.5}
      else if(hasEvidence){status='Parcial bajo';confidence=.42}
      else {status='No cumple';confidence=.36}
      items.push({id,category,label,weight,status,confidence,evidence:evidenceFor(source,signals),reason:`Baseline v0.1: ${hits} señal(es) textuales detectadas. No afecta la nota.`});
    }
  }
  return {engine:'ITSQMET Shadow',version:VERSION,mode:'shadow',createdAt:new Date().toISOString(),items};
}

module.exports={VERSION,review,CATEGORY_SIGNALS};
