window.STUDENT_DEMO_DATA = (() => {
  const rubric=[
    ['Título y delimitación',4,3.8],['Resumen, Abstract y palabras clave',6,5.6],['Introducción, antecedentes y problema',10,8.9],['Objetivos y coherencia',6,5.8],['Metodología',16,12.2],['Resultados',12,10.6],['Discusión',8,6.9],['Conclusiones y recomendaciones',6,5.4],['Referencias',7,5.7],['Redacción y coherencia global',5,4.4],['Formato institucional ÉLITE',20,15.5]
  ];
  const observations=[];
  const reviews=[];
  const student={id:'',name:'',cedula:'',career:'',used:0,available:3,reviews};
  const makeResult=()=>null;
  return {rubric,observations,student,makeResult};
})();

// Convierte PDF/DOCX a texto en el navegador y envía solo texto al backend seguro.
// Así las API keys permanecen en el servidor y no se exponen en GitHub Pages.
(() => {
  const R = window.Revisor;
  if (!R?.api) return;
  const originalApi = R.api;

  const loadScript = (src, globalName) => new Promise((resolve,reject) => {
    if (globalName && window[globalName]) return resolve(window[globalName]);
    const existing = [...document.scripts].find(s => s.src === src);
    if (existing) {
      existing.addEventListener('load',()=>resolve(globalName?window[globalName]:true),{once:true});
      existing.addEventListener('error',()=>reject(new Error('No se pudo cargar el lector de documentos.')),{once:true});
      return;
    }
    const s=document.createElement('script');
    s.src=src; s.async=true;
    s.onload=()=>resolve(globalName?window[globalName]:true);
    s.onerror=()=>reject(new Error('No se pudo cargar el lector de documentos.'));
    document.head.appendChild(s);
  });

  async function extractPdf(file) {
    const pdfjs = await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','pdfjsLib');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({data}).promise;
    const parts=[];
    for(let p=1;p<=doc.numPages;p++){
      const page=await doc.getPage(p);
      const content=await page.getTextContent();
      const text=(content.items||[]).map(i=>i.str||'').join(' ').replace(/\s+/g,' ').trim();
      parts.push(`\n[Página ${p}]\n${text}`);
    }
    return parts.join('\n').trim();
  }

  async function extractDocx(file) {
    const mammoth = await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js','mammoth');
    const result = await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
    return String(result.value||'').trim();
  }

  async function extractFile(file) {
    const name=String(file?.name||'').toLowerCase();
    if(name.endsWith('.pdf')) return extractPdf(file);
    if(name.endsWith('.docx')) return extractDocx(file);
    throw new Error('Solo se aceptan archivos PDF o DOCX.');
  }

  R.api = async (path, options={}) => {
    if (path === '/reviews' && options.body instanceof FormData) {
      const file = options.body.get('file');
      const cedula = String(options.body.get('cedula')||'').trim();
      if (!(file instanceof File)) throw new Error('No se encontró el archivo seleccionado.');
      const articleText = await extractFile(file);
      if (articleText.length < 700) throw new Error('No se pudo extraer suficiente texto del artículo. Verifica que el PDF tenga texto seleccionable.');
      return originalApi('/reviews',{
        method:'POST',
        body:JSON.stringify({cedula,fileName:file.name,articleText})
      });
    }
    return originalApi(path,options);
  };
})();
