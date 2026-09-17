(() => {
  const config = window.REVISOR_CONFIG || {};
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const expireAdminSession = (message = 'Tu sesión administrativa expiró. Ingresa nuevamente.') => {
    sessionStorage.removeItem('revisor_token');
    sessionStorage.removeItem('revisor_admin_auth');
    sessionStorage.setItem('revisor_relogin_notice', message);
  };

  const api = async (path, options = {}) => {
    if (!config.API_BASE_URL) throw new Error('BACKEND_NOT_CONFIGURED');
    const token = sessionStorage.getItem('revisor_token');
    const headers = new Headers(options.headers || {});
    if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${config.API_BASE_URL}${path}`, {...options, headers});
    const data = await response.json().catch(() => ({}));

    if (response.status === 401 && path.startsWith('/admin/')) {
      expireAdminSession(data.message || 'Tu sesión administrativa expiró. Ingresa nuevamente.');
      setTimeout(() => location.reload(), 50);
      throw new Error('Sesión administrativa expirada. Vuelve a ingresar.');
    }

    if (!response.ok) throw new Error(data.message || `HTTP_${response.status}`);
    return data;
  };

  const firestoreValue = (value) => {
    if (!value || typeof value !== 'object') return null;
    if ('stringValue' in value) return value.stringValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('timestampValue' in value) return value.timestampValue;
    if ('nullValue' in value) return null;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(firestoreValue);
    if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v]) => [k, firestoreValue(v)]));
    return null;
  };

  const parseFirestoreDocument = (doc) => {
    const out = {};
    Object.entries(doc?.fields || {}).forEach(([key, value]) => { out[key] = firestoreValue(value); });
    out._firestoreName = doc?.name || '';
    out._createTime = doc?.createTime || '';
    out._updateTime = doc?.updateTime || '';
    return out;
  };

  const firebaseGetStudent = async (cedula) => {
    const fb = config.FIREBASE;
    if (!fb?.projectId || !fb?.apiKey || !fb?.studentCollection) throw new Error('FIREBASE_NOT_CONFIGURED');
    const clean = String(cedula || '').trim();
    if (!/^\d{10}$/.test(clean)) throw new Error('INVALID_CEDULA');
    const database = encodeURIComponent(fb.databaseId || '(default)');
    const collection = encodeURIComponent(fb.studentCollection);
    const documentId = encodeURIComponent(clean);
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(fb.projectId)}/databases/${database}/documents/${collection}/${documentId}?key=${encodeURIComponent(fb.apiKey)}`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (response.status === 404) return null;
    if (response.status === 403 || response.status === 401) throw new Error('FIREBASE_PERMISSION_DENIED');
    if (!response.ok) throw new Error(`FIREBASE_HTTP_${response.status}`);
    const data = parseFirestoreDocument(await response.json());
    if (!data || data.eliminado === true) return null;
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

  window.Revisor = { $, $$, api, firebaseGetStudent, parseFirestoreDocument, toast, modal, formatDate, riskClass, config, expireAdminSession };
})();