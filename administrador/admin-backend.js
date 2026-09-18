(() => {
  const config = window.REVISOR_CONFIG || {};
  const form = document.getElementById('admin-login');
  if (!form || !config.API_BASE_URL) return;
  const apiBase = String(config.API_BASE_URL).replace(/\/$/,'');
  const loginMsg = document.getElementById('admin-login-msg');

  const reloginNotice = sessionStorage.getItem('revisor_relogin_notice');
  if (reloginNotice && loginMsg) {
    loginMsg.textContent = reloginNotice;
    sessionStorage.removeItem('revisor_relogin_notice');
  }

  const forceReauth = (message = 'Tu sesión administrativa expiró. Ingresa nuevamente.') => {
    sessionStorage.removeItem('revisor_token');
    sessionStorage.removeItem('revisor_admin_auth');
    sessionStorage.setItem('revisor_relogin_notice', message);
    location.reload();
  };

  // API administrativa: si el backend devuelve 401, obliga a crear una sesión nueva.
  window.Revisor.api = async (path, options = {}) => {
    const token = sessionStorage.getItem('revisor_token');
    const headers = new Headers(options.headers || {});
    if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${apiBase}${path}`, {...options, headers});
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && path.startsWith('/admin/')) {
      forceReauth('Tu sesión administrativa ya no es válida. Ingresa nuevamente.');
      throw new Error('Sesión administrativa no válida.');
    }
    if (!response.ok) throw new Error(data.message || `HTTP_${response.status}`);
    return data;
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const usuario = document.getElementById('admin-user')?.value.trim() || '';
    const pin = document.getElementById('admin-pin')?.value.trim() || '';
    const msg = document.getElementById('admin-login-msg');
    if (msg) msg.textContent = 'Validando credenciales…';
    try {
      const response = await fetch(`${apiBase}/admin/login`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({usuario,pin})
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok || !data.token) throw new Error(data.message || `HTTP ${response.status}`);
      sessionStorage.setItem('revisor_token',data.token);
      sessionStorage.setItem('revisor_admin_auth','1');
      sessionStorage.removeItem('revisor_relogin_notice');
      if (msg) msg.textContent = '';
      location.reload();
    } catch (err) {
      if (msg) msg.textContent = err.message || 'No fue posible validar el acceso.';
    }
  }, true);

  document.getElementById('logout')?.addEventListener('click',()=>{
    sessionStorage.removeItem('revisor_token');
    sessionStorage.removeItem('revisor_admin_auth');
    sessionStorage.removeItem('revisor_relogin_notice');
  },true);

  const uploadedKeys = new Set();
  async function uploadSessionKeys(models) {
    const token = sessionStorage.getItem('revisor_token');
    if (!token) return;
    for (const m of models) {
      const key = sessionStorage.getItem(`revisor_key_${m.id}`);
      if (!key || uploadedKeys.has(m.id) || m.keyConfigured) continue;
      const response = await fetch(`${apiBase}/admin/models/${encodeURIComponent(m.id)}`, {
        method:'PUT',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body:JSON.stringify({apiKey:key})
      }).catch(()=>null);
      if (response?.status === 401) return forceReauth();
      if (response?.ok) uploadedKeys.add(m.id);
    }
  }

  async function refreshModels() {
    if (sessionStorage.getItem('revisor_admin_auth') !== '1') return;
    const token = sessionStorage.getItem('revisor_token');
    if (!token) return forceReauth('Necesitas volver a ingresar para continuar administrando las IA.');
    try {
      const response = await fetch(`${apiBase}/admin/models`, {headers:{'Authorization':`Bearer ${token}`}});
      if (response.status === 401) return forceReauth('La sesión anterior ya no es válida. Ingresa nuevamente.');
      if (!response.ok) return;
      const serverModels = await response.json();
      if (!Array.isArray(serverModels)) return;
      localStorage.setItem('revisor_models', JSON.stringify(serverModels));
      window.dispatchEvent(new CustomEvent('revisor-models-updated',{detail:serverModels}));
      if (window.AdminView?.models) {
        const q=document.getElementById('model-search')?.value||'';
        const st=document.getElementById('model-status')?.value||'';
        window.AdminView.models(serverModels,q,st);
      }
      await uploadSessionKeys(serverModels);
    } catch (err) {
      console.warn('No se pudo actualizar el estado real de las IA:', err);
    }
  }

  async function refreshJobs() {
    if (sessionStorage.getItem('revisor_admin_auth') !== '1') return;
    const token = sessionStorage.getItem('revisor_token');
    if (!token) return;
    try {
      const response = await fetch(`${apiBase}/admin/jobs`, {headers:{'Authorization':`Bearer ${token}`}});
      if (response.status === 401) return forceReauth('La sesión anterior ya no es válida. Ingresa nuevamente.');
      if (!response.ok) return;
      const jobs = await response.json();
      if (Array.isArray(jobs)) window.dispatchEvent(new CustomEvent('revisor-jobs-updated',{detail:jobs}));
    } catch (err) {
      console.warn('No se pudo actualizar el historial centralizado:', err);
    }
  }

  const refreshAll=async()=>{await Promise.all([refreshModels(),refreshJobs()])};
  refreshAll();
  setInterval(refreshAll, 5000);
})();
