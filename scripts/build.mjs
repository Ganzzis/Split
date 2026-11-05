import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
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

if (process.argv.includes('--native')) {
 const { build } = await import('esbuild');
 await build({ entryPoints: [join(root, 'native/index.mjs')], bundle: true, outfile: join(output, 'native.js'), format: 'iife', target: ['safari16', 'chrome100'] });
 await cp(join(root, 'native/native.css'), join(output, 'native.css'));
 const file = join(output, 'index.html');
 const html = await readFile(file, 'utf8');
 await writeFile(file, html.replace('</head>', '<link rel="stylesheet" href="native.css"></head>').replace('</body>', '<script src="native.js" defer></script></body>'));
}
