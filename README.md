# Oddclue

The imposter word game for group chats: everyone gets the same secret word except one imposter, each player gives a one-word clue on their own phone (now or later in the day), then the group votes. No app, no sign-up.

Live: https://pb-imposter-chat.jan-bef.workers.dev · Product page: https://janwan2003.github.io/imposter-chat/

- `src/` Cloudflare Worker: `worker.js` (routing), `api.js` (game API), `engine.js` (pure rules), `words.js` (18 original packs, 720 words), `page.js` (live link preview), `db.js` (D1-style wrapper over Durable Object SQLite).
- `public/` static site and game client. `docs/` GitHub Pages product, privacy and support page.
- `pnpm test:unit` · `pnpm dev` then `BASE=http://127.0.0.1:8831 pnpm test:e2e` · `pnpm deploy`.
