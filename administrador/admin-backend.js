(() => {
  const config = window.REVISOR_CONFIG || {};
  const form = document.getElementById('admin-login');
  if (!form || !config.API_BASE_URL) return;

  const apiBase = String(config.API_BASE_URL).replace(/\/$/,'');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const usuario = document.getElementById('admin-user')?.value.trim() || '';
    const pin = document.getElementById('admin-pin')?.value.trim() || '';
    const msg = document.getElementById('admin-login-msg');
    if (msg) msg.textContent = 'Validando credenciales…';
    try {
      const response = await fetch(`${apiBase}/admin/login`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({usuario,pin})
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok || !data.token) throw new Error(data.message || `HTTP ${response.status}`);
      sessionStorage.setItem('revisor_token',data.token);
      sessionStorage.setItem('revisor_admin_auth','1');
      if (msg) msg.textContent = '';
      location.reload();
    } catch (err) {
      if (msg) msg.textContent = err.message || 'No fue posible validar el acceso.';
    }
  }, true);

  document.getElementById('logout')?.addEventListener('click',()=>{
    sessionStorage.removeItem('revisor_token');
    sessionStorage.removeItem('revisor_admin_auth');
  },true);

  async function syncModels() {
    if (sessionStorage.getItem('revisor_admin_auth') !== '1') return;
    const token = sessionStorage.getItem('revisor_token');
    if (!token) {
      sessionStorage.removeItem('revisor_admin_auth');
      return;
    }
    try {
      const local = JSON.parse(localStorage.getItem('revisor_models') || '[]');
      if (!Array.isArray(local) || !local.length) return;
      const sanitized = local.map(m => ({
        id:m.id,name:m.name,provider:m.provider,model:m.model,endpoint:m.endpoint,
        priority:m.priority,weight:m.weight,state:m.state,specialty:m.specialty,
        timeout:m.timeout,temperature:m.temperature,tokens:m.tokens,
        reviewType:m.reviewType,prompt:m.prompt,lastTest:m.lastTest,level:m.level
      }));
      const response = await fetch(`${apiBase}/admin/models/sync`, {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body:JSON.stringify({models:sanitized})
      });
      if (response.status === 401) {
        sessionStorage.removeItem('revisor_token');
        sessionStorage.removeItem('revisor_admin_auth');
        return;
      }
      const serverModels = await response.json().catch(()=>null);
      if (response.ok && Array.isArray(serverModels)) {
        const merged = local.map(m => {
          const s = serverModels.find(x=>x.id===m.id);
          return s ? {...m,...s} : m;
        });
        localStorage.setItem('revisor_models',JSON.stringify(merged));
      }

      // Sube al backend las claves que ya estaban guardadas en esta sesión del navegador.
      // El servidor no las devuelve y no se escriben en GitHub.
      await Promise.all(local.map(async m => {
        const key = sessionStorage.getItem(`revisor_key_${m.id}`);
        if (!key) return;
        await fetch(`${apiBase}/admin/models/${encodeURIComponent(m.id)}`, {
          method:'PUT',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
          body:JSON.stringify({apiKey:key})
        }).catch(()=>null);
      }));
    } catch (err) {
      console.warn('No se pudo sincronizar el catálogo con el backend:',err);
    }
  }

  syncModels();
})();
