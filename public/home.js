// Landing page: load packs, create a game, go to its page.
(async () => {
  const form = document.getElementById('create');
  const err = document.getElementById('err');
  const box = document.getElementById('packs');
  const nick = document.getElementById('nick');
  try {
    const last = localStorage.getItem('oddclue:nick');
    if (last) nick.value = last;
  } catch {}
  try {
    const { packs, defaults } = await OC.api('packs');
    box.innerHTML = packs.map((p) => `<label class="pack"><input type="checkbox" name="pack" value="${OC.esc(p.id)}" ${defaults.includes(p.id) ? 'checked' : ''}><span>${p.emoji} ${OC.esc(p.name)}</span></label>`).join('');
  } catch {
    box.innerHTML = '<span class="muted small">Could not load packs; the default mix will be used.</span>';
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (!nick.value.trim()) { err.textContent = 'Pick a nickname first.'; nick.focus(); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Creating…';
    try {
      const packs = [...form.querySelectorAll('input[name=pack]:checked')].map((i) => i.value);
      const res = await OC.api('games', {
        method: 'POST',
        body: {
          nick: nick.value,
          name: document.getElementById('gname').value,
          packs,
          limitSecs: Number(document.getElementById('limit').value),
          showCategory: document.getElementById('showcat').checked,
        },
      });
      OC.setId(res.id, { token: res.token, memberId: res.memberId });
      try { localStorage.setItem('oddclue:nick', nick.value.trim()); } catch {}
      location.href = '/g/' + res.id;
    } catch (e2) {
      err.textContent = e2.message;
      btn.disabled = false;
      btn.textContent = 'Create game';
    }
  });
})();
