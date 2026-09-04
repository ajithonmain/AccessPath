// Produces packages/wordpress/dist/accesspath.zip — the installable plugin.
// The zip's single top-level folder is `accesspath/`, which is what WordPress
// unpacks into wp-content/plugins/. Uses the system `zip` binary (present on
// macOS, Linux, and GitHub Actions runners) so there's no npm dependency.
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const pluginDir = resolve(pkgRoot, 'plugin');
const distDir = resolve(pkgRoot, 'dist');
const zipPath = resolve(distDir, 'accesspath.zip');
const stageDir = resolve(distDir, 'accesspath');

if (!existsSync(resolve(pluginDir, 'assets/embed.js'))) {
  console.error('plugin/assets/embed.js missing — run `npm run sync-embed` first.');
  process.exit(1);
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

// Stage a clean copy named `accesspath/` (WordPress uses the folder name as the
// plugin slug), excluding dev cruft.
execFileSync('rsync', [
  '-a',
  '--exclude', '.DS_Store',
  '--exclude', '*.map',
  pluginDir + '/',
  stageDir + '/',
]);

execFileSync('zip', ['-r', '-q', 'accesspath.zip', 'accesspath'], { cwd: distDir });
rmSync(stageDir, { recursive: true, force: true });

console.log('Built', zipPath);
