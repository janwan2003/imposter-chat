// The game page with a live link preview, e.g. "Round 3 · 5 of 6 clues in · 6 players so far".
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function previewText(g, row) {
  const players = row.members === 1 ? '1 player so far' : `${row.members} players so far`;
  if (!g.round_no || !row.state) return `Waiting to deal · ${players}. Everyone gets the secret word except one imposter. Tap to join, no app or sign-up.`;
  const n = JSON.parse(row.players).length;
  if (row.state === 'clue') return `Round ${g.round_no} · ${row.clues} of ${n} clues in · ${players}. One of you is the imposter. Tap to play.`;
  if (row.state === 'vote') return `Round ${g.round_no} · voting: ${row.votes} of ${n} votes in. Who is the imposter? Tap to vote.`;
  return `Round ${g.round_no} revealed · ${players}. See who the imposter was, then deal the next round.`;
}

// Runs next to the data (inside the Durable Object).
export async function previewData(db, id) {
  let title = 'Join my imposter game on Oddclue';
  let desc = 'Everyone gets the secret word except one imposter. Give a clue, then vote out the bluffer. No app, no sign-up.';
  let status = 200;
  try {
    const g = /^[A-Za-z0-9]{6,16}$/.test(id) && (await db.prepare('SELECT id, name, round_no FROM games WHERE id = ?1').bind(id).first());
    if (g) {
      const row = await db.prepare(
        `SELECT (SELECT COUNT(*) FROM members WHERE game_id = ?1 AND left_at IS NULL) AS members,
                (SELECT state FROM rounds WHERE game_id = ?1 AND no = ?2) AS state,
                (SELECT players FROM rounds WHERE game_id = ?1 AND no = ?2) AS players,
                (SELECT COUNT(*) FROM clues WHERE game_id = ?1 AND no = ?2) AS clues,
                (SELECT COUNT(*) FROM votes WHERE game_id = ?1 AND no = ?2) AS votes`
      ).bind(g.id, g.round_no).first();
      title = `${g.name} · Oddclue`;
      desc = previewText(g, row);
    } else {
      title = 'Oddclue · game not found';
      status = 404;
    }
  } catch (e) {
    console.error(e);
  }
  return { title, desc, status };
}

// Runs in the Worker: puts the preview tags into the page shell.
export function renderPage(shell, url, { title, desc, status }) {
  const meta = `<title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Oddclue">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${url.origin}/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${esc(url.origin + url.pathname)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="robots" content="noindex">`;
  return new Response(shell.replace('<!--META-->', meta), {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-frame-options': 'DENY',
      'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    },
  });
}
