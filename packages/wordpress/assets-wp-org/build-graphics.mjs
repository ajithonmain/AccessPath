/**
 * Renders the WordPress.org SVN assets/ graphics (icon + banner) via a headless
 * browser, using the real brand logo and palette. Not part of the plugin build —
 * these live outside plugin/ and are pushed to the plugin's SVN assets/ directory
 * by hand (see RELEASING.md).
 *
 * Usage: node build-graphics.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOGO = readFileSync(path.join(HERE, '../../site/public/images/logo.png')).toString('base64');

const VIOLET = '#4928F3';
const VIOLET_DEEP = '#4636DF';

const page_html = ({ w, h, logoSize, showWordmark, radius }) => `
<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
  .stage {
    width: ${w}px; height: ${h}px;
    background: linear-gradient(135deg, ${VIOLET} 0%, ${VIOLET_DEEP} 100%);
    border-radius: ${radius}px;
    display: flex; align-items: center; justify-content: center;
    flex-direction: ${showWordmark ? 'row' : 'column'};
    gap: ${showWordmark ? Math.round(h * 0.12) : 0}px;
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
  }
  img { width: ${logoSize}px; height: auto; display: block; filter: brightness(0) invert(1); }
  .word { color: #fff; font-weight: 700; letter-spacing: -0.5px; font-size: ${Math.round(h * 0.24)}px; }
  .tag { color: rgba(255,255,255,0.82); font-size: ${Math.round(h * 0.1)}px; margin-top: ${Math.round(h * 0.06)}px; font-weight: 400; }
  .textcol { display: flex; flex-direction: column; justify-content: center; }
</style></head>
<body>
  <div class="stage">
    <img src="data:image/png;base64,${LOGO}" />
    ${
			showWordmark
				? `<div class="textcol"><div class="word">AccessPath</div><div class="tag">The web, on your terms.</div></div>`
				: ''
		}
  </div>
</body></html>`;

const targets = [
	{ file: 'icon-128x128.png', w: 128, h: 128, logoSize: 76, showWordmark: false, radius: 0 },
	{ file: 'icon-256x256.png', w: 256, h: 256, logoSize: 152, showWordmark: false, radius: 0 },
	{ file: 'banner-772x250.png', w: 772, h: 250, logoSize: 130, showWordmark: true, radius: 0 },
	{ file: 'banner-1544x500.png', w: 1544, h: 500, logoSize: 260, showWordmark: true, radius: 0 },
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const t of targets) {
	await page.setViewportSize({ width: t.w, height: t.h });
	await page.setContent(page_html(t));
	await page.waitForTimeout(50);
	const buf = await page.screenshot({ clip: { x: 0, y: 0, width: t.w, height: t.h } });
	writeFileSync(path.join(HERE, t.file), buf);
	console.log(`wrote ${t.file}`);
}

await browser.close();
