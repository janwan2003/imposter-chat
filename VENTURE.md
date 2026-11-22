---
slug: imposter-chat
stage: launched
priority: 4
url: https://pb-imposter-chat.jan-bef.workers.dev
repo: https://github.com/janwan2003/imposter-chat
updated: 2026-11-22
---

# imposter-chat (brand: **Oddclue**)

## Thesis

**Who:** Teens, students and young adults in group chats who already play the "imposter" word
game. In that game everyone gets the same secret word except one hidden player, the imposter, who
has to bluff through the clues. It spread on TikTok and Instagram Reels in 2025 and is played
daily in some school lunch breaks. Families and office teams are the second audience.

**What:** A no-login imposter word game that works in two ways from one link:
1. **Async in a group chat:** the host shares a link. Each player opens it on their own phone and
   sees the secret word, or "you're the imposter" with only the category. Each player submits one
   clue word whenever they like. When all clues are in (or at a deadline), they are revealed
   together and everyone votes. The reveal shows who the imposter was and whether they guessed the
   word. A round takes a few minutes of attention spread over a few hours.
2. **Same room, own phones:** the same rules, live, so a group no longer passes one phone around.

Word packs are original (food, films, places, school, Christmas). A group-made pack is possible.
Scores carry across rounds.

**Needs others:** yes. The game needs at least 3 players, and the fun is reading each other's clues.

