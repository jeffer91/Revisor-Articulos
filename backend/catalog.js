const RUBRIC = [
  ['Coherencia título–problema–pregunta–objetivos',8],
  ['Problema y justificación',6],
  ['Fundamentación teórica y antecedentes',8],
  ['Diseño metodológico',10],
  ['Instrumentos y rigor de la obtención de información',8],
  ['Población, muestra y recopilación',7],
  ['Procesamiento y análisis de datos',8],
  ['Resultados',15],
  ['Discusión académica',10],
  ['Conclusiones',8],
  ['Aporte, utilidad y propuesta',6],
  ['Calidad académica formal',6]
]

// Los IDs son estables para no perder las API keys ya guardadas.
// La prioridad se ajusta según el comportamiento observado en revisiones reales.
const DEFAULT_MODELS = [
  ['Gemini 3.8 Flash','Gemini API','General','Excelente','gemini-3.8-flash','https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent',100000,4],
  ['GPT-OSS 120B','Groq','Metodología','Excelente','openai/gpt-oss-120b','https://api.groq.com/openai/v1/chat/completions',100000,1],
  ['Mistral Small','Mistral AI','Redacción académica','Muy buena','mistral-small-latest','https://api.mistral.ai/v1/chat/completions',100000,5],
  ['Gemma 4 31B','NVIDIA NIM','Revisor crítico','Excelente','google/gemma-4-31b-it','https://integrate.api.nvidia.com/v1/chat/completions',100000,2],
  ['Gemma 4 26B A4B','Cloudflare Workers AI','Coherencia / formato','Excelente','@cf/google/gemma-4-26b-a4b-it','https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions',120000,3],
  ['GPT-OSS 120B','Cerebras','Razonamiento / estadística','Excelente','gpt-oss-120b','https://api.cerebras.ai/v1/chat/completions',22000,7],
  ['OpenRouter Free','OpenRouter','Respaldo dinámico','Respaldo','openrouter/free','https://openrouter.ai/api/v1/chat/completions',100000,8],
  ['Apertus 1.5 8B','Public AI','Contraste / respaldo','Secundaria','swiss-ai/apertus-v1.5-8b','https://api.publicai.co/v1/chat/completions',90000,6]
].map((m,i)=>({
  id:`model-${i+1}`,
  name:m[0], provider:m[1], reviewType:m[2], specialty:m[2], level:m[3],
  model:m[4], endpoint:m[5], maxInputChars:m[6], priority:m[7],
  weight:1, state:'Activa', timeout:90, temperature:.15, tokens:6000, prompt:'',
  stableBackup:m[2]==='Respaldo dinámico'
}));

module.exports = { RUBRIC, DEFAULT_MODELS };
