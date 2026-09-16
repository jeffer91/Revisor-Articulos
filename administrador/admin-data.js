window.ADMIN_DEMO_DATA = (() => {
  const catalog = [
    ['Gemini 3.8 Flash','Gemini API','Revisión general, metodología, coherencia'],
    ['Gemini 3.7 Flash','Gemini API','Texto largo y análisis'],
    ['Gemini 3.6 Flash','Gemini API','Revisión general rápida'],
    ['NVIDIA Nemotron 3 Ultra','OpenRouter','Razonamiento profundo y documentos largos'],
    ['NVIDIA Nemotron 3 Super','OpenRouter','Evaluación crítica'],
    ['Gemma 4 31B','OpenRouter','Comprensión de documentos académicos'],
    ['Gemma 4 26B A4B','OpenRouter','Estructura, redacción y análisis'],
    ['Thinking Machines Inkling','OpenRouter','Razonamiento y análisis multidocumento'],
    ['Inkling Small','OpenRouter','Revisión secundaria ligera'],
    ['Dots3-Note Preview','OpenRouter','Documentos extensos'],
    ['Ling 3.0 Flash VL','OpenRouter','Texto, figuras y tablas'],
    ['Ling 3.0 Flash Sante','OpenRouter','Artículos de salud'],
    ['Ling 3.0 Flash Fin','OpenRouter','Finanzas y economía'],
    ['NVIDIA Nemotron 3.5 Lightning','OpenRouter','Revisión rápida'],
    ['NVIDIA Nemotron 3 Nano Omni','OpenRouter','Multimodal'],
    ['Nex-N2.5-Pro','OpenRouter','Razonamiento y procesos complejos'],
    ['Nex-N2.5-Mini','OpenRouter','Revisión rápida secundaria'],
    ['Poolside Laguna S 2.1','OpenRouter','Revisor adicional'],
    ['Poolside Laguna XS 2.1','OpenRouter','Revisión secundaria rápida'],
    ['Cohere North Mini Code','OpenRouter','Contraste adicional'],
    ['GPT-OSS 120B','Groq / Ollama','Razonamiento académico'],
    ['GPT-OSS 20B','Groq / Ollama','Revisión académica rápida'],
    ['Qwen 3.5 27B','Ollama local','Español y razonamiento'],
    ['Qwen 3.5 9B','Ollama local','Revisión ligera'],
    ['Gemma 3 27B','Ollama local','Redacción y análisis'],
    ['Gemma 3 12B','Ollama local','Revisión ligera']
  ];
  const models = catalog.map((m,i)=>({id:`model-${i+1}`,name:m[0],provider:m[1],specialty:m[2],priority:i+1,weight:1,state:i<5?'Activa':'Inactiva',lastTest:i<5?'Correcta':'Sin probar',model:m[0].toLowerCase().replace(/[^a-z0-9]+/g,'-'),endpoint:'',timeout:90,temperature:.2,tokens:6000,reviewType:'General',prompt:''}));
  const students = [
    {id:'s1',name:'Andrea Morales',cedula:'1712345678',career:'Administración',used:2,available:1,last:'2026-09-16T08:15:00-05:00',state:'Activo'},
    {id:'s2',name:'Carlos Núñez',cedula:'1723456789',career:'Marketing Digital',used:1,available:2,last:'2026-09-15T17:40:00-05:00',state:'Activo'},
    {id:'s3',name:'María Salazar',cedula:'1734567890',career:'Contabilidad',used:3,available:0,last:'2026-09-15T13:05:00-05:00',state:'Activo'},
    {id:'s4',name:'Daniela Paredes',cedula:'1745678901',career:'Talento Humano',used:0,available:3,last:null,state:'Activo'}
  ];
  const reviews = [
    {id:'r5',student:'Andrea Morales',studentId:'s1',cedula:'1712345678',n:2,date:'2026-09-16T08:15:00-05:00',file:'articulo_version_2.docx',score:84.8,plagiarism:12,ai:18,reviewers:5,status:'Completa',approved:true},
    {id:'r4',student:'Carlos Núñez',studentId:'s2',cedula:'1723456789',n:1,date:'2026-09-15T17:40:00-05:00',file:'articulo_final.pdf',score:76.5,plagiarism:9,ai:24,reviewers:4,status:'Completa',approved:true},
    {id:'r3',student:'María Salazar',studentId:'s3',cedula:'1734567890',n:3,date:'2026-09-15T13:05:00-05:00',file:'revision_3.docx',score:68.2,plagiarism:22,ai:31,reviewers:3,status:'Completa',approved:false},
    {id:'r2',student:'Andrea Morales',studentId:'s1',cedula:'1712345678',n:1,date:'2026-09-10T10:20:00-05:00',file:'articulo_version_1.docx',score:71.3,plagiarism:18,ai:27,reviewers:4,status:'Completa',approved:true},
    {id:'r1',student:'María Salazar',studentId:'s3',cedula:'1734567890',n:2,date:'2026-09-08T09:10:00-05:00',file:'revision_2.docx',score:null,plagiarism:null,ai:null,reviewers:2,status:'Incompleta',approved:false}
  ];
  const alerts = [
    {type:'Técnica',student:'María Salazar',date:'2026-09-08T09:14:00-05:00',detail:'No se alcanzaron 3 IA exitosas; el intento no fue descontado.',state:'Nueva'},
    {type:'Crítica',student:'Carlos Núñez',date:'2026-09-15T17:43:00-05:00',detail:'Se detectó una referencia que requiere verificación manual.',state:'Revisada'},
    {type:'Técnica',student:'—',date:'2026-09-16T07:55:00-05:00',detail:'Un modelo superó el timeout configurado.',state:'Nueva'}
  ];
  return {models,students,reviews,alerts};
})();
