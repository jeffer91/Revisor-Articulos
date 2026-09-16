(() => {
  let testingId = null;

  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-test-model]');
    if (btn) testingId = btn.dataset.testModel || null;
  }, true);

  const markSaturated = () => {
    if (!testingId) return;
    try {
      const models = JSON.parse(localStorage.getItem('revisor_models') || '[]');
      const model = models.find(m => m.id === testingId);
      if (model) {
        model.lastTest = 'Saturada';
        localStorage.setItem('revisor_models', JSON.stringify(models));
      }
      const row = document.querySelector(`[data-test-model="${testingId}"]`)?.closest('tr');
      const status = row?.querySelector('td:nth-child(5) .small');
      if (status) {
        status.textContent = 'Saturada';
        status.classList.remove('text-danger','text-success','muted');
        status.classList.add('text-warning');
      }
    } catch (err) {
      console.warn('No se pudo actualizar el estado temporal de la IA:', err);
    }
  };

  const result = document.getElementById('test-result');
  if (!result) return;

  const observer = new MutationObserver(() => {
    const text = (result.textContent || '').toLowerCase();
    if (!/high demand|saturad|temporar|rate limit|429|503|overloaded|capacity/.test(text)) return;

    const alert = result.querySelector('.alert-danger');
    if (alert) {
      alert.classList.remove('alert-danger');
      alert.classList.add('alert-warning');
      const strong = alert.querySelector('strong');
      if (strong) strong.textContent = 'Saturación temporal';
      const small = alert.querySelector('.small');
      if (small) {
        small.innerHTML = `${small.textContent}<br><br>La configuración respondió correctamente, pero el proveedor está saturado. En una revisión real se continuará automáticamente con la siguiente IA por prioridad.`;
      }
    }
    markSaturated();
  });

  observer.observe(result, {childList:true, subtree:true, characterData:true});
})();