**Viral moment:** the reveal card ("Maya was the imposter. Her clue 'crunchy' for *pancake* got
her caught 5–1") posted in the chat and to stories. The link preview shows live state: "Round 3 ·
5 of 6 clues in". After the reveal, "Start a game in another chat".

**How often:** weekly or more for active friend groups. It is a party game, a lunch-break game and a
long-drive game. A new round costs one tap, so a session usually has several rounds.

**Why now:** the format is a current trend (2025 TikTok/Reels, then school daily rituals in 2026)
and new App Store clones appear every month. But the browser versions are live room-code games and
most apps are pass-and-play on one phone. Nobody owns the "play it inside the group chat without
being together" version.

## Market evidence

Searches run 2026-11-20. Sources are search-result summaries, not opened pages.

- **Trend:** Tampere University PlayLab, ["How 'word impostor' became last month's most addictive
  guessing game"](https://blogs.tuni.fi/playlab/game-related-media/guess-betray-repeat-how-word-impostor-became-last-months-most-addictive-guessing-game/)
  (a social media trend on TikTok and Reels). [The Tab, 2025-09-22](https://thetab.com/2025/09/22/heres-how-to-start-the-iconic-imposter-game-all-the-girlies-are-playing-on-tiktok-rn)
  ("the iconic Imposter game all the girlies are playing on TikTok"). [HS Dial, 2026-04-30](https://hsdial.org/2026/04/30/from-screens-to-face-to-face-memories/)
  and [SME Harbinger](https://smeharbinger.net/impostor-among-us-new-viral-game-takes-over-east)
  (student papers describing it as a daily school ritual).
- **Store crowding as a demand signal:** 15+ iOS listings from 2025–2026 (e.g. [Imposter Party Word
  Game](https://apps.apple.com/app/id6751759219), [Imposter Who?](https://apps.apple.com/app/id6746781192),
  [Imposter - Who Is Lying?](https://apps.apple.com/app/id6756533285)), mostly pass-and-play with
  in-app purchases or subscriptions. No chart or install data was found.
- **Browser competitors (all live, room-code):** [imposter.app/online](https://imposter.app/online/)
  (no signup, 3–20 players, 6-digit code), [wordimpostor.com](https://www.wordimpostor.com),
  [Imposter Game on Product Hunt](https://www.producthunt.com/products/imposter-game) (one review
  says online mode needs a login), [Faker Finder](https://www.moddb.com/games/faker-finder)
  (one phone).
- **Weaknesses:** every web version found needs everyone online in the same session. The apps need
  installs and push premium packs. None shows live state in a chat link preview or plays across a day.
- **Search volume (third-party estimate, checked 2026-11-21):** a Semrush overview page for
  wordimpostor.com lists "imposter game" at about 1,640 US searches a month and "word impostor game"
  at about 1,590 (search-result summary, undated, not opened). AppGoblin lists "Imposter Game: Party
  Word Game" (Android) at about 50.4K installs with growing monthly installs. Neither is first-hand.
- **Recheck of the async gap (2026-11-21 search):** still mostly live room-code games. One Product
  Hunt listing, "Imposter Game Words", offers "copy/share to chat" to deal words for remote play,
  which is the closest to our async mode (not opened; no clue or vote flow mentioned).
- **Name check:** a search for "Oddclue" game returned no product with that name (2026-11-21).

## Our edge

- **Loop: needs others.**
- **K estimate ≈ 1.6** = 6 players invited per game × 75% who join (they already know the rules from
  TikTok, and the link opens straight to their word) × 35% of joiners who later host in another
  group. Reason: the game is a known trend, teens are in many overlapping group chats, and hosting
  takes one tap.
- **Async in-chat mode** is the gap. All browser competitors are live room-code games.
- **Own phones in the same room** removes the pass-the-phone step, with no install.
- **Rich link preview** with round state, and a reveal card worth posting.
- **Honest risk:** the space is crowded and fast-moving, and a trend can fade. The async mode must
  be clearly better, not just another room-code clone. Avoid "Among Us" and any app's name or art.
  "Imposter" itself is a generic word, but pick a distinctive product name.

## Status

**Live: https://pb-imposter-chat.jan-bef.workers.dev** (Cloudflare Worker `pb-imposter-chat` with static
assets and one SQLite-backed Durable Object class `Games`, free plan). Product, privacy and support page:
https://janwan2003.github.io/imposter-chat/ (GitHub Pages from `docs/`). Search Console: verified by
META and sitemap submitted 2026-11-21 (`python3 scripts/gsc.py status` reads analytics).

Why not Pages + D1: `wrangler d1 create pb-imposter-chat` failed on 2026-11-21 with "You have reached
the maximum number of D1 databases for your account" (free plan: 10). Game state lives in Durable Object
SQLite storage instead, behind a small D1-style wrapper (`src/db.js`), so moving to D1 later is a
config change. All games currently live in one Durable Object (`idFromName('main')`).

What exists and works:
- Landing page with create form (nickname, optional game name; collapsed: 18 word packs, time per step
  0/1/3/12/24 h, default 3 h, and "show the imposter the category", default on).
- Game page `/g/<id>`: join with a nickname (duplicate names rejected, max 20 players), lobby with share
  link / WhatsApp / copy, host deals at 3+ players and can remove players.
- Round: tap-to-reveal card (word + category for crew; "Imposter" + category for the imposter). The
  API never sends the word to the imposter. Clue of up to 3 words; crew clues containing the word or
  a one-letter misspelling are rejected. Clues are hidden until all are in, then shown in a seeded
  shuffled order. Voting opens by itself when every active player has a clue, at the deadline (with
  2+ clues), or when the host moves it on. Votes can be changed until the reveal; no self-votes.
  The imposter's ballot includes a guess of the word.
- Reveal: headline (caught / caught but guessed / got away / got away and guessed), word, the
  imposter's clue, every vote, round points and running scores. Scoring: +1 per crew vote on the
  imposter; imposter +2 for escaping (a tie at the top counts as escaping) and +2 for guessing the
  word (case, accents, plural "s" and one typo on 5+ letter words forgiven).
- "Share result" draws a 1080x1350 PNG (Web Share with file on phones, download elsewhere).
  "Deal next round" for anyone in the game; the imposter is never the same person twice in a row;
  words do not repeat within a game until the packs run out. Players who join mid-round are dealt into
  the next round.
- Live link preview per game: "Round 1 · 1 of 4 clues in · 4 players so far…", "voting: 2 of 4
  votes in", "Round 1 revealed". Static OG image `og.png`.
- Adaptive polling: 2.5 s after a change, backing off ×1.35 to 6 s while a round is live (15 s in the
  lobby and after a reveal), paused when the tab is hidden; an unchanged poll is one row read (`?v=` version check).
- Content: 18 original packs × 40 words = 720 unique words (`src/words.js`), including Christmas.
- Safety: per IP per hour 60 game creations, 300 joins, 3000 writes (raised 2026-11-22: school Wi-Fi and
  mobile carriers put many players behind one IP); games deleted 30 days after the last activity; CSP and
  security headers; no accounts, cookies or analytics.
- Usage counts: `GET /api/stats` returns per-UTC-day totals of games created, joins and rounds dealt
  (table `daily`, counting since 2026-11-22), plus games and players currently stored. No names or ids.
  Our test suites send `x-test: 1`, which counts 0, so test runs do not inflate it.
- Branded 404 page (`public/404.html`).

Verified 2026-11-21:
- `node --test tests/unit/*.test.js`: 11/11 pass (packs shape and uniqueness, normalising and guess
  matching, clue rules, imposter rotation, word picking, tally ties, scoring, totals, phase moves
  incl. deadlines, seeded shuffle, headlines).
- `tests/e2e/run.mjs` in real Chromium (1 desktop context at 1280px, 4 phone contexts at 390px):
  **passes locally** (Pages dev 3 runs, then `wrangler dev` with the Durable Object 1 run) **and on
  production** (version 15b61f5d, game xqGR5S3A). Covers create with empty-name check, 3 joins plus a
  duplicate name, link previews at each phase, one imposter / same word for the crew / no word in
  the imposter's API state, a mid-round joiner dealt into round 2, a clue rejected for containing the
  word, clues hidden until all are in, reload keeps identity, auto-open of voting, self-vote disabled,
  caught reveal with scores 1/1/1/0, share PNG download (>20 KB), next round dealt by a non-host,
  host "reveal now" for clues and votes, imposter escaping and guessing (+4), unknown game 404,
  privacy page, and 0 unexpected console errors.
- Rate limit, local: 20 creates → 201, 21st and 22nd → 429.
- Screenshots checked by eye: landing (desktop), lobby (desktop), join, crew card, imposter card,
  vote, reveal (phone), share card, OG image. Fixed: OG cards cut off at the right edge; empty space
  on the share card (now lists the other clues).

Quality pass 2026-11-22 (Worker version a890c7b4, then test-only changes):
- Bugs found and fixed: (1) vote list squeezed a player's name into a one-letter column when the clue was
  long (360/390 px); name now sits above the clue, also on the reveal. (2) countdown read "2h 60m". (3) a
  round past its deadline with under 2 clues said "Moving on any moment" forever and every open tab
  re-polled every 2.5 s; now it says what it waits for and backs off. (4) long status pills could not wrap.
  (5) unknown URLs had no 404 page. (6) players who left could still be voted for (client and API).
  (7) "Start a game in another chat" twice on the reveal. (8) reveal buttons wrapped at 360 px.
  (9) a player watching a live round could wait up to 20 s for the next step (back-off cap now 6 s).
- Design: landing puts the create form right after the headline on phones (was below the fold at 360 px),
  shorter "Create game" button, new "what a round looks like" preview (word card, imposter card, vote
  list; swipeable on phones), compact how-to steps on phones, "Crew wins / Imposter wins" banner on the
  reveal. GitHub Pages page rebuilt with the same preview and how-to.
- `tests/e2e/layout.mjs` (new): 18 screens x 360 px, 390 px, 1280 px = 54 screenshots with worst-case
  text (20-char names, 32-char unbroken clue); fails on horizontal overflow or any console error.
  PASS locally and on production. Phone sheets checked by eye.
- `tests/e2e/run.mjs` (now also checks the branded 404, the stats endpoint, no names in stats): PASS
  locally, and on production 3/3 consecutive runs after the last fixes. Earlier production failures this
  session, by class: 2 were a test bug ("gymnastics" + "s" is not a forgivable plural; fixed in the test,
  unit test added), 1 was our own join rate limit after ~12 runs from one IP (environment), 1 timed out
  waiting for a vote button and did not recur in 9 later runs (unexplained).
- `node --test tests/unit/*.test.js`: 12/12. Live `/`, `/privacy`, `/api/stats`, `/og.png`, `/sitemap.xml`,
  `/robots.txt`, `/icon.svg`, `/manifest.webmanifest` 200; `/no-such-page` 404 with the branded page.

Not covered yet: deadline auto-advance on production and the new past-deadline wording (unit-tested or
checked by eye only; it needs an hour), real iOS
Safari / Android Chrome, WhatsApp/iMessage preview rendering, Web Share on a real phone, more than 5
players.

## Next steps

1. Real-device pass (needs the operator's phones, see inbox): iPhone Safari and Android Chrome join, card,
   clue, vote, Web Share of the result image, keyboard over the clue input, WhatsApp/iMessage link preview.
2. Fill `## Metrics` weekly from `GET /api/stats` (`last7` vs `prev7`).
3. Search landing pages that match how people look for it: "imposter word game online", "imposter game
   with friends in group chat", "imposter word list" (a public sample of the packs), each linking to
   Start a game.
4. Dynamic OG image per game state (static `og.png` for now).
5. Scale: polling is about 600 requests per hour per watching player in a live round; the free plan allows
   100k Durable Object requests a day. If traffic grows, move live updates to WebSockets with hibernation
   and shard Durable Objects per game.

## Metrics

- 2026-11-21: deployed today; no users yet (only e2e test games).
- 2026-11-22: `/api/stats` added today. Its 2026-11-22 row (11 games, 42 joins, 19 rounds at ~14:00 UTC) is
  almost all this session's test runs from before the `x-test` exclusion; treat that day as test traffic.
  Search Console 0 impressions (review line in Log).

## Monetization plan

None until the operator enables it (charter rule 4). Later: premium word packs and custom
packs for classes and teams. Never paywall joining or basic packs.

## Log

- 2026-11-20 scout: created idea. Evidence from web searches (TUNI PlayLab, The Tab, student
  newspapers, App Store listings, imposter.app, wordimpostor.com, Product Hunt). Trend is real;
  browser competition is crowded but live-only. No search-volume data.
- 2026-11-21 builder: sanity-checked evidence (third-party "imposter game" ~1.6k US searches/month,
  async gap still open, name "Oddclue" free), built the whole game (engine, API, client, 720-word
  packs, share card, live link preview), deployed as Worker + Durable Object because the D1 database
  cap is reached. Verified: unit 11/11, e2e in Chromium passes locally and on production (version
  15b61f5d), rate limit 429 after 20 creates. Repo and GitHub Pages published (Pages status "built", 4 URLs 200),
  Search Console verified and sitemap submitted (deploy b9bc9e9f); all 9 live URLs return 200. Stage: launched.
- 2026-11-21 review: kept p4. live URL 200 with 0 console errors in headless Chromium at 390 px, Search Console 0 impressions 2026-11-01→11-21; usage not countable from outside (Durable Object storage, no count endpoint). Under 21 days live, so no traction verdict.
- 2026-11-22 review: kept p4. URL 200, 0 console errors (headless Chromium, 390 px, 2026-11-22 ~03:40 UTC); Search Console 0 impressions 11-01→11-22; usage not countable (Durable Object, `/api/stats` 404). Under 21 days live, so no traction verdict. Add a count endpoint for the weekly Metrics line.
- 2026-11-22 builder (quality): 9 bugs fixed (vote-list squeeze, "2h 60m", stuck past-deadline round with 2.5 s re-poll, pill wrap, no 404 page, voting for players who left, duplicate link, reveal button wrap, 20 s wait in live rounds); landing redesigned for phones with a round preview; reveal banner; Pages page rebuilt; `/api/stats` daily counts; per-IP limits raised for shared IPs. New `tests/e2e/layout.mjs` (54 screenshots, 3 widths, worst-case text) PASS local + prod; `run.mjs` PASS 3/3 on prod (Worker a890c7b4); unit 12/12.
