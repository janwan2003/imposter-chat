# Oddclue

The imposter word game for group chats: everyone gets the same secret word except one imposter, each player gives a one-word clue on their own phone (now or later in the day), then the group votes. No app, no sign-up.

Live: https://pb-imposter-chat.jan-bef.workers.dev · Product page: https://janwan2003.github.io/imposter-chat/

- `src/` Cloudflare Worker: `worker.js` (routing), `api.js` (game API), `engine.js` (pure rules), `words.js` (18 original packs, 720 words), `page.js` (live link preview), `db.js` (D1-style wrapper over Durable Object SQLite).
- `public/` static site and game client. `docs/` GitHub Pages product, privacy and support page.
- `pnpm test:unit` · `pnpm dev` then `BASE=http://127.0.0.1:8831 pnpm test:e2e` (game flow) and `BASE=... pnpm test:layout` (54 screenshots at 360/390/1280 px, fails on overflow or console errors) · `pnpm deploy`.
- `GET /api/stats`: daily counts of games, joins and rounds (no personal data). Test runs send `x-test: 1` and are not counted.
