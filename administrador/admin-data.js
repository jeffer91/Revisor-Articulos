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
  const students = [];
  const reviews = [];
  const alerts = [];
  return {models,students,reviews,alerts};
})();

// Normaliza endpoints configurables de Gemini antes de enviarlos.
// Permite usar {modelo} o {model} en el endpoint del Administrador.
(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    let url = typeof input === 'string' ? input : input?.url;
    if (!url || !/generativelanguage\.googleapis\.com/i.test(url)) {
      return nativeFetch(input, init);
    }

    try {
      const urlWithoutQuery = url.split('?')[0];
      const stored = JSON.parse(localStorage.getItem('revisor_models') || '[]');
      const match = stored.find(m => String(m.endpoint || '').split('?')[0] === urlWithoutQuery);
      const modelName = String(match?.model || document.querySelector('#model-model')?.value || '')
        .replace(/^models\//i, '')
        .trim();

      if (modelName) {
        url = url.replace(/\{modelo\}|\{model\}/gi, modelName);
      }

      const requestUrl = new URL(url);
      const key = requestUrl.searchParams.get('key');
      const headers = new Headers(init.headers || {});
      if (key && !headers.has('x-goog-api-key')) {
        headers.set('x-goog-api-key', key);
        requestUrl.searchParams.delete('key');
        url = requestUrl.toString();
      }
      init = {...init, headers};
    } catch (err) {
      console.warn('No se pudo normalizar el endpoint de Gemini:', err);
    }

    return nativeFetch(url, init);
  };
})();
