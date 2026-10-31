import { build } from 'esbuild';
import { rmSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs';

const STATIC = /\.(html|png|ico)$|^(ads|robots)\.txt$/;
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const f of readdirSync('.')) {
  if (STATIC.test(f) && f !== 'page.html') copyFileSync(f, `dist/${f}`);
}
await build({ entryPoints: ['src/worker.js'], bundle: true, format: 'esm', outfile: 'dist/_worker.js', platform: 'browser', target: 'es2022' });
writeFileSync('dist/_routes.json', JSON.stringify({ version: 1, include: ['/', '/api/*', '/ipo/*', '/schedule', '/sitemap.xml', '/google*.html', '/naver*.html'], exclude: [] }));
