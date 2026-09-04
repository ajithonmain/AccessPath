// Copies the built embed IIFE from packages/embed/dist into the plugin's assets
// folder so the plugin ships a self-hosted copy (no hard dependency on a CDN).
// The copied file is gitignored and must be regenerated after any embed change:
//   npm run build:embed && npm run build -w @accesspath/wordpress
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../embed/dist/embed.js');
const destDir = resolve(here, '../plugin/assets');
const dest = resolve(destDir, 'embed.js');

if (!existsSync(src)) {
  console.error('packages/embed/dist/embed.js not found — run `npm run build:embed` first.');
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('Synced embed.js into packages/wordpress/plugin/assets/embed.js');
