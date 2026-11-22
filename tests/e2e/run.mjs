// End-to-end test in real Chromium, each player in a separate browser context:
// Ann creates a game on the landing page (desktop); Ben, Cat and Dan join from the link (phones).
// Round 1: cards are dealt, the API is checked for leaks, clues go in (one is rejected for giving the word away),
// voting opens by itself, the crew catches the imposter, the reveal and scores are checked, the share image downloads.
// Eve joins mid-round and is dealt into round 2, which Ben deals. Round 2 uses the host's "move on" buttons and
// the imposter guesses the word. A reload keeps a player's identity. No console errors are allowed.
// Usage: BASE=http://127.0.0.1:8831 node tests/e2e/run.mjs   (screenshots go to shots/)
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8831';
const SHOTS = process.env.SHOTS || 'shots';
fs.mkdirSync(SHOTS, { recursive: true });

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = path.join(os.homedir(), '.cache/ms-playwright');
  for (const d of fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 860 } };
const errors = [];
const browser = await chromium.launch({ executablePath: findChrome() });
const step = (s) => console.log('·', s);
const T = { timeout: 15000 };

async function person(label, opts, expected = []) {
  const ctx = await browser.newContext({ ...opts, acceptDownloads: true, extraHTTPHeaders: { 'x-test': '1' } }); // not counted in /api/stats
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !expected.some((re) => re.test(m.text()))) errors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  return { label, ctx, page };
}
const shot = (p, name) => p.page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });
let gameId;
// The state as this player's own browser sees it (with its own token).
const stateOf = (p) => p.page.evaluate(async (id) => {
  const ident = JSON.parse(localStorage.getItem('oddclue:' + id));
  const r = await fetch('/api/games/' + id, { headers: { 'x-token': ident.token } });
  return r.json();
}, gameId);
const og = async () => (await (await fetch(BASE + '/g/' + gameId)).text()).match(/property="og:description" content="([^"]*)"/)[1];

async function join(p, nick) {
  await p.page.goto(BASE + '/g/' + gameId);
  await p.page.locator('#nick').waitFor(T);
  await p.page.fill('#nick', nick);
  await p.page.click('#join button[type=submit]');
  await p.page.locator('#join').waitFor({ state: 'detached', ...T });
}

// Opens the player's card and returns { role, word }.
async function openCard(p) {
  const card = p.page.locator('[data-card]');
  await card.first().waitFor(T);
  if (await p.page.getByText('Tap to see it').count()) await card.first().click();
  const text = await card.first().innerText();
  if (/Imposter/i.test(text)) return { role: 'imposter', text };
  const word = await p.page.locator('[data-card] .w').innerText();
  return { role: 'crew', word: word.trim(), text };
}

async function clue(p, text) {
  await p.page.fill('#clue', text);
  await p.page.click('#clueform button[type=submit]');
}

async function vote(p, name, guess) {
  await p.page.getByRole('heading', { name: 'Who is the imposter?' }).waitFor(T);
  const btn = p.page.locator(`button[data-pick]`).filter({ has: p.page.locator('.who .nm', { hasText: new RegExp('^' + name + '$') }) });
  const n = await btn.count();
  if (n !== 1) console.log('vote buttons:', await p.page.locator('button[data-pick]').allInnerTexts());
  await btn.click();
  if (guess !== undefined) await p.page.fill('#guess', guess);
  await p.page.locator('#voteform button[type=submit]').click();
  await p.page.waitForFunction(() => document.body.innerText.includes('✓ Your vote') || !!document.querySelector('.reveal'), null, T);
}

