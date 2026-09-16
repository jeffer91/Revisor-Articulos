window.ADMIN_DEMO_DATA = (() => {
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent';
  const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
  const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

  const catalog = [
    ['Gemini 3.8 Flash','Gemini API','General','Excelente','gemini-3.8-flash',GEMINI_ENDPOINT],
    ['GPT-OSS 120B','Groq','Metodología','Excelente','openai/gpt-oss-120b',GROQ_ENDPOINT],
    ['Inkling','OpenRouter','General','Excelente','thinkingmachines/inkling',OPENROUTER_ENDPOINT],
    ['Gemma 4 31B','OpenRouter','Redacción académica','Excelente','google/gemma-4-31b-it',OPENROUTER_ENDPOINT],
    ['Gemma 4 26B A4B','OpenRouter','Coherencia','Excelente','google/gemma-4-26b-a4b-it',OPENROUTER_ENDPOINT],
    ['Nemotron 3 Ultra','OpenRouter','Metodología','Excelente','nvidia/nemotron-3-ultra-550b-a55b',OPENROUTER_ENDPOINT],
    ['Gemini 3.7 Flash','Gemini API','General','Excelente','gemini-3.7-flash',GEMINI_ENDPOINT],
    ['Nemotron 3 Super','OpenRouter','Resultados y discusión','Excelente','nvidia/nemotron-3-super-120b-a12b:free',OPENROUTER_ENDPOINT],
    ['Qwen 3.8 27B','Groq','Metodología','Muy buena','qwen/qwen3.8-27b',GROQ_ENDPOINT],
    ['DeepSeek R1 Distill Qwen 32B','OpenRouter','Estadística / lógica','Muy buena','deepseek/deepseek-r1-distill-qwen-32b',OPENROUTER_ENDPOINT],
    ['GLM 4.7 Flash','OpenRouter','Coherencia','Muy buena','z-ai/glm-4.7-flash',OPENROUTER_ENDPOINT],
    ['Gemini 3.6 Flash','Gemini API','General','Muy buena','gemini-3.6-flash',GEMINI_ENDPOINT],
    ['Ling 3.0 Flash VL','OpenRouter','Tablas y figuras','Muy buena','inclusionai/ling-3.0-flash-vl',OPENROUTER_ENDPOINT],
    ['Nemotron 3.5 Lightning','OpenRouter','Revisor crítico','Buena','nvidia/nemotron-3.5-lightning:free',OPENROUTER_ENDPOINT],
    ['GPT-OSS 20B','Groq','Redacción / coherencia','Buena','openai/gpt-oss-20b',GROQ_ENDPOINT],
    ['Dots3-Note Preview','OpenRouter','Documento completo','Buena, pero temporal','dots-studio/dots-3-note-preview:free',OPENROUTER_ENDPOINT],
    ['Gemini 3.5 Flash','Gemini API','Redacción','Buena','gemini-3.5-flash',GEMINI_ENDPOINT],
    ['Inkling Small','OpenRouter','Coherencia','Buena','thinkingmachines/inkling-small',OPENROUTER_ENDPOINT],
    ['Nemotron 3 Nano Omni','OpenRouter','Tablas / imágenes','Buena','nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',OPENROUTER_ENDPOINT],
    ['Ling 3.0 Flash Sante','OpenRouter','Artículos de salud','Excelente en salud','inclusionai/ling-3.0-flash-sante:free',OPENROUTER_ENDPOINT],
    ['Ling 3.0 Flash Fin','OpenRouter','Economía / finanzas','Buena especializada','inclusionai/ling-3.0-flash-fin:free',OPENROUTER_ENDPOINT],
    ['Nex-N2.5-Pro','OpenRouter','Investigación / contraste','Secundaria','nex-agi/nex-n2.5-pro:free',OPENROUTER_ENDPOINT],
    ['Nex-N2.5-Mini','OpenRouter','Investigación / contraste','Secundaria','nex-agi/nex-n2.5-mini:free',OPENROUTER_ENDPOINT],
    ['Gemini 3.1 Flash-Lite','Gemini API','Formato / extracción','Secundaria','gemini-3.1-flash-lite',GEMINI_ENDPOINT],
    ['Laguna S 2.1','OpenRouter','Respaldo','No prioritaria para artículos','poolside/laguna-s-2.1:free',OPENROUTER_ENDPOINT]
  ];

  const models = catalog.map((m,i)=>({
    id:`model-${i+1}`,
    name:m[0],
    provider:m[1],
    specialty:m[2],
    reviewType:m[2],
    level:m[3],
    model:m[4],
    endpoint:m[5],
    priority:i+1,
    weight:1,
    state:'Activa',
    lastTest:'Sin probar',
    timeout:90,
    temperature:.2,
    tokens:6000,
    prompt:''
  }));
  return {models,students:[],reviews:[],alerts:[]};
})();

// Migra el catálogo anterior al catálogo verificado. Conserva ajustes técnicos del administrador,
// pero deja todos los modelos disponibles para la lógica de reemplazo por prioridad.
(() => {
  const CATALOG_VERSION = '2026-09-16-ai-catalog-v4';
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

    const next = window.ADMIN_DEMO_DATA.models.map(base => {
      const old = previous.find(m => m.name === base.name) || previous.find(m => m.name === aliases[base.name]);
      if (!old) return {...base};
      const migrated = {...base};
      // Solo conserva preferencias que no rompen el proveedor/modelo verificado.
      ['weight','timeout','temperature','tokens','prompt'].forEach(field => {
        if (old[field] !== undefined && old[field] !== null && old[field] !== '') migrated[field] = old[field];
      });
      // Mantiene el último estado de prueba como referencia, pero todos quedan habilitados para fallback.
      migrated.lastTest = old.lastTest || 'Sin probar';
      migrated.state = 'Activa';
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

// Normaliza endpoints configurables de Gemini y reintenta automáticamente errores temporales
// de saturación (429/503). Esto evita marcar una saturación momentánea como configuración inválida.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  window.fetch = async (input, init = {}) => {
    let url = typeof input === 'string' ? input : input?.url;
    const isGeminiHost = !!url && /generativelanguage\.googleapis\.com/i.test(url);

    if (isGeminiHost) {
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
    }

    const retryable = status => status === 429 || status === 503;
    const delays = [0, 1200, 2600];
    let response;
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt]) await wait(delays[attempt]);
      response = await nativeFetch(url || input, init);
      if (!isGeminiHost || !retryable(response.status) || attempt === delays.length - 1) return response;
    }
    return response;
  };
})();
