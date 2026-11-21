// Shared helpers: API calls, per-game identity in localStorage, small UI bits.
const OC = (() => {
  const key = (id) => 'oddclue:' + id;
  const getId = (id) => {
    try { return JSON.parse(localStorage.getItem(key(id)) || 'null'); } catch { return null; }
  };
  const setId = (id, v) => { try { localStorage.setItem(key(id), JSON.stringify(v)); } catch {} };
  const clearId = (id) => { try { localStorage.removeItem(key(id)); } catch {} };
  async function api(path, opts = {}, gameId) {
    const headers = { 'content-type': 'application/json' };
    const ident = gameId && getId(gameId);
    if (ident) headers['x-token'] = ident.token;
    const res = await fetch('/api/' + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const e = new Error(data.error || 'Something went wrong. Try again.');
      e.status = res.status;
      throw e;
    }
    return data;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#5b3df5', '#e5484d', '#0f9d7a', '#f08c00', '#2f7de1', '#c2255c', '#7048e8', '#2b8a3e', '#d9480f', '#1098ad'];
  const color = (id) => COLORS[Math.abs(Number(id) || 0) % COLORS.length];
  const avatar = (id, name) => `<span class="av" style="background:${color(id)}" aria-hidden="true">${esc((name || '?').trim().charAt(0).toUpperCase())}</span>`;
  let toastTimer;
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
  }
  return { api, getId, setId, clearId, esc, avatar, color, toast };
})();
