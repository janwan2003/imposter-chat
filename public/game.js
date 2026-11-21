// Game page: renders the state for this player and keeps it live with adaptive polling.
(() => {
  const app = document.getElementById('app');
  const gameId = location.pathname.split('/')[2] || '';
  const link = location.origin + '/g/' + gameId;
  const esc = OC.esc;
  let S = null; // last full state
  let clockSkew = 0; // server now - local now, seconds
  let delay = 2500;
  let timer = null;
  let busy = false;
  let cardOpen = false;
  let cardRound = 0;
  let pickedVote = null;
  const drafts = {}; // input values kept across re-renders

  // ---------- data ----------
  async function load(force) {
    clearTimeout(timer);
    try {
      const v = !force && S ? '?v=' + S.version : '';
      const data = await OC.api('games/' + gameId + v, {}, gameId);
      if (data.same) {
        delay = Math.min(Math.round(delay * 1.35), 20000);
      } else {
        delay = 2500;
        clockSkew = data.now - Date.now() / 1000;
        const ident = OC.getId(gameId);
        if (ident && !data.me) OC.clearId(gameId); // removed from the game, or the game was reset
        S = data;
        render();
      }
    } catch (e) {
      if (e.status === 404) return renderMissing(e.message);
      delay = Math.min(delay * 2, 30000);
    }
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    if (document.visibilityState === 'hidden') return;
    timer = setTimeout(() => load(false), delay);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { delay = 2500; load(false); } else clearTimeout(timer);
  });
  // Deadlines need a re-render to update the countdown text.
  setInterval(() => { const el = document.querySelector('[data-deadline]'); if (el) el.textContent = countdown(Number(el.dataset.deadline)); }, 15000);

  async function act(path, body, btn) {
    if (busy) return;
    busy = true;
    const label = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
    const errEl = document.getElementById('err');
    if (errEl) errEl.textContent = '';
    try {
      await OC.api('games/' + gameId + '/' + path, { method: 'POST', body }, gameId);
      busy = false;
      await load(true);
      return true;
    } catch (e) {
      busy = false;
      if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
      const el = document.getElementById('err');
      if (el) el.textContent = e.message; else OC.toast(e.message);
      if (e.status === 403 || e.status === 409) load(true);
      return false;
    }
  }

  // ---------- helpers ----------
  const nameOf = (id) => (S.members.find((m) => m.id === id) || (S.round && S.round.players.find((p) => p.id === id)) || S.scores.find((p) => p.id === id) || { name: 'Someone' }).name;
  const isHost = () => S.me && S.me.id === S.hostId;
  function countdown(deadline) {
    const left = Math.max(0, Math.round(deadline - (Date.now() / 1000 + clockSkew)));
    if (left <= 60) return 'Moving on any moment';
    const h = Math.floor(left / 3600);
    const m = Math.round((left % 3600) / 60);
    return 'Moves on in ' + (h ? `${h}h ${m}m` : `${m} min`) + ' if someone is missing';
  }
  function chips(list, doneIds = [], { kick = false } = {}) {
    return '<ul class="chips">' + list.map((p) => {
      const done = doneIds.includes(p.id);
      const me = S.me && p.id === S.me.id;
      const x = kick && isHost() && !me ? `<button class="x" data-kick="${p.id}" aria-label="Remove ${esc(p.name)}" title="Remove">×</button>` : '';
      return `<li class="chip${done ? ' done' : ''}${me ? ' me' : ''}">${OC.avatar(p.id, p.name)}${esc(p.name)}${me ? ' (you)' : ''}${done ? ' ✓' : ''}${p.id === S.hostId ? ' <span class="muted small">host</span>' : ''}${x}</li>`;
    }).join('') + '</ul>';
  }
  function progress(n, of, label) {
    const pct = of ? Math.round((100 * n) / of) : 0;
    return `<div class="progress" aria-hidden="true"><i style="width:${pct}%"></i></div><p class="small muted">${n} of ${of} ${label}</p>`;
  }
  function header(pill) {
    return `<div class="game-head"><div><p class="muted small" style="margin:0">Oddclue game</p><h1>${esc(S.name)}</h1></div>${pill || ''}</div>`;
  }
  function inviteCard(compact) {
    const text = `Play the imposter word game with me: ${S.name}`;
    const wa = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + link);
    return `<section class="card${compact ? ' flat' : ''}">
      <h2>${compact ? 'Invite more people' : 'Invite your group'}</h2>
      <p class="muted small">${compact ? 'People who join now are dealt into the next round.' : 'Send this link to your group chat. Anyone who opens it can join with a nickname, no app or sign-up.'}</p>
      <input type="text" readonly value="${esc(link)}" aria-label="Game link" id="linkbox">
      <div class="row" style="margin-top:10px">
        <button class="btn${compact ? ' ghost' : ''}" data-share>Share link</button>
        <a class="btn line" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>
      </div>
    </section>`;
  }
  function scoresCard() {
    if (!S.scores.some((s) => s.points > 0) && !(S.round && S.round.state === 'reveal')) return '';
    const plus = S.round && S.round.state === 'reveal' ? new Map(S.round.reveal.points.map((p) => [p.id, p.points])) : new Map();
    return `<section class="card"><h2>Scores</h2><ol class="scores">${S.scores.map((s) => `<li>${OC.avatar(s.id, s.name)}<span class="nm">${esc(s.name)}${s.here ? '' : ' <span class="muted small">(left)</span>'}</span>${plus.get(s.id) ? `<span class="plus">+${plus.get(s.id)}</span>` : ''}<span class="pt">${s.points}</span></li>`).join('')}</ol></section>`;
  }
  function footerLinks() {
    return S.me ? `<p class="center small" style="margin-top:22px"><a href="/">Start a game in another chat</a> · <button class="btn small line" data-leave style="display:inline-flex">Leave game</button></p>` : '';
  }

  // ---------- views ----------
  function renderMissing(msg) {
    app.innerHTML = `<section class="card center"><h1 style="font-size:1.6rem">Game not found</h1><p class="muted">${esc(msg)}</p><a class="btn" href="/">Start a new game</a></section>`;
  }

  function joinView() {
    const going = S.round && S.round.state !== 'reveal';
    return header() + `<section class="card">
      <h2>Join ${esc(S.name)}</h2>
      <p class="muted">Everyone gets the same secret word, except one imposter. Give a clue, then vote out the bluffer.</p>
      ${S.members.length ? `<p class="small muted" style="margin-bottom:0">${S.members.length} ${S.members.length === 1 ? 'player' : 'players'} so far</p>${chips(S.members)}` : ''}
      ${going ? `<p class="pill" style="margin:10px 0">Round ${S.round.no} is under way. You'll be dealt into the next one.</p>` : ''}
      <form id="join" autocomplete="off" style="margin-top:14px">
        <div class="field"><label for="nick">Your nickname</label><input id="nick" type="text" maxlength="20" required placeholder="e.g. Sam" enterkeyhint="go"></div>
        <button class="btn" type="submit">Join the game</button>
        <p id="err" class="error" role="alert"></p>
      </form>
    </section>` + scoresCard();
  }

  function lobbyView() {
    const need = Math.max(0, S.minPlayers - S.members.length);
    const host = S.members.find((m) => m.id === S.hostId);
    let action;
    if (isHost()) {
      action = `<button class="btn" data-deal ${need ? 'disabled' : ''}>${need ? `Waiting for ${need} more ${need === 1 ? 'player' : 'players'}` : `Deal the cards (${S.members.length} players)`}</button>
        <p class="muted small" style="margin-top:8px">Deal once everyone's in. Anyone who joins later plays from the next round.</p>`;
    } else {
      action = `<p class="pill">Waiting for ${esc(host ? host.name : 'the host')} to deal${need ? `, and ${need} more ${need === 1 ? 'player' : 'players'}` : ''}</p>`;
    }
    return header('<span class="pill">Lobby</span>') + inviteCard(false) + `<section class="card">
      <h2>Players</h2>${chips(S.members, [], { kick: true })}<div style="margin-top:14px">${action}</div>
      <p id="err" class="error" role="alert"></p>
    </section>`;
  }

  function secretCard(r, small) {
    if (cardRound !== r.no) { cardRound = r.no; cardOpen = false; pickedVote = null; }
    const imp = r.role === 'imposter';
    if (!cardOpen) {
      return `<button class="secret closed" data-card style="${small ? 'min-height:120px' : ''}"><div><div class="k">Round ${r.no} · your card</div><div class="w" style="font-size:1.6rem">Tap to see it</div><div class="h">Keep your screen away from others</div></div></button>`;
    }
    if (imp) {
      return `<button class="secret imp" data-card style="${small ? 'min-height:120px' : ''}"><div><div class="k">You are the</div><div class="w">Imposter</div><div class="h">${r.category ? `Category: <b>${esc(r.category)}</b> · ` : ''}Bluff! Tap to hide</div></div></button>`;
    }
    return `<button class="secret" data-card style="${small ? 'min-height:120px' : ''}"><div><div class="k">${esc(r.category)} · the secret word is</div><div class="w">${esc(r.word)}</div><div class="h">One player doesn't know it. Tap to hide</div></div></button>`;
  }

  function deadlineLine(r) {
    return r.deadline ? `<p class="small muted" data-deadline="${r.deadline}">${countdown(r.deadline)}</p>` : '';
  }

  function clueView() {
    const r = S.round;
    const pill = `<span class="pill">Round ${r.no} · clues</span>`;
    const live = r.players.filter((p) => !p.left);
    const status = `<section class="card"><h2>Who's written a clue</h2>${chips(live, r.clued)}${progress(r.clued.filter((id) => live.some((p) => p.id === id)).length, live.length, 'clues in. They are revealed together.')}${deadlineLine(r)}
      ${isHost() ? `<button class="btn small line" data-advance ${r.clued.length < 2 ? 'disabled' : ''}>Reveal the clues now</button>` : ''}</section>`;
    if (!r.inRound) {
      return header(pill) + `<section class="card"><h2>Round ${r.no} is under way</h2><p class="muted">You joined after the cards were dealt, so you're in from the next round. The page updates by itself.</p></section>` + status + inviteCard(true) + scoresCard();
    }
    const imp = r.role === 'imposter';
    const val = drafts.clue ?? r.myClue ?? '';
    const tip = imp
      ? 'You don\'t know the word. Write a clue that fits the category so nobody notices.'
      : 'Prove you know the word, but don\'t make it easy for the imposter. One to three words.';
    return header(pill) + secretCard(r) + `<section class="card" style="margin-top:16px">
      <form id="clueform" autocomplete="off">
        <label for="clue">${r.myClue ? 'Your clue (you can change it until the reveal)' : 'Your clue'}</label>
        <p class="muted small">${tip}</p>
        <div class="row"><input id="clue" type="text" maxlength="32" value="${esc(val)}" placeholder="one word" enterkeyhint="send" autocapitalize="off"><button class="btn" type="submit" style="flex:0 0 auto;width:auto">${r.myClue ? 'Update' : 'Lock in'}</button></div>
        <p id="err" class="error" role="alert"></p>
      </form>
      ${r.myClue ? `<p class="pill ok">✓ Locked in: “${esc(r.myClue)}”</p>` : ''}
    </section>` + status + inviteCard(true) + scoresCard() + footerLinks();
  }

  function voteView() {
    const r = S.round;
    const pill = `<span class="pill imp">Round ${r.no} · vote</span>`;
    const live = r.players.filter((p) => !p.left);
    const clueOf = new Map(r.clues.map((c) => [c.id, c.text]));
    const order = [...r.clues.map((c) => c.id), ...r.players.filter((p) => !clueOf.has(p.id)).map((p) => p.id)];
    const canVote = r.inRound;
    const sel = pickedVote ?? r.myVote;
    const list = `<ul class="clues">${order.map((id) => {
      const self = S.me && id === S.me.id;
      const said = clueOf.has(id) ? `“${esc(clueOf.get(id))}”` : '<span class="muted small">no clue</span>';
      const inner = `${OC.avatar(id, nameOf(id))}<span class="who">${esc(nameOf(id))}${self ? ' (you)' : ''}</span><span class="said">${said}</span>`;
      return canVote ? `<li><button class="clue${sel === id ? ' picked' : ''}" data-pick="${id}" ${self ? 'disabled' : ''} aria-pressed="${sel === id}">${inner}</button></li>` : `<li><div class="clue">${inner}</div></li>`;
    }).join('')}</ul>`;
    const status = `<section class="card"><h2>Who's voted</h2>${chips(live, r.voted)}${progress(r.voted.filter((id) => live.some((p) => p.id === id)).length, live.length, 'votes in')}${deadlineLine(r)}
      ${isHost() ? `<button class="btn small line" data-advance ${r.voted.length < 1 ? 'disabled' : ''}>Reveal the imposter now</button>` : ''}</section>`;
    if (!canVote) {
      return header(pill) + `<section class="card"><h2>The clues are in</h2><p class="muted">You're in from the next round. Here's what everyone said:</p>${list}</section>` + status + scoresCard();
    }
    const imp = r.role === 'imposter';
    const guess = drafts.guess ?? r.myGuess ?? '';
    return header(pill) + `<section class="card">
      <h2>Who is the imposter?</h2>
      <p class="muted small">${imp ? 'Blend in: vote for someone else. Then guess the word from the clues for 2 bonus points.' : 'Tap the player whose clue gives them away.'}</p>
      ${list}
      <form id="voteform" autocomplete="off" style="margin-top:14px">
        ${imp ? `<div class="field"><label for="guess">Your guess of the secret word</label><input id="guess" type="text" maxlength="40" value="${esc(guess)}" placeholder="What's everyone describing?" autocapitalize="off"></div>` : ''}
        <button class="btn" type="submit" ${sel ? '' : 'disabled'}>${sel ? (r.myVote === sel && !imp ? `You voted ${esc(nameOf(sel))}` : `Vote ${esc(nameOf(sel))}`) : 'Pick a player'}</button>
        <p id="err" class="error" role="alert"></p>
      </form>
      ${r.myVote ? `<p class="pill ok" style="margin-top:10px">✓ Your vote: ${esc(nameOf(r.myVote))}. You can change it until the reveal.</p>` : ''}
    </section>` + secretCard(r, true) + '<div style="height:16px"></div>' + status + scoresCard() + footerLinks();
  }

  function revealView() {
    const r = S.round;
    const v = r.reveal;
    const impClue = (r.clues.find((c) => c.id === v.imposterId) || {}).text;
    const wasMe = S.me && S.me.id === v.imposterId;
    const head = {
      caught: `${esc(v.imposterName)} was the imposter, and got caught!`,
      'caught-guessed': `${esc(v.imposterName)} got caught, but guessed the word!`,
      'escaped-guessed': `${esc(v.imposterName)} got away and guessed the word!`,
      escaped: `${esc(v.imposterName)} was the imposter, and got away with it!`,
    }[v.outcome];
    const byTarget = new Map();
    for (const x of v.votes) { if (!byTarget.has(x.for)) byTarget.set(x.for, []); byTarget.get(x.for).push(x.byName); }
    const clueOf = new Map(r.clues.map((c) => [c.id, c.text]));
    const rows = v.counts.map((c) => `<li><div class="clue${c.id === v.imposterId ? ' is-imp' : ''}">${OC.avatar(c.id, c.name)}<span class="who">${esc(c.name)}${c.id === v.imposterId ? ' <span class="pill imp">imposter</span>' : ''}<br><span class="small muted">${clueOf.has(c.id) ? `said “${esc(clueOf.get(c.id))}”` : 'no clue'}${byTarget.get(c.id) ? ` · votes from ${byTarget.get(c.id).map(esc).join(', ')}` : ''}</span></span><span class="n">${c.votes}</span></div></li>`).join('');
    const guessLine = v.guess ? `${esc(v.imposterName)} guessed “${esc(v.guess)}”: ${v.guessed ? '<b style="color:var(--ok)">right!</b>' : 'wrong.'}` : `${esc(v.imposterName)} didn't guess the word.`;
    const me = S.me && S.members.some((m) => m.id === S.me.id);
    return header(`<span class="pill ok">Round ${r.no} · reveal</span>`) + `<section class="card reveal">
      <p class="muted small" style="margin:0">${wasMe ? 'You were the imposter' : 'The imposter was…'}</p>
      <div class="big">${head}</div>
      <p>The word was <span class="word">${esc(r.word)}</span> <span class="muted small">(${esc(r.category)})</span></p>
      <p class="muted">${impClue ? `Their clue: “${esc(impClue)}” · ` : ''}${v.againstImposter ?? v.counts.find((c) => c.id === v.imposterId)?.votes ?? 0} of ${v.votes.length} votes on them. ${guessLine}</p>
      <div class="row" style="margin-top:14px">
        ${me ? `<button class="btn" data-deal>Deal next round</button>` : ''}
        <button class="btn ghost" data-card-share>Share result</button>
      </div>
      <p id="err" class="error" role="alert"></p>
    </section>
    <section class="card"><h2>The votes</h2><ul class="clues">${rows}</ul></section>` + scoresCard() + `
    <section class="card center flat"><h2>Got another group chat?</h2><p class="muted">Start a game there too. It takes ten seconds.</p><a class="btn ghost" href="/">Start a game in another chat</a></section>` + (me ? inviteCard(true) : '') + footerLinks();
  }

  // ---------- render ----------
  function render() {
    const focus = document.activeElement && document.activeElement.id;
    const sel = focus && document.activeElement.selectionStart;
    let html;
    if (!S.me) html = joinView();
    else if (!S.round) html = lobbyView();
    else if (S.round.state === 'clue') html = clueView();
    else if (S.round.state === 'vote') html = voteView();
    else html = revealView();
    app.innerHTML = html;
    document.title = (S.round && S.round.state !== 'reveal' ? `Round ${S.round.no} · ` : '') + S.name + ' · Oddclue';
    if (focus) {
      const el = document.getElementById(focus);
      if (el) { el.focus(); try { el.setSelectionRange(sel, sel); } catch {} }
    }
  }

  // ---------- events ----------
  app.addEventListener('input', (e) => { if (e.target.id === 'clue' || e.target.id === 'guess') drafts[e.target.id] = e.target.value; });
  app.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button[type=submit]');
    if (f.id === 'join') {
      const nick = f.querySelector('#nick').value.trim();
      if (!nick) { document.getElementById('err').textContent = 'Pick a nickname first.'; return; }
      btn.disabled = true;
      try {
        const res = await OC.api('games/' + gameId + '/join', { method: 'POST', body: { nick } });
        OC.setId(gameId, { token: res.token, memberId: res.memberId });
        try { localStorage.setItem('oddclue:nick', nick); } catch {}
        await load(true);
      } catch (e2) {
        btn.disabled = false;
        document.getElementById('err').textContent = e2.message;
      }
    } else if (f.id === 'clueform') {
      const text = f.querySelector('#clue').value.trim();
      if (!text) { document.getElementById('err').textContent = 'Write a clue first.'; return; }
      if (await act('clue', { text }, btn)) delete drafts.clue;
    } else if (f.id === 'voteform') {
      const target = pickedVote ?? S.round.myVote;
      const g = f.querySelector('#guess');
      if (await act('vote', { target, guess: g ? g.value.trim() : undefined }, btn)) { pickedVote = null; delete drafts.guess; }
    }
  });
  app.addEventListener('click', async (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.hasAttribute('data-card')) { cardOpen = !cardOpen; render(); }
    else if (t.dataset.pick) { pickedVote = Number(t.dataset.pick); render(); }
    else if (t.hasAttribute('data-deal')) act('deal', { after: S.roundNo }, t);
    else if (t.hasAttribute('data-advance')) act('advance', {}, t);
    else if (t.dataset.kick) {
      if (confirm(`Remove ${nameOf(Number(t.dataset.kick))} from the game?`)) act('kick', { memberId: Number(t.dataset.kick) }, t);
    } else if (t.hasAttribute('data-leave')) {
      if (confirm('Leave this game? Your scores stay, but you will need to join again to play.')) {
        if (await act('leave', {}, t)) { OC.clearId(gameId); load(true); }
      }
    } else if (t.hasAttribute('data-share')) {
      const text = `Play the imposter word game with me: ${S.name}`;
      if (navigator.share) {
        try { await navigator.share({ title: 'Oddclue', text, url: link }); } catch {}
      } else {
        try { await navigator.clipboard.writeText(link); OC.toast('Link copied'); } catch { document.getElementById('linkbox').select(); }
      }
    } else if (t.hasAttribute('data-card-share')) {
      OddShare.share(S);
    }
  });

  if (!/^[A-Za-z0-9]{6,16}$/.test(gameId)) renderMissing('This link looks broken.');
  else load(true);
})();
