// Oddclue Worker: static files from public/, and /api/* plus /g/* handled by one SQLite-backed Durable Object.
// (The account has no free D1 slot left, so game state lives in Durable Object storage instead.)
import { DurableObject } from 'cloudflare:workers';
import { onRequest as api } from './api.js';
import { previewData, renderPage } from './page.js';
import { SCHEMA } from './schema.js';
import { d1 } from './db.js';

export class Games extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.db = d1(ctx.storage);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(SCHEMA);
    });
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/__preview/')) {
      return Response.json(await previewData(this.db, decodeURIComponent(url.pathname.slice(11))));
    }
    const path = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    return api({ request, env: { DB: this.db }, params: { path } });
  }
}

const stub = (env) => env.GAMES.get(env.GAMES.idFromName('main'));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return stub(env).fetch(request);
    const m = url.pathname.match(/^\/g\/([^/]*)\/?$/);
    if (m) {
      const data = await (await stub(env).fetch(new Request(url.origin + '/__preview/' + encodeURIComponent(m[1])))).json();
      const shell = await (await env.ASSETS.fetch(new Request(url.origin + '/g'))).text();
      return renderPage(shell, url, data);
    }
    return env.ASSETS.fetch(request);
  }
};
