/**
 * Captures the two WordPress.org listing screenshots against a live WP install
 * (booted the same way as smoke.sh). Not part of the test suite — run manually
 * before a release via tests/screenshots.sh.
 *
 * BASE / OUT_DIR come from the environment (set by screenshots.sh).
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8883';
const OUT_DIR = process.env.OUT_DIR || '.';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin-pass-123';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

// Screenshot 1: front end, widget open.
await page.goto(`${BASE}/`);
await page.click('.accesspath-trigger');
await page.waitForSelector('.a11y-pnl', { state: 'visible' });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT_DIR}/screenshot-1.png` });
console.log('wrote screenshot-1.png (widget open)');

// Screenshot 2: wp-admin settings page.
await page.goto(`${BASE}/wp-login.php`);
await page.fill('#user_login', ADMIN_USER);
await page.fill('#user_pass', ADMIN_PASS);
await page.click('#wp-submit');
await page.waitForSelector('#wpadminbar');
await page.goto(`${BASE}/wp-admin/options-general.php?page=accesspath`);
await page.waitForSelector('form');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT_DIR}/screenshot-2.png`, fullPage: true });
console.log('wrote screenshot-2.png (settings page)');

await browser.close();
