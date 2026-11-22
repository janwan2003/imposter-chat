// Layout audit in real Chromium: every screen of a game, at 360 px and 390 px phones and a 1280 px desktop,
// with worst-case text (20-character names, a 40-character game name, a 32-character clue with no spaces).
// Fails on horizontal overflow or any console error. Screenshots go to $SHOTS/layout-*.png for a look by eye.
// The game is driven through the API (fast); each screen is then opened as the right player.
// Usage: BASE=http://127.0.0.1:8831 node tests/e2e/layout.mjs
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

const SIZES = {
  p360: { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  p390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  d1280: { viewport: { width: 1280, height: 860 } },
};

async function api(p, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + '/api/' + p, {
    method,
    headers: { 'content-type': 'application/json', 'x-test': '1', ...(token ? { 'x-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${p}: ${res.status} ${data.error}`);
  return data;
}

const NAMES = ['Maximiliana Josefina', 'Bartholomew-Johnsons', 'Cat', 'Wolfgang Amadeus Moz'];
const LONG_CLUE = 'supercalifragilisticexpialidocio';

const created = await api('games', { method: 'POST', body: { nick: NAMES[0], name: 'The Extremely Long Friday Lunch Group Name', limitSecs: 3600 } });
const id = created.id;
const P = [{ name: NAMES[0], token: created.token, memberId: created.memberId }];
for (const n of NAMES.slice(1)) {
  const j = await api(`games/${id}/join`, { method: 'POST', body: { nick: n } });
  P.push({ name: n, token: j.token, memberId: j.memberId });
}
const state = (p) => api('games/' + id, { token: p.token });

const browser = await chromium.launch({ executablePath: findChrome() });
const problems = [];
let shots = 0;

// Opens `url` as player `who` (or a stranger) at every size, runs `prep`, checks overflow, screenshots.
async function screen(name, url, who, prep) {
  for (const [size, opts] of Object.entries(SIZES)) {
    const ctx = await browser.newContext({ ...opts, extraHTTPHeaders: { 'x-test': '1' } });
    if (who) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ['oddclue:' + id, JSON.stringify({ token: who.token, memberId: who.memberId })]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) problems.push(`${name}@${size}: console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`${name}@${size}: ${e.message}`));
    await page.goto(BASE + url);
    await page.waitForFunction(() => !document.querySelector('#app .spin'), null, { timeout: 15000 }).catch(() => {});
    if (prep) await prep(page);
    await page.waitForTimeout(150);
    const o = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll('body *')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (!(r.width > 0 && (r.right > w + 1 || r.left < -1))) return false;
        // Content inside a deliberate scroller (or a clipping box) does not make the page scroll sideways.
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(a).overflowX)) return false;
        }
        return true;
      }).map((el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').join('.') : '') + ` (${Math.round(el.getBoundingClientRect().right)}px)`);
      return { scroll: document.documentElement.scrollWidth, w, wide: wide.slice(0, 5) };
    });
    if (o.scroll > o.w || o.wide.length) problems.push(`${name}@${size}: overflow ${o.scroll} > ${o.w}: ${o.wide.join(', ')}`);
    await page.screenshot({ path: path.join(SHOTS, `layout-${name}-${size}.png`), fullPage: true });
    shots++;
    await ctx.close();
  }
}
const openCard = async (page) => { const c = page.locator('[data-card]'); if (await c.count()) await c.first().click(); };

try {
  await screen('landing', '/', null);
  await screen('landing-options', '/', null, async (page) => { await page.click('details.more summary'); await page.locator('.pack').first().waitFor({ state: 'attached' }); });
  await screen('404', '/no-such-page', null);
  await screen('privacy', '/privacy', null);
  await screen('join', '/g/' + id, null);
  await screen('lobby-host', '/g/' + id, P[0]);
  await screen('lobby-guest', '/g/' + id, P[1]);

  await api(`games/${id}/deal`, { method: 'POST', token: P[0].token, body: { after: 0 } });
  const roles = await Promise.all(P.map(state));
  const impIdx = roles.findIndex((s) => s.round.role === 'imposter');
  const imp = P[impIdx];
  const crew = P.filter((_, i) => i !== impIdx);
  await screen('join-midround', '/g/' + id, null);
  await screen('clue-closed', '/g/' + id, crew[0]);
  await screen('clue-crew', '/g/' + id, crew[0], openCard);
  await screen('clue-imposter', '/g/' + id, imp, openCard);
  await api(`games/${id}/clue`, { method: 'POST', token: crew[0].token, body: { text: LONG_CLUE } });
  await screen('clue-locked', '/g/' + id, crew[0], openCard);

  for (const p of [crew[1], crew[2], imp]) await api(`games/${id}/clue`, { method: 'POST', token: p.token, body: { text: p === imp ? 'quite a bluff' : 'zz ' + p.name.slice(0, 6) } });
  assert.equal((await state(P[0])).round.state, 'vote');
  await screen('vote-crew', '/g/' + id, crew[0], async (page) => { await page.locator('button[data-pick]:not([disabled])').first().click(); });
  await api(`games/${id}/vote`, { method: 'POST', token: crew[0].token, body: { target: imp.memberId } });
  await screen('vote-voted', '/g/' + id, crew[0]);
  await screen('vote-imposter', '/g/' + id, imp, async (page) => { await page.locator('button[data-pick]:not([disabled])').first().click(); await page.fill('#guess', 'a long guess of the word'); });

  for (const p of [crew[1], crew[2]]) await api(`games/${id}/vote`, { method: 'POST', token: p.token, body: { target: imp.memberId } });
  await api(`games/${id}/vote`, { method: 'POST', token: imp.token, body: { target: crew[0].memberId, guess: 'nope' } });
  assert.equal((await state(P[0])).round.state, 'reveal');
  await screen('reveal', '/g/' + id, crew[0]);
  await screen('reveal-imposter', '/g/' + id, imp);
  await screen('reveal-stranger', '/g/' + id, null);

  console.log(`${shots} screenshots in ${SHOTS}/ (game ${id})`);
  if (problems.length) { console.error('FAIL\n' + problems.join('\n')); process.exitCode = 1; }
  else console.log('PASS: no overflow, no console errors');
} finally {
  await browser.close();
}
