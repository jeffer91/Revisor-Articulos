const RUBRIC = [
  ['Título y delimitación',4],
  ['Resumen, Abstract y palabras clave',6],
  ['Introducción, antecedentes y problema',10],
  ['Objetivos y coherencia',6],
  ['Metodología',16],
  ['Resultados',12],
  ['Discusión',8],
  ['Conclusiones y recomendaciones',6],
  ['Referencias',7],
  ['Redacción y coherencia global',5],
  ['Formato institucional ÉLITE',20]
];

const DEFAULT_MODELS = [
  ['Gemini 3.8 Flash','Gemini API','General','Excelente','gemini-3.8-flash','https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent',100000],
  ['GPT-OSS 120B','Groq','Metodología','Excelente','openai/gpt-oss-120b','https://api.groq.com/openai/v1/chat/completions',100000],
  ['Mistral Small','Mistral AI','Redacción académica','Muy buena','mistral-small-latest','https://api.mistral.ai/v1/chat/completions',100000],
  ['Gemma 4 31B','NVIDIA NIM','Revisor crítico','Excelente','google/gemma-4-31b-it','https://integrate.api.nvidia.com/v1/chat/completions',100000],
  ['GLM 4.7 Flash','Cloudflare Workers AI','Coherencia / formato','Muy buena','@cf/zai-org/glm-4.7-flash','https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions',90000],
  ['GPT-OSS 120B','Cerebras','Razonamiento / estadística','Excelente','gpt-oss-120b','https://api.cerebras.ai/v1/chat/completions',22000],
  ['OpenRouter Free','OpenRouter','Respaldo dinámico','Respaldo','openrouter/free','https://openrouter.ai/api/v1/chat/completions',100000],
  ['Apertus 1.5 8B','Public AI','Contraste / respaldo','Secundaria','swiss-ai/apertus-v1.5-8b','https://api.publicai.co/v1/chat/completions',90000]
].map((m,i)=>({
  id:`model-${i+1}`,
  name:m[0], provider:m[1], reviewType:m[2], specialty:m[2], level:m[3],
  model:m[4], endpoint:m[5], maxInputChars:m[6], priority:i+1,
  weight:1, state:'Activa', timeout:90, temperature:.2, tokens:6000, prompt:''
}));

module.exports = { RUBRIC, DEFAULT_MODELS };
