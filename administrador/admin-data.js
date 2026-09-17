window.ADMIN_DEMO_DATA = (() => {
  // IDs estables: el orden visual lo determina priority, no la posición del arreglo.
  const catalog = [
    ['Gemini 3.8 Flash','Gemini API','General','Excelente','gemini-3.8-flash','https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent',4,100000],
    ['GPT-OSS 120B','Groq','Metodología','Excelente','openai/gpt-oss-120b','https://api.groq.com/openai/v1/chat/completions',1,100000],
    ['Mistral Small','Mistral AI','Redacción académica','Muy buena','mistral-small-latest','https://api.mistral.ai/v1/chat/completions',5,100000],
    ['Gemma 4 31B','NVIDIA NIM','Revisor crítico','Excelente','google/gemma-4-31b-it','https://integrate.api.nvidia.com/v1/chat/completions',2,100000],
    ['Gemma 4 26B A4B','Cloudflare Workers AI','Coherencia / formato','Excelente','@cf/google/gemma-4-26b-a4b-it','https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions',3,120000],
    ['GPT-OSS 120B','Cerebras','Razonamiento / estadística','Excelente','gpt-oss-120b','https://api.cerebras.ai/v1/chat/completions',7,22000],
    ['OpenRouter Free','OpenRouter','Respaldo dinámico','Respaldo','openrouter/free','https://openrouter.ai/api/v1/chat/completions',8,100000],
    ['Apertus 1.5 8B','Public AI','Contraste / respaldo','Secundaria','swiss-ai/apertus-v1.5-8b','https://api.publicai.co/v1/chat/completions',6,90000]
  ];

  const models = catalog.map((m,i)=>({
    id:`model-${i+1}`,
    name:m[0], provider:m[1], specialty:m[2], reviewType:m[2], level:m[3],
    model:m[4], endpoint:m[5], priority:m[6], maxInputChars:m[7], weight:1, state:'Activa',
    lastTest:'Sin probar', timeout:90, temperature:.2, tokens:6000, prompt:''
  }));
  return {models,students:[],reviews:[],alerts:[]};
})();

(() => {
  const CATALOG_VERSION = '2026-09-17-ai-catalog-v8-stable-priority';
  try {
    if (localStorage.getItem('revisor_models_catalog_version') === CATALOG_VERSION) return;
    const previous = JSON.parse(localStorage.getItem('revisor_models') || '[]');
    const next = window.ADMIN_DEMO_DATA.models.map(base => {
      const exact = previous.find(m => m.id === base.id) || previous.find(m => m.provider === base.provider && m.model === base.model);
      const sameProvider = previous.find(m => m.provider === base.provider);
      const old = exact || sameProvider;
      const migrated = {...base};
      if (old) {
        ['weight','timeout','temperature','tokens','prompt'].forEach(field => {
          if (old[field] !== undefined && old[field] !== null && old[field] !== '') migrated[field] = old[field];
        });
        if (exact) migrated.lastTest = old.lastTest || 'Sin probar';
        migrated.state = old.state === 'Inactiva' ? 'Inactiva' : 'Activa';
      }
      const keySource = [old, ...previous.filter(m => m.provider === base.provider)].filter(Boolean)
        .find(m => sessionStorage.getItem(`revisor_key_${m.id}`));
      if (keySource) {
        const key = sessionStorage.getItem(`revisor_key_${keySource.id}`);
        if (key) sessionStorage.setItem(`revisor_key_${base.id}`, key);
      }
      return migrated;
    });
    localStorage.setItem('revisor_models', JSON.stringify(next));
    localStorage.setItem('revisor_models_catalog_version', CATALOG_VERSION);
  } catch (err) {
    console.warn('No se pudo migrar el catálogo de IA:', err);
  }
})();

(() => {
  const script = document.createElement('script');
  script.src = 'admin-fixes.js';
  script.defer = true;
  document.head.appendChild(script);
})();
