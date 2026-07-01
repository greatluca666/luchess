// client/build.mjs
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.join(__dirname, 'dist');

mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [
    path.join(__dirname, 'src/main.ts'),
    path.join(__dirname, 'src/game.ts'),
    path.join(__dirname, 'src/games.ts'),
  ],
  bundle: true,
  outdir,
  format: 'esm',
  platform: 'browser',
  sourcemap: true,
});

cpSync(path.join(__dirname, 'public'), outdir, { recursive: true });
cpSync(path.join(__dirname, 'node_modules/chessground/assets'), path.join(outdir, 'chessground'), {
  recursive: true,
});

console.log('client build complete:', outdir);