try {
  // ---- Create
  const ann = await person('Ann', DESKTOP, [/status of 400/]); // a rejected clue may be Ann's
  await ann.page.goto(BASE + '/');
  await ann.page.locator('.pack').first().waitFor({ state: 'attached', ...T });
  await shot(ann, 'landing-desktop');
  await ann.page.click('#create button[type=submit]');
  await ann.page.getByText('Pick a nickname first.').waitFor(T);
  await ann.page.fill('#nick', 'Ann');
  await ann.page.fill('#gname', 'E2E Lunch');
  await ann.page.click('#create button[type=submit]');
  await ann.page.waitForURL(/\/g\/[A-Za-z0-9]+$/, T);
  gameId = ann.page.url().split('/g/')[1];
  await ann.page.getByText('Waiting for 2 more players').waitFor(T);
  assert.match(await og(), /Waiting to deal · 1 player so far/);
  await shot(ann, 'lobby-desktop');
  step('Ann created ' + gameId);

  // ---- Joins
  const ben = await person('Ben', PHONE, [/status of 409/, /status of 400/]);
  const cat = await person('Cat', PHONE, [/status of 400/]);
  const dan = await person('Dan', PHONE);
  await ben.page.goto(BASE + '/g/' + gameId);
  await ben.page.getByRole('heading', { name: 'Join E2E Lunch' }).waitFor(T);
  await shot(ben, 'join-phone');
  await ben.page.fill('#nick', 'ann');
  await ben.page.click('#join button[type=submit]');
  await ben.page.getByText('already uses that name').waitFor(T);
  await ben.page.fill('#nick', 'Ben');
  await ben.page.click('#join button[type=submit]');
  await ben.page.getByText('Waiting for Ann to deal').waitFor(T);
  await join(cat, 'Cat');
  await join(dan, 'Dan');
  await ann.page.getByRole('button', { name: 'Deal the cards (4 players)' }).waitFor(T);
  assert.match(await og(), /4 players so far/);
  step('Ben, Cat, Dan joined; duplicate name rejected');

  // ---- Round 1
  await ann.page.getByRole('button', { name: /Deal the cards/ }).click();
  const players = [ann, ben, cat, dan];
  const cards = new Map();
  for (const p of players) cards.set(p, await openCard(p));
  const imps = players.filter((p) => cards.get(p).role === 'imposter');
  assert.equal(imps.length, 1, 'exactly one imposter');
  const imp = imps[0];
  const crew = players.filter((p) => p !== imp);
  const word = cards.get(crew[0]).word;
  for (const p of crew) assert.equal(cards.get(p).word, word, 'crew all see the same word');
  assert.match(cards.get(imp).text, /Category:/, 'imposter sees the category');
  const impState = await stateOf(imp);
  assert.equal(impState.round.word, null, 'imposter API state has no word');
  assert.equal(JSON.stringify(impState).toLowerCase().includes(`"${word.toLowerCase()}"`), false, 'word appears nowhere in imposter state');
  assert.equal((await stateOf(crew[0])).round.reveal, null);
  assert.match(await og(), /Round 1 · 0 of 4 clues in/);
  await shot(imp, 'card-imposter-phone');
  await shot(crew.find((p) => p !== ann) || crew[0], 'card-crew-phone');
  step(`dealt: imposter ${imp.label}, word "${word}"`);

  // Eve joins mid-round
  const eve = await person('Eve', PHONE);
  await join(eve, 'Eve');
  await eve.page.getByText("you're in from the next round").waitFor(T);
  step('Eve joined mid-round and waits');

  // Clues: a crew member first tries the word itself
  await clue(crew[0], word.toUpperCase());
  await crew[0].page.getByText('gives the word away').waitFor(T);
  const clueText = { [crew[0].label]: 'zz-one', [crew[1].label]: 'zz-two', [crew[2].label]: 'zz-three', [imp.label]: 'zz-bluff' };
  await clue(crew[0], clueText[crew[0].label]);
  await crew[0].page.getByText('Locked in').waitFor(T);
  const mid = await stateOf(crew[1]);
  assert.equal(mid.round.clues, null, 'clues stay hidden until all are in');
  assert.match(await og(), /Round 1 · 1 of 4 clues in/);
  await shot(crew[0], 'clue-locked-phone');
  await clue(crew[1], clueText[crew[1].label]);
  await clue(imp, clueText[imp.label]);
  // Reload keeps identity
  await crew[2].page.reload();
  assert.equal((await openCard(crew[2])).word, word, 'reload keeps the same card');
  await clue(crew[2], clueText[crew[2].label]);
  for (const p of players) await p.page.getByRole('heading', { name: 'Who is the imposter?' }).waitFor(T);
  await eve.page.getByText('The clues are in').waitFor(T);
  step('all 4 clues in; voting opened by itself');

  // Votes: crew votes the imposter; the imposter votes crew[0] and guesses wrong
  assert.equal(await imp.page.locator(`button[data-pick]`, { hasText: '(you)' }).isDisabled(), true, 'cannot vote for yourself');
  await shot(crew[0], 'vote-phone');
  for (const p of crew) await vote(p, imp.label);
  await vote(imp, crew[0].label, 'definitely-not-it');
  for (const p of [...players, eve]) await p.page.getByText(`${imp.label} was the imposter, and got caught!`).waitFor(T);
  await shot(crew[0], 'reveal-phone');
  await shot(ann, 'reveal-desktop');
  const r1 = await stateOf(ann);
  assert.equal(r1.round.reveal.outcome, 'caught');
  for (const p of crew) assert.equal(r1.scores.find((s) => s.name === p.label).points, 1);
  assert.equal(r1.scores.find((s) => s.name === imp.label).points, 0);
  assert.match(await og(), /Round 1 revealed/);
  step('reveal: caught, scores 1/1/1/0');

  // Share image downloads on desktop
  const dl = ann.page.waitForEvent('download');
  await ann.page.getByRole('button', { name: 'Share result' }).click();
  const file = await (await dl).path();
  const size = fs.statSync(file).size;
  assert.ok(size > 20000, 'share image is a real PNG, got ' + size);
  fs.copyFileSync(file, path.join(SHOTS, 'share-card.png'));
  step(`share card downloaded (${size} bytes)`);

  // ---- Round 2, dealt by Ben (not the host), Eve now plays
  await ben.page.getByRole('button', { name: 'Deal next round' }).click();
  const players2 = [ann, ben, cat, dan, eve];
  const cards2 = new Map();
  for (const p of players2) cards2.set(p, await openCard(p));
  const imp2 = players2.find((p) => cards2.get(p).role === 'imposter');
  assert.ok(imp2, 'round 2 has an imposter');
  assert.notEqual(imp2, imp, 'imposter changes between rounds');
  const crew2 = players2.filter((p) => p !== imp2);
  const word2 = cards2.get(crew2[0]).word;
  assert.notEqual(word2, word, 'new word');
  assert.equal((await stateOf(eve)).round.inRound, true, 'Eve is dealt in');
  step(`round 2: imposter ${imp2.label}, word "${word2}"`);
  // Two clues, then the host moves it on (Ann may or may not be the imposter; both are fine)
  await clue(crew2[0], 'yy-a');
  await crew2[0].page.getByText('Locked in').waitFor(T);
  await clue(imp2, 'yy-b');
  await imp2.page.getByText('Locked in').waitFor(T);
  await ann.page.getByRole('button', { name: 'Reveal the clues now' }).click();
  for (const p of players2) await p.page.getByRole('heading', { name: 'Who is the imposter?' }).waitFor(T);
  await vote(imp2, crew2[0].label, word2.toUpperCase() + (/s$/i.test(word2) ? '' : 's')); // case and a plural are forgiven
  await ann.page.getByRole('button', { name: 'Reveal the imposter now' }).click();
  await crew2[1].page.getByText('guessed the word!').waitFor(T);
  const r2 = await stateOf(ann);
  assert.equal(r2.round.reveal.outcome, 'escaped-guessed');
  assert.equal(r2.round.reveal.points.find((p) => p.name === imp2.label).points, 4);
  await shot(crew2[1], 'reveal2-phone');
  step('round 2: host moved clues and votes on; imposter escaped and guessed (+4)');

  // Unknown game
  const res = await fetch(BASE + '/g/nopeNope1');
  assert.equal(res.status, 404);
  const gone = await person('Gone', PHONE, [/404/]);
  await gone.page.goto(BASE + '/g/nopeNope1');
  await gone.page.getByText('Game not found').waitFor(T);
  // Privacy page, branded 404 for unknown paths, counts-only stats
  const pv = await fetch(BASE + '/privacy');
  assert.equal(pv.status, 200);
  const nf = await fetch(BASE + '/no-such-page');
  assert.equal(nf.status, 404);
  assert.match(await nf.text(), /Start a new game/);
  const st = await (await fetch(BASE + '/api/stats')).json();
  assert.ok(st.last7 && Number.isInteger(st.last7.games) && st.stored.games >= 1, 'stats shape: ' + JSON.stringify(st));
  assert.equal(JSON.stringify(st).includes('Ann'), false, 'stats hold no names');

  assert.deepEqual(errors, [], 'no console errors');
  console.log('PASS');
} catch (e) {
  console.error('FAIL', e);
  console.error('console errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
