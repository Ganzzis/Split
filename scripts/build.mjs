import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'www');
// Explicit allowlist: never ship tests, source control, dependencies or local files.
const assets = [
  'index.html', 'style.css', 'core.js', 'history.js', 'items-core.js',
  'items-ui.js', 'ui-shell.js', 'reports.js', 'share-ui.js', 'script.js',
  'pwa.js', 'sw.js', 'manifest.json', 'icons'
];
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const asset of assets) await cp(join(root, asset), join(output, asset), { recursive: true });
console.log('Static application copied to www/');
