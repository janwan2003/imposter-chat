import { PACKS, DEFAULT_PACKS } from './words.js';
import {
  MIN_PLAYERS, MAX_PLAYERS, LIMITS as TIME_LIMITS, clueProblem, pickImposter, pickWord, scoreRound, totals, nextState, shuffleSeeded,
} from './engine.js';

// Per IP per hour. Generous because a school or a mobile carrier can put a whole class behind one IP.
const RATE = {
  create: [60, 3600], // new games
  join: [300, 3600], // joins
  write: [3000, 3600], // clues, votes, deals
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const err = (status, message) => json({ error: message }, status);
const now = () => Math.floor(Date.now() / 1000);

function randomId(len = 8) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}
const rand = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
};

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function clean(v, max) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function rateLimited(env, request, action) {
  const [max, windowSec] = RATE[action];
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const t = now();
  const row = await env.DB.prepare(
    `INSERT INTO rate (k, n, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(k) DO UPDATE SET
       n = CASE WHEN reset_at < ?3 THEN 1 ELSE n + 1 END,
       reset_at = CASE WHEN reset_at < ?3 THEN ?2 ELSE reset_at END
     RETURNING n`
  ).bind(action + ':' + ip, t + windowSec, t).first();
  return row && row.n > max;
}

// Games idle for 30 days are deleted with everything in them. Runs on game creation.
async function cleanup(env) {
  const t = now();
  const old = t - 30 * 86400;
  const sub = 'SELECT id FROM games WHERE active_at < ?1';
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM votes WHERE game_id IN (${sub})`).bind(old),
    env.DB.prepare(`DELETE FROM clues WHERE game_id IN (${sub})`).bind(old),
    env.DB.prepare(`DELETE FROM rounds WHERE game_id IN (${sub})`).bind(old),
    env.DB.prepare(`DELETE FROM members WHERE game_id IN (${sub})`).bind(old),
    env.DB.prepare('DELETE FROM games WHERE active_at < ?1').bind(old),
    env.DB.prepare('DELETE FROM rate WHERE reset_at < ?1').bind(t),
  ]);
}

async function body(request) {
  try {
    const text = await request.text();
    if (text.length > 4000) return null;
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

// Adds one to today's counter for 'games', 'joins' or 'rounds'. Our own test runs send x-test: 1 and add 0.
const count = (env, col, request) => env.DB.prepare(`INSERT INTO daily (day, ${col}) VALUES (?1, ?2) ON CONFLICT(day) DO UPDATE SET ${col} = ${col} + ?2`)
  .bind(new Date().toISOString().slice(0, 10), request.headers.get('x-test') === '1' ? 0 : 1);

const validId = (id) => /^[A-Za-z0-9]{6,16}$/.test(id || '');

async function loadGame(env, id) {
  if (!validId(id)) return null;
  return env.DB.prepare('SELECT * FROM games WHERE id = ?1').bind(id).first();
}

async function me(env, request, gameId) {
  const token = request.headers.get('x-token');
  if (!token || token.length > 100) return null;
  const hash = await sha256(token);
  return env.DB.prepare('SELECT id, name FROM members WHERE token_hash = ?1 AND game_id = ?2 AND left_at IS NULL').bind(hash, gameId).first();
}

async function activeMembers(env, gameId) {
  const { results } = await env.DB.prepare('SELECT id, name, created_at FROM members WHERE game_id = ?1 AND left_at IS NULL ORDER BY id').bind(gameId).all();
  return results;
}

const bump = (env, gameId) => env.DB.prepare('UPDATE games SET version = version + 1, active_at = ?2 WHERE id = ?1').bind(gameId, now());

function parseRound(r) {
  return r && { ...r, players: JSON.parse(r.players) };
}

async function loadRound(env, game) {
  if (!game.round_no) return null;
  return parseRound(await env.DB.prepare('SELECT * FROM rounds WHERE game_id = ?1 AND no = ?2').bind(game.id, game.round_no).first());
}

async function roundActs(env, game, no) {
  const [{ results: clues }, { results: votes }] = await env.DB.batch([
    env.DB.prepare('SELECT member_id, text FROM clues WHERE game_id = ?1 AND no = ?2').bind(game.id, no),
    env.DB.prepare('SELECT voter_id, target_id FROM votes WHERE game_id = ?1 AND no = ?2').bind(game.id, no),
  ]);
  return { clues, votes };
}

// Moves the current round on if everyone has acted or its deadline passed. Returns true if it changed.
async function advanceIfReady(env, game, round, members, force = false) {
  if (!round || round.state === 'reveal') return false;
  const { clues, votes } = await roundActs(env, game, round.no);
  let next = nextState(round, members.map((m) => m.id), clues.map((c) => c.member_id), votes.map((v) => v.voter_id), now());
  if (!next && force) {
    if (round.state === 'clue' && clues.length >= 2) next = 'vote';
    if (round.state === 'vote' && votes.length >= 1) next = 'reveal';
  }
  if (!next) return false;
  const deadline = next === 'vote' && game.limit_secs ? now() + game.limit_secs : null;
  // Guarded on the old state so two simultaneous requests cannot both move it.
  const res = await env.DB.prepare('UPDATE rounds SET state = ?1, deadline = ?2, revealed_at = ?3 WHERE game_id = ?4 AND no = ?5 AND state = ?6')
    .bind(next, deadline, next === 'reveal' ? now() : null, game.id, round.no, round.state).run();
  if (res.meta.changes) await bump(env, game.id).run();
  return true;
}

async function fullState(env, request, game) {
  let members = await activeMembers(env, game.id);
  let round = await loadRound(env, game);
  if (await advanceIfReady(env, game, round, members)) {
    game = await loadGame(env, game.id);
    round = await loadRound(env, game);
  }
  const self = await me(env, request, game.id);
  const { results: everyone } = await env.DB.prepare('SELECT id, name FROM members WHERE game_id = ?1').bind(game.id).all();
  const names = new Map(everyone.map((m) => [m.id, m.name]));
  const nameOf = (id) => names.get(id) || 'Someone';

  // Scoreboard over all revealed rounds.
  const { results: allRounds } = await env.DB.prepare('SELECT no, word, category, imposter_id, players, state, guess FROM rounds WHERE game_id = ?1 ORDER BY no').bind(game.id).all();
  const rounds = allRounds.map(parseRound);
  const { results: allVotes } = await env.DB.prepare('SELECT no, voter_id, target_id FROM votes WHERE game_id = ?1').bind(game.id).all();
  const votesByRound = new Map();
  for (const v of allVotes) {
    if (!votesByRound.has(v.no)) votesByRound.set(v.no, []);
    votesByRound.get(v.no).push(v);
  }
  const sums = totals(rounds, votesByRound);
  const scoreIds = new Set([...members.map((m) => m.id), ...sums.keys()]);
  const scores = [...scoreIds].map((id) => ({ id, name: nameOf(id), points: sums.get(id) || 0, here: members.some((m) => m.id === id) }))
    .sort((a, b) => b.points - a.points || a.id - b.id);

  const out = {
    id: game.id,
    name: game.name,
    version: game.version,
    hostId: game.host_id,
    packs: JSON.parse(game.packs),
    showCategory: !!game.show_category,
    limitSecs: game.limit_secs,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    members: members.map((m) => ({ id: m.id, name: m.name })),
    me: self ? { id: self.id, name: self.name } : null,
    scores,
    roundNo: game.round_no,
    now: now(),
    round: null,
  };
  if (!round) return out;

  const { clues, votes } = await roundActs(env, game, round.no);
  const inRound = !!self && round.players.includes(self.id);
  const isImp = inRound && self.id === round.imposter_id;
  const r = {
    no: round.no,
    state: round.state,
    deadline: round.deadline,
    players: round.players.map((id) => ({ id, name: nameOf(id), left: !members.some((m) => m.id === id) })),
    clued: clues.map((c) => c.member_id),
    voted: votes.map((v) => v.voter_id),
    inRound,
    role: inRound ? (isImp ? 'imposter' : 'crew') : null,
    category: inRound && (!isImp || game.show_category) ? round.category : null,
    word: inRound && !isImp ? round.word : null,
    myClue: self ? (clues.find((c) => c.member_id === self.id) || {}).text || null : null,
    myVote: self ? (votes.find((v) => v.voter_id === self.id) || {}).target_id || null : null,
    clues: null,
    reveal: null,
  };
  if (round.state !== 'clue') {
    r.clues = shuffleSeeded(clues, game.id + ':' + round.no).map((c) => ({ id: c.member_id, name: nameOf(c.member_id), text: c.text }));
  }
  if (isImp && round.state !== 'clue') r.myGuess = round.guess;
  if (round.state === 'reveal') {
    const s = scoreRound(round, votes);
    r.word = round.word;
    r.category = round.category;
    r.reveal = {
      imposterId: round.imposter_id,
      imposterName: nameOf(round.imposter_id),
      guess: round.guess,
      guessed: s.guessed,
      caught: s.caught,
      againstImposter: s.againstImposter,
      outcome: s.outcome,
      counts: [...s.counts.entries()].map(([id, n]) => ({ id, name: nameOf(id), votes: n })).sort((a, b) => b.votes - a.votes),
      votes: votes.map((v) => ({ by: v.voter_id, byName: nameOf(v.voter_id), for: v.target_id, forName: nameOf(v.target_id) })),
      points: [...s.points.entries()].map(([id, p]) => ({ id, name: nameOf(id), points: p })),
    };
  }
  out.round = r;
  return out;
}

async function deal(env, game, members, request) {
  const players = members.map((m) => m.id).slice(0, MAX_PLAYERS);
  const prev = await loadRound(env, game);
  const { results: used } = await env.DB.prepare('SELECT word FROM rounds WHERE game_id = ?1').bind(game.id).all();
  const pick = pickWord(PACKS, JSON.parse(game.packs), used.map((u) => u.word), rand);
  const imp = pickImposter(players, prev ? prev.imposter_id : null, rand);
  const no = game.round_no + 1;
  const deadline = game.limit_secs ? now() + game.limit_secs : null;
  const res = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO rounds (game_id, no, word, category, imposter_id, players, state, deadline, started_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
      .bind(game.id, no, pick.word, pick.category, imp, JSON.stringify(players), 'clue', deadline, now()),
    env.DB.prepare('UPDATE games SET round_no = ?2, version = version + 1, active_at = ?3 WHERE id = ?1 AND round_no = ?4').bind(game.id, no, now(), game.round_no),
  ]);
  if (res[1].meta.changes > 0) await count(env, 'rounds', request).run();
  return res[1].meta.changes > 0;
}

function packsFrom(input) {
  const ids = Array.isArray(input) ? input.filter((p) => PACKS.some((x) => x.id === p)) : [];
  return ids.length ? [...new Set(ids)] : DEFAULT_PACKS;
}

export async function onRequest({ request, env, params }) {
  const parts = [].concat(params.path || []);
  const method = request.method;
  try {
    // GET /api/packs
    if (parts[0] === 'packs' && method === 'GET') {
      return json({ packs: PACKS.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, count: p.words.length })), defaults: DEFAULT_PACKS });
    }
    // GET /api/stats -> aggregate counts only (per UTC day, plus games currently stored)
    if (parts[0] === 'stats' && method === 'GET') {
      const { results: days } = await env.DB.prepare('SELECT day, games, joins, rounds FROM daily ORDER BY day DESC LIMIT 60').all();
      const live = await env.DB.prepare('SELECT COUNT(*) AS games, (SELECT COUNT(*) FROM members WHERE left_at IS NULL) AS players FROM games').first();
      const since = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
      const sum = (from, to) => days.filter((d) => d.day >= from && d.day < to).reduce((a, d) => ({ games: a.games + d.games, joins: a.joins + d.joins, rounds: a.rounds + d.rounds }), { games: 0, joins: 0, rounds: 0 });
      const today = new Date().toISOString().slice(0, 10);
      return json({ last7: sum(since(6), today + 'z'), prev7: sum(since(13), since(6)), stored: live, days, countedSince: days.length ? days[days.length - 1].day : null });
    }
    if (parts[0] !== 'games') return err(404, 'Not found');

    // POST /api/games  { name, nick, packs, showCategory, limitSecs }
    if (parts.length === 1 && method === 'POST') {
      if (await rateLimited(env, request, 'create')) return err(429, 'Too many new games from here. Try again in an hour.');
      const b = await body(request);
      if (!b) return err(400, 'Bad request');
      const nick = clean(b.nick, 20);
      if (!nick) return err(400, 'Pick a nickname.');
      const name = clean(b.name, 40) || `${nick}'s game`;
      const limit = TIME_LIMITS.includes(Number(b.limitSecs)) ? Number(b.limitSecs) : 10800;
      const id = randomId(8);
      const token = randomId(24);
      const t = now();
      await env.DB.prepare('INSERT INTO games (id, name, packs, show_category, limit_secs, created_at, active_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)')
        .bind(id, name, JSON.stringify(packsFrom(b.packs)), b.showCategory === false ? 0 : 1, limit, t).run();
      const m = await env.DB.prepare('INSERT INTO members (game_id, name, token_hash, created_at) VALUES (?1, ?2, ?3, ?4) RETURNING id')
        .bind(id, nick, await sha256(token), t).first();
      await env.DB.batch([env.DB.prepare('UPDATE games SET host_id = ?2 WHERE id = ?1').bind(id, m.id), count(env, 'games', request)]);
      if (rand() < 0.05) await cleanup(env);
      return json({ id, token, memberId: m.id }, 201);
    }

    const game = await loadGame(env, parts[1]);
    if (!game) return err(404, 'This game does not exist or has expired.');
    const action = parts[2] || '';

    // GET /api/games/:id?v=N  -> {same:true} when nothing changed (one row read), else the full state
    if (!action && method === 'GET') {
      const v = Number(new URL(request.url).searchParams.get('v'));
      const round = game.round_no ? await env.DB.prepare('SELECT state, deadline FROM rounds WHERE game_id = ?1 AND no = ?2').bind(game.id, game.round_no).first() : null;
      const due = round && round.state !== 'reveal' && round.deadline && now() >= round.deadline;
      if (v && v === game.version && !due) return json({ same: true, version: game.version });
      return json(await fullState(env, request, game));
    }
    if (method !== 'POST') return err(405, 'Method not allowed');

    if (action === 'join') {
      if (await rateLimited(env, request, 'join')) return err(429, 'Too many joins from here. Try again later.');
      const b = await body(request);
      const nick = clean(b && b.nick, 20);
      if (!nick) return err(400, 'Pick a nickname.');
      const members = await activeMembers(env, game.id);
      if (members.length >= MAX_PLAYERS) return err(409, `This game is full (${MAX_PLAYERS} players).`);
      if (members.some((m) => m.name.toLowerCase() === nick.toLowerCase())) return err(409, 'Someone here already uses that name. Add an initial?');
      const token = randomId(24);
      const m = await env.DB.prepare('INSERT INTO members (game_id, name, token_hash, created_at) VALUES (?1, ?2, ?3, ?4) RETURNING id')
        .bind(game.id, nick, await sha256(token), now()).first();
      await env.DB.batch([bump(env, game.id), count(env, 'joins', request)]);
      return json({ token, memberId: m.id }, 201);
    }

    if (await rateLimited(env, request, 'write')) return err(429, 'Slow down a little.');
    const self = await me(env, request, game.id);
    if (!self) return err(403, 'Join the game first.');
    const members = await activeMembers(env, game.id);
    const round = await loadRound(env, game);
    const b = (await body(request)) || {};

    if (action === 'deal') {
      // The host deals the first round; after a reveal anyone can deal the next one.
      if (round && round.state !== 'reveal') return err(409, 'This round is still going.');
      if (!round && self.id !== game.host_id) return err(403, 'Only the host can deal the first round.');
      if (Number(b.after) !== game.round_no) return json({ ok: true, already: true });
      if (members.length < MIN_PLAYERS) return err(409, `You need at least ${MIN_PLAYERS} players.`);
      await deal(env, game, members, request);
      return json({ ok: true });
    }

    if (action === 'clue') {
      if (!round || round.state !== 'clue') return err(409, 'Clues are closed for this round.');
      if (!round.players.includes(self.id)) return err(403, 'You join from the next round.');
      const text = clean(b.text, 32);
      const problem = self.id === round.imposter_id ? (text ? null : 'Write a clue first.') : clueProblem(text, round.word);
      if (problem) return err(400, problem);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO clues (game_id, no, member_id, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(game_id, no, member_id) DO UPDATE SET text = excluded.text')
          .bind(game.id, round.no, self.id, text, now()),
        bump(env, game.id),
      ]);
      await advanceIfReady(env, game, round, members);
      return json({ ok: true });
    }

    if (action === 'vote') {
      if (!round || round.state !== 'vote') return err(409, 'Voting is not open.');
      if (!round.players.includes(self.id)) return err(403, 'You join from the next round.');
      const target = Number(b.target);
      if (!round.players.includes(target) || !members.some((m) => m.id === target)) return err(400, 'Pick a player who is still in this round.');
      if (target === self.id) return err(400, 'You cannot vote for yourself.');
      const stmts = [
        env.DB.prepare('INSERT INTO votes (game_id, no, voter_id, target_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(game_id, no, voter_id) DO UPDATE SET target_id = excluded.target_id')
          .bind(game.id, round.no, self.id, target),
        bump(env, game.id),
      ];
      if (self.id === round.imposter_id) {
        stmts.push(env.DB.prepare('UPDATE rounds SET guess = ?3 WHERE game_id = ?1 AND no = ?2').bind(game.id, round.no, clean(b.guess, 40) || null));
      }
      await env.DB.batch(stmts);
      await advanceIfReady(env, game, round, members);
      return json({ ok: true });
    }

    if (action === 'advance') {
      if (self.id !== game.host_id) return err(403, 'Only the host can move the round on.');
      if (!round || round.state === 'reveal') return err(409, 'Nothing to move on.');
      const moved = await advanceIfReady(env, game, round, members, true);
      if (!moved) return err(409, round.state === 'clue' ? 'Wait for at least 2 clues.' : 'Wait for at least 1 vote.');
      return json({ ok: true });
    }

    if (action === 'kick') {
      if (self.id !== game.host_id) return err(403, 'Only the host can remove players.');
      const id = Number(b.memberId);
      if (id === self.id) return err(400, 'You cannot remove yourself.');
      await env.DB.batch([
        env.DB.prepare('UPDATE members SET left_at = ?3 WHERE id = ?2 AND game_id = ?1').bind(game.id, id, now()),
        bump(env, game.id),
      ]);
      await advanceIfReady(env, game, round, members.filter((m) => m.id !== id));
      return json({ ok: true });
    }

    if (action === 'leave') {
      const rest = members.filter((m) => m.id !== self.id);
      const stmts = [env.DB.prepare('UPDATE members SET left_at = ?2 WHERE id = ?1').bind(self.id, now()), bump(env, game.id)];
      if (self.id === game.host_id && rest.length) stmts.push(env.DB.prepare('UPDATE games SET host_id = ?2 WHERE id = ?1').bind(game.id, rest[0].id));
      await env.DB.batch(stmts);
      await advanceIfReady(env, game, round, rest);
      return json({ ok: true });
    }

    return err(404, 'Not found');
  } catch (e) {
    console.error(e);
    return err(500, 'Something went wrong. Try again.');
  }
}
