// Draws the round result as a 1080x1350 image and shares it (or downloads it where sharing files is not supported).
const OddShare = (() => {
  function wrap(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  function draw(S) {
    const r = S.round;
    const v = r.reveal;
    const c = document.createElement('canvas');
    c.width = 1080;
    c.height = 1350;
    const ctx = c.getContext('2d');
    const caught = v.caught;
    const g = ctx.createLinearGradient(0, 0, 1080, 1350);
    g.addColorStop(0, caught ? '#5b3df5' : '#e5484d');
    g.addColorStop(1, caught ? '#8b5cf6' : '#f97316');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1080, 1350);

    ctx.fillStyle = '#fff';
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText('Oddclue', 80, 120);
    ctx.globalAlpha = 0.85;
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(`Round ${r.no} · ${S.name}`.slice(0, 48), 80, 175);
    ctx.globalAlpha = 1;

    const head = {
      caught: `${v.imposterName} was the imposter and got caught.`,
      'caught-guessed': `${v.imposterName} got caught, but guessed the word.`,
      'escaped-guessed': `${v.imposterName} got away and guessed the word.`,
      escaped: `${v.imposterName} was the imposter and got away with it.`,
    }[v.outcome];
    ctx.font = `900 84px ${FONT}`;
    let y = 330;
    for (const line of wrap(ctx, head, 920).slice(0, 4)) { ctx.fillText(line, 80, y); y += 96; }

    // White panel with the word, the imposter's clue and the vote.
    y += 30;
    ctx.fillStyle = '#fff';
    roundRect(ctx, 60, y, 960, 1350 - y - 170, 40);
    ctx.fill();
    ctx.fillStyle = '#6b6580';
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText('THE SECRET WORD', 110, y + 80);
    ctx.fillStyle = '#1d1832';
    ctx.font = `900 92px ${FONT}`;
    ctx.fillText(r.word.slice(0, 18), 110, y + 180);
    const impClue = (r.clues.find((x) => x.id === v.imposterId) || {}).text;
    ctx.font = `600 40px ${FONT}`;
    ctx.fillStyle = '#1d1832';
    let ly = y + 270;
    const lines = [];
    if (impClue) lines.push(`Their clue: “${impClue}”`);
    lines.push(`Votes on the imposter: ${v.againstImposter} of ${v.votes.length}`);
    if (v.guess) lines.push(`Their guess: “${v.guess}” ${v.guessed ? '✓' : '✗'}`);
    for (const l of lines) { for (const w of wrap(ctx, l, 860).slice(0, 2)) { ctx.fillText(w, 110, ly); ly += 58; } ly += 6; }

    // Everyone's clues, two columns, as much as fits above the panel's bottom edge.
    const bottom = 1350 - 170 - 40;
    const rest = r.clues.filter((x) => x.id !== v.imposterId);
    if (rest.length && ly + 90 < bottom) {
      ly += 20;
      ctx.fillStyle = '#6b6580';
      ctx.font = `700 28px ${FONT}`;
      ctx.fillText('THE OTHER CLUES', 110, ly);
      ly += 52;
      ctx.font = `600 34px ${FONT}`;
      ctx.fillStyle = '#1d1832';
      rest.forEach((x, i) => {
        const col = i % 2;
        const yy = ly + Math.floor(i / 2) * 50;
        if (yy > bottom) return;
        let t = `${x.name}: “${x.text}”`;
        while (ctx.measureText(t).width > 410 && t.length > 4) t = t.slice(0, -2) + '…';
        ctx.fillText(t, 110 + col * 440, yy);
      });
    }

    ctx.fillStyle = '#fff';
    ctx.font = `700 38px ${FONT}`;
    ctx.fillText('Play it in your group chat:', 80, 1255);
    ctx.font = `800 42px ${FONT}`;
    ctx.fillText(location.host, 80, 1310);
    return c;
  }

  async function share(S) {
    const canvas = draw(S);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const file = new File([blob], `oddclue-round-${S.round.no}.png`, { type: 'image/png' });
    const text = `${S.round.reveal.imposterName} was the imposter! The word was “${S.round.word}”. Play Oddclue: ${location.origin}`;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    OC.toast('Result image saved');
  }
  return { draw, share };
})();
