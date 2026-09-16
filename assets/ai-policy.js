(() => {
  const MIN_SUCCESS = 3;
  const MAX_SUCCESS = 5;

  const sortCandidates = models => [...(models || [])]
    .filter(m => m && m.state === 'Activa')
    .sort((a,b) => (Number(a.priority) || 999) - (Number(b.priority) || 999));

  const isTemporaryFailure = error => {
    const text = String(error?.message || error || '').toLowerCase();
    return /high demand|temporar|saturad|rate limit|429|503|timeout|timed out|overloaded|capacity/.test(text);
  };

  // Ejecuta hasta 5 revisores en paralelo. Cuando alguno falla, toma el siguiente por prioridad
  // hasta completar 5 éxitos o agotar el catálogo. La revisión solo es válida con al menos 3 éxitos.
  async function runWithFallback(models, runner, options = {}) {
    const minSuccess = Math.max(1, Number(options.minSuccess) || MIN_SUCCESS);
    const maxSuccess = Math.max(minSuccess, Number(options.maxSuccess) || MAX_SUCCESS);
    const candidates = sortCandidates(models);
    const successes = [];
    const failures = [];
    let cursor = 0;

    while (successes.length < maxSuccess && cursor < candidates.length) {
      const slots = maxSuccess - successes.length;
      const batch = candidates.slice(cursor, cursor + slots);
      cursor += batch.length;
      if (!batch.length) break;

      const settled = await Promise.allSettled(batch.map(model => runner(model)));
      settled.forEach((item, index) => {
        const model = batch[index];
        if (item.status === 'fulfilled') {
          successes.push({model, result:item.value});
        } else {
          failures.push({
            model,
            error:item.reason,
            temporary:isTemporaryFailure(item.reason)
          });
        }
      });
    }

    return {
      complete: successes.length >= minSuccess,
      minSuccess,
      maxSuccess,
      successes: successes.slice(0, maxSuccess),
      failures,
      attempted: successes.length + failures.length,
      remaining: Math.max(0, candidates.length - cursor)
    };
  }

  window.REVIEW_AI_POLICY = {
    MIN_SUCCESS,
    MAX_SUCCESS,
    sortCandidates,
    isTemporaryFailure,
    runWithFallback
  };
})();
