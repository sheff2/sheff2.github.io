/**
 * Copy the onnxruntime-web wasm runtime into public/ort/ so the wake-word
 * exhibit can load it from same-origin (`ort.env.wasm.wasmPaths = '/ort/'`).
 * Run: npm run prepare:ort  (also runs automatically before `astro build`).
 *
 * Only the plain single-threaded SIMD artifacts are needed — GitHub Pages
 * sends no COOP/COEP headers, so threaded/JSEP variants can't be used.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const dest = join(root, 'public', 'ort');
mkdirSync(dest, { recursive: true });

const files = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];
for (const f of files) {
  copyFileSync(join(src, f), join(dest, f));
  console.log(`copied ${f} -> public/ort/`);
}
