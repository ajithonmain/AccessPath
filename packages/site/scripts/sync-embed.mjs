import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, '../../embed/dist/embed.js');
const destDir = resolve(__dirname, '../public');
const dest = resolve(destDir, 'embed.js');

if (!existsSync(src)) {
  console.error('packages/embed/dist/embed.js not found — run `npm run build:embed` first.');
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('Synced embed.js into packages/site/public/embed.js');
