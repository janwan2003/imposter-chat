// Renders public/og.png (1200x630) and the PNG app icons from tools/og.html and public/icon.svg.
// Usage: node tools/render-images.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromeRoot = path.join(os.homedir(), '.cache/ms-playwright');
const dir = fs.readdirSync(chromeRoot).filter((d) => d.startsWith('chromium-')).sort().reverse()[0];
const browser = await chromium.launch({ executablePath: path.join(chromeRoot, dir, 'chrome-linux64/chrome') });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('file://' + path.join(root, 'tools/og.html'));
await page.screenshot({ path: path.join(root, 'public/og.png') });
for (const size of [180, 512]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><body style="margin:0;background:#5b3df5">${fs.readFileSync(path.join(root, 'public/icon.svg'), 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: path.join(root, `public/icon-${size}.png`) });
}
await browser.close();
console.log('rendered og.png, icon-180.png, icon-512.png');
