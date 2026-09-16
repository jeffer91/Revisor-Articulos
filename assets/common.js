(() => {
  const config = window.REVISOR_CONFIG || {};
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const api = async (path, options = {}) => {
    if (!config.API_BASE_URL) throw new Error('BACKEND_NOT_CONFIGURED');
    const token = sessionStorage.getItem('revisor_token');
    const headers = new Headers(options.headers || {});
    if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${config.API_BASE_URL}${path}`, {...options, headers});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `HTTP_${response.status}`);
    return data;
  };

  const toast = (message, type = 'info') => {
    let area = $('#toast-area');
    if (!area) {
      area = document.createElement('div');
      area.id = 'toast-area';
      area.className = 'toast-area';
      document.body.appendChild(area);
    }
    const item = document.createElement('div');
    item.className = `toast toast-${type}`;
    item.textContent = message;
    area.appendChild(item);
    setTimeout(() => item.classList.add('toast-show'), 10);
    setTimeout(() => {
      item.classList.remove('toast-show');
      setTimeout(() => item.remove(), 250);
    }, 3600);
  };

  const modal = (id, show = true) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('is-open', show);
    document.body.classList.toggle('modal-open', show);
  };

  const formatDate = (value) => new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(value));

  const riskClass = (level) => ({
    bajo: 'success', medio: 'warning', alto: 'danger', crítico: 'danger', critico: 'danger'
  }[(level || '').toLowerCase()] || 'neutral');

  $$('.menu-toggle').forEach(btn => btn.addEventListener('click', () => {
    const nav = $('.top-nav');
    nav?.classList.toggle('open');
  }));

  document.addEventListener('click', (event) => {
    const closer = event.target.closest('[data-close-modal]');
    if (closer) modal(closer.dataset.closeModal, false);
    if (event.target.classList.contains('modal-backdrop')) {
      const openModal = event.target.closest('.modal');
      if (openModal) modal(openModal.id, false);
    }
  });

  window.Revisor = { $, $$, api, toast, modal, formatDate, riskClass, config };
})();
