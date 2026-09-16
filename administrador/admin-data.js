window.ADMIN_DEMO_DATA = (() => {
  const catalog = [
    ['Gemini 3.8 Flash','Gemini API','General','Excelente','gemini-3.8-flash'],
    ['GPT-OSS 120B','Groq / Ollama','Metodología','Excelente','gpt-oss-120b'],
    ['Inkling','OpenRouter','General','Excelente','inkling'],
    ['Gemma 4 31B','OpenRouter','Redacción académica','Excelente','gemma-4-31b'],
    ['Gemma 4 26B A4B','OpenRouter','Coherencia','Excelente','gemma-4-26b-a4b'],
    ['Nemotron 3 Ultra','OpenRouter','Metodología','Excelente','nemotron-3-ultra'],
    ['Gemini 3.7 Flash','Gemini API','General','Excelente','gemini-3.7-flash'],
    ['Nemotron 3 Super','OpenRouter','Resultados y discusión','Excelente','nemotron-3-super'],
    ['Qwen 3.8 27B','Ollama local','Metodología','Muy buena','qwen-3.8-27b'],
    ['DeepSeek R1 Distill Qwen 32B','OpenRouter / Ollama','Estadística / lógica','Muy buena','deepseek-r1-distill-qwen-32b'],
    ['GLM 4.7 Flash','OpenRouter','Coherencia','Muy buena','glm-4.7-flash'],
    ['Gemini 3.6 Flash','Gemini API','General','Muy buena','gemini-3.6-flash'],
    ['Ling 3.0 Flash VL','OpenRouter','Tablas y figuras','Muy buena','ling-3.0-flash-vl'],
    ['Nemotron 3.5 Lightning','OpenRouter','Revisor crítico','Buena','nemotron-3.5-lightning'],
    ['GPT-OSS 20B','Groq / Ollama','Redacción / coherencia','Buena','gpt-oss-20b'],
    ['Dots3-Note Preview','OpenRouter','Documento completo','Buena, pero temporal','dots3-note-preview'],
    ['Gemini 3.5 Flash','Gemini API','Redacción','Buena','gemini-3.5-flash'],
    ['Inkling Small','OpenRouter','Coherencia','Buena','inkling-small'],
    ['Nemotron 3 Nano Omni','OpenRouter','Tablas / imágenes','Buena','nemotron-3-nano-omni'],
    ['Ling 3.0 Flash Sante','OpenRouter','Artículos de salud','Excelente en salud','ling-3.0-flash-sante'],
    ['Ling 3.0 Flash Fin','OpenRouter','Economía / finanzas','Buena especializada','ling-3.0-flash-fin'],
    ['Nex-N2.5-Pro','OpenRouter','Investigación / contraste','Secundaria','nex-n2.5-pro'],
    ['Nex-N2.5-Mini','OpenRouter','Investigación / contraste','Secundaria','nex-n2.5-mini'],
    ['Gemini 3.1 Flash-Lite','Gemini API','Formato / extracción','Secundaria','gemini-3.1-flash-lite'],
    ['Laguna S 2.1','OpenRouter','Respaldo','No prioritaria para artículos','laguna-s-2.1']
  ];

  const models = catalog.map((m,i)=>({
    id:`model-${i+1}`,
    name:m[0],
    provider:m[1],
    specialty:m[2],
    reviewType:m[2],
    level:m[3],
    model:m[4],
    priority:i+1,
    weight:1,
    state:i<5?'Activa':'Inactiva',
    lastTest:'Sin probar',
    endpoint:'',
    timeout:90,
    temperature:.2,
    tokens:6000,
    prompt:''
  }));
  return {models,students:[],reviews:[],alerts:[]};
})();

// Migra el catálogo anterior al nuevo orden de 25 IA sin perder la configuración técnica
// de modelos que continúan en la lista. La prioridad, función, nivel y estado inicial
// sí se reemplazan por los definidos en el catálogo actual.
(() => {
  const CATALOG_VERSION = '2026-09-16-ai-catalog-v3';
  try {
    if (localStorage.getItem('revisor_models_catalog_version') === CATALOG_VERSION) return;

    const previous = JSON.parse(localStorage.getItem('revisor_models') || '[]');
    const aliases = {
      'Inkling':'Thinking Machines Inkling',
      'Nemotron 3 Ultra':'NVIDIA Nemotron 3 Ultra',
      'Nemotron 3 Super':'NVIDIA Nemotron 3 Super',
      'Nemotron 3.5 Lightning':'NVIDIA Nemotron 3.5 Lightning',
      'Nemotron 3 Nano Omni':'NVIDIA Nemotron 3 Nano Omni',
      'Laguna S 2.1':'Poolside Laguna S 2.1'
    };

    const technicalFields = ['endpoint','weight','timeout','temperature','tokens','prompt','lastTest'];
    const next = window.ADMIN_DEMO_DATA.models.map(base => {
      const old = previous.find(m => m.name === base.name) || previous.find(m => m.name === aliases[base.name]);
      if (!old) return {...base};

      const migrated = {...base};
      technicalFields.forEach(field => {
        if (old[field] !== undefined && old[field] !== null && old[field] !== '') migrated[field] = old[field];
      });

      // Conserva endpoint/clave de la IA anterior, pero usa el identificador del nuevo catálogo.
      const oldKey = sessionStorage.getItem(`revisor_key_${old.id}`);
      if (oldKey) sessionStorage.setItem(`revisor_key_${base.id}`, oldKey);
      return migrated;
    });

    localStorage.setItem('revisor_models', JSON.stringify(next));
    localStorage.setItem('revisor_models_catalog_version', CATALOG_VERSION);
  } catch (err) {
    console.warn('No se pudo migrar el catálogo de IA:', err);
  }
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
      const stored = JSON.parse(localStorage.getItem('revisor_models') || '[]');
      const modelFromForm = String(document.querySelector('#model-model')?.value || '').replace(/^models\//i, '').trim();
      const endpointFromForm = String(document.querySelector('#model-endpoint')?.value || '').trim();
      const normalizedInput = String(url).split('?')[0];
      const match = stored.find(m => {
        const endpoint = String(m.endpoint || '').split('?')[0];
        return endpoint && (endpoint === normalizedInput || normalizedInput.includes(String(m.model || '')));
      });
      const modelName = String(match?.model || (endpointFromForm && url.includes(endpointFromForm) ? modelFromForm : '') || modelFromForm)
        .replace(/^models\//i, '')
        .trim();

      if (modelName) url = url.replace(/\{modelo\}|\{model\}/gi, modelName);

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
