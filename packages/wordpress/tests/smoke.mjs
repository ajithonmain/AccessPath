/**
 * Playwright driver for tests/smoke.sh — runs against a live WordPress with the
 * AccessPath plugin activated. Exits non-zero on any failed check.
 *
 * BASE is passed in the environment by smoke.sh (default http://localhost:8883).
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8883';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin-pass-123';

let failures = 0;
const check = (label, cond) => {
	console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`);
	if (!cond) failures++;
};

const browser = await chromium.launch();
const page = await browser.newContext().then((c) => c.newPage());
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

const scriptData = () =>
	page.evaluate(() => {
		const s = document.querySelector('script[src*="accesspath"]');
		return s
			? {
					defer: s.hasAttribute('defer'),
					src: s.getAttribute('src'),
					data: [...s.attributes]
						.filter((a) => a.name.startsWith('data-'))
						.map((a) => `${a.name}=${a.value}`)
						.sort(),
			  }
			: null;
	});

console.log('front page (defaults)');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const def = await scriptData();
check('widget script present', !!def);
check('script has defer', def?.defer === true);
check('script is self-hosted from the plugin', /\/wp-content\/plugins\/accesspath\/assets\/embed\.js/.test(def?.src || ''));
check('no data-* attributes at defaults', (def?.data || []).length === 0);

await page.waitForTimeout(1200);
const mount = await page.evaluate(() => {
	const host = document.getElementById('accesspath-embed-host');
	const sr = host && host.shadowRoot;
	return { host: !!host, trigger: !!(sr && sr.querySelector('[class*="trigger"]')) };
});
check('embed host mounts', mount.host);
check('trigger button renders', mount.trigger);

await page.evaluate(() => {
	const sr = document.getElementById('accesspath-embed-host').shadowRoot;
	(sr.querySelector('[class*="trigger"]') || sr.querySelector('button')).click();
});
await page.waitForTimeout(500);
const dlg = await page.evaluate(
	() => document.getElementById('accesspath-embed-host').shadowRoot.querySelector('[role="dialog"]')?.getAttribute('aria-label') || null
);
check('panel dialog opens with a name', dlg === 'Accessibility settings');

console.log('admin: log in + settings page');
await page.goto(`${BASE}/wp-login.php`, { waitUntil: 'networkidle' });
await page.fill('#user_login', ADMIN_USER);
await page.fill('#user_pass', ADMIN_PASS);
await Promise.all([page.waitForNavigation(), page.click('#wp-submit')]);
check('logged into wp-admin', page.url().includes('/wp-admin'));

await page.goto(`${BASE}/wp-admin/options-general.php?page=accesspath`, { waitUntil: 'networkidle' });
const settings = await page.evaluate(() => ({
	h1: document.querySelector('.wrap h1')?.textContent?.trim(),
	position: !!document.querySelector('#position'),
	profiles: document.querySelectorAll('input[name*="[profiles]"]').length,
}));
check('settings page renders', settings.h1 === 'AccessPath');
check('has trigger position control', settings.position);
check('has 9 profile checkboxes', settings.profiles === 9);

console.log('admin: change + save');
await page.selectOption('#theme', 'dark');
await page.selectOption('#position', 'top-left');
await page.selectOption('#shape', 'pill');
await page.selectOption('#icon', 'motor');
await page.check('input[name$="[draggable]"]');
await page.fill('#brand', '#ff5500');
await page.check('input[name$="[show_checker]"]');
await page.check('input[name*="[profiles]"][value="low-vision"]');
await page.check('input[name*="[profiles]"][value="dyslexia"]');
await Promise.all([page.waitForNavigation(), page.click('#submit')]);
const saved = await page.evaluate(
	() => (document.querySelector('#setting-error-settings_updated, .notice-success')?.textContent || '').includes('saved')
);
check('settings saved notice shown', saved);

console.log('front page reflects settings');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const custom = (await scriptData())?.data || [];
const want = [
	'data-brand=#ff5500',
	'data-draggable=true',
	'data-icon=motor',
	'data-position=top-left',
	'data-profiles=low-vision,dyslexia',
	'data-sections=profiles,quick,controls,actions,audit',
	'data-shape=pill',
	'data-theme=dark',
];
check('all configured data-* attributes emitted', want.every((w) => custom.includes(w)) && custom.length === want.length);

console.log('disable toggle removes the widget');
await page.goto(`${BASE}/wp-admin/options-general.php?page=accesspath`, { waitUntil: 'networkidle' });
await page.uncheck('input[name$="[enabled]"]');
await Promise.all([page.waitForNavigation(), page.click('#submit')]);
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
check('no widget script when disabled', (await scriptData()) === null);

check('no browser console errors', consoleErrors.length === 0);
if (consoleErrors.length) console.log(consoleErrors);

await browser.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
