// Pure game rules for Oddclue. No I/O here, so everything is unit-tested in tests/unit.
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;
export const LIMITS = [0, 3600, 10800, 43200, 86400]; // phase time limits a host can pick (0 = none)

// Lowercase, strip accents and punctuation, and drop a plural "s" so "Pancakes!" == "pancake".
export function normalize(text) {
  let s = String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  s = s.split(' ').map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).join(' ');
  return s;
}

function distance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

// Did the imposter guess the secret word? Spaces are ignored and long words allow one typo.
export function guessMatches(guess, word) {
  const g = normalize(guess).replace(/ /g, '');
  const w = normalize(word).replace(/ /g, '');
  if (!g || !w) return false;
  if (g === w) return true;
  return w.length >= 5 && distance(g, w) <= 1;
}

// A crew clue may not give the word away: no clue that contains the word (or is the word misspelt by one letter).
export function clueProblem(clue, word) {
  const c = normalize(clue);
  if (!c) return 'Write a clue first.';
  if (c.split(' ').length > 3) return 'Keep it to three words or fewer.';
  const w = normalize(word);
  const flat = c.replace(/ /g, '');
  const wflat = w.replace(/ /g, '');
  if (flat.includes(wflat) || w.split(' ').some((part) => part.length > 2 && c.split(' ').includes(part)) || guessMatches(c, word)) {
    return 'That gives the word away. Try something sneakier.';
  }
  return null;
}

// Pick the imposter at random, but not the same person twice in a row when there is a choice.
export function pickImposter(players, previous, rand = Math.random) {
  const pool = players.length > 1 && previous != null ? players.filter((p) => p !== previous) : players;
  return pool[Math.floor(rand() * pool.length)];
}

// Pick a word from the chosen packs that this game has not used yet. Falls back to any word once all are used.
export function pickWord(packs, chosenIds, usedWords, rand = Math.random) {
  const chosen = packs.filter((p) => chosenIds.includes(p.id));
  const all = (chosen.length ? chosen : packs).flatMap((p) => p.words.map((w) => ({ word: w, category: p.name })));
  const used = new Set(usedWords.map((w) => w.toLowerCase()));
  const fresh = all.filter((x) => !used.has(x.word.toLowerCase()));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(rand() * pool.length)];
}

// Count votes. The imposter is caught only when they alone have the most votes; a tie at the top lets them escape.
export function tally(players, votes, imposterId) {
  const counts = new Map(players.map((p) => [p, 0]));
  for (const v of votes) if (counts.has(v.target_id) && players.includes(v.voter_id)) counts.set(v.target_id, counts.get(v.target_id) + 1);
  const max = Math.max(0, ...counts.values());
  const top = [...counts.entries()].filter(([, n]) => n === max && n > 0).map(([id]) => id);
  const caught = top.length === 1 && top[0] === imposterId;
  return { counts, top, caught, againstImposter: counts.get(imposterId) || 0 };
}

// Points for one revealed round:
// +1 to every crew member who voted for the imposter, +2 to the imposter for escaping, +2 for guessing the word.
export function scoreRound(round, votes) {
  const players = round.players;
  const imp = round.imposter_id;
  const t = tally(players, votes, imp);
  const guessed = guessMatches(round.guess, round.word);
  const points = new Map(players.map((p) => [p, 0]));
  for (const v of votes) {
    if (v.voter_id !== imp && v.target_id === imp && points.has(v.voter_id)) points.set(v.voter_id, points.get(v.voter_id) + 1);
  }
  let impPts = 0;
  if (!t.caught) impPts += 2;
  if (guessed) impPts += 2;
  points.set(imp, (points.get(imp) || 0) + impPts);
  let outcome;
  if (t.caught && guessed) outcome = 'caught-guessed';
  else if (t.caught) outcome = 'caught';
  else outcome = guessed ? 'escaped-guessed' : 'escaped';
  return { ...t, guessed, points, outcome };
}

// Running scoreboard over all revealed rounds.
export function totals(rounds, votesByRound) {
  const sum = new Map();
  for (const r of rounds) {
    if (r.state !== 'reveal') continue;
    const s = scoreRound(r, votesByRound.get(r.no) || []);
    for (const [id, p] of s.points) sum.set(id, (sum.get(id) || 0) + p);
  }
  return sum;
}

// Which phase should a round be in now? Moves on when everyone still in the game has acted, or at the deadline.
// activeIds: dealt players who have not left. Returns the new state, or null to stay.
export function nextState(round, activeIds, clueIds, voteIds, now) {
  const live = round.players.filter((p) => activeIds.includes(p));
  const late = round.deadline != null && now >= round.deadline;
  if (round.state === 'clue') {
    const done = live.every((p) => clueIds.includes(p));
    if ((done && clueIds.length >= 2) || (late && clueIds.length >= 2)) return 'vote';
    return null;
  }
  if (round.state === 'vote') {
    const done = live.every((p) => voteIds.includes(p));
    if ((done && voteIds.length >= 1) || (late && voteIds.length >= 1)) return 'reveal';
    return null;
  }
  return null;
}

// Clues in a stable shuffled order, so nobody can tell who answered first.
export function shuffleSeeded(items, seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function headline(outcome, impName, word) {
  switch (outcome) {
    case 'caught':
      return `${impName} was the imposter, and got caught.`;
    case 'caught-guessed':
      return `${impName} got caught, but guessed “${word}” and stole points back.`;
    case 'escaped-guessed':
      return `${impName} was the imposter, got away and guessed “${word}”.`;
    default:
      return `${impName} was the imposter, and got away with it.`;
  }
}
