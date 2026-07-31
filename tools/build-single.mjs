/* ============================================================
   Build one self-contained .html file.

   The game already has no runtime assets — no textures, models
   or audio files — so the only things standing between it and a
   double-clickable file are:

     1. `import * as THREE from 'three'` is a bare specifier that
        browsers cannot resolve on their own,
     2. `<script type="module">` is blocked over file:// because
        module scripts are subject to CORS and file:// is an
        opaque origin,
     3. the Google Fonts <link>.

   Bundling to a classic IIFE script solves 1 and 2; inlining or
   dropping the font link solves 3.

   Output: dist-single/claudemary-llmaci.html
   ============================================================ */

import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist-single');
const TMP = path.join(ROOT, '.single-tmp');

const EMBED_FONTS = !process.argv.includes('--no-fonts');

fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(OUT, { recursive: true, force: true });

await build({
  root: ROOT,
  logLevel: 'warn',
  build: {
    outDir: TMP,
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: { polyfill: false },
    /* Still `rollupOptions` on Vite 8, which bundles with rolldown rather than
       rollup — the key is kept as an alias and everything below is honoured.
       `inlineDynamicImports: true` used to live here and has been removed: it is
       implied by the `iife` format's `codeSplitting: false`, and rolldown warns
       on every build that it is being ignored. The single-file guarantee does
       not rest on it either way — this script asserts "external refs: none"
       against the finished HTML, which is the property that actually matters. */
    rollupOptions: {
      output: {
        // A classic script, not a module: this is the bit that makes
        // file:// work at all.
        format: 'iife',
        entryFileNames: 'bundle.js',
        assetFileNames: 'bundle.[ext]',
      },
    },
  },
});

let html = fs.readFileSync(path.join(TMP, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(TMP, 'bundle.js'), 'utf8');
const cssPath = path.join(TMP, 'bundle.css');
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';

/* ---- fonts ----
 *
 * There used to be a hand-written table of woff2 paths here, read off disk and
 * base64'd into a <style> block. It is gone, deliberately: the faces are now
 * imported by `src/ui/styles.css`, so Vite resolves them, and `assetsInlineLimit`
 * above (100MB — "inline everything") turns them into data: URLs inside
 * `bundle.css` on the way past.
 *
 * One list of weights, in the stylesheet that actually uses them, instead of two
 * lists that could disagree — and they DID: the old table embedded five faces
 * while the stylesheet asks for six, so Fredoka 700 was quietly being synthesised
 * by the browser in the one-file build while the hosted build would have drawn
 * the real thing.
 *
 * `--no-fonts` therefore strips the @font-face rules back out rather than
 * declining to add them. */
let styleCss = css;
let faceCount = (css.match(/@font-face/g) || []).length;
if (!EMBED_FONTS) {
  styleCss = css.replace(/@font-face\s*\{[^}]*\}/g, '');
  faceCount = 0;
} else if (!faceCount) {
  console.warn('! no @font-face in the bundle — falling back to system fonts.');
  console.warn('  npm i @fontsource/baloo-2 @fontsource/fredoka');
}

// strip every external reference
html = html.replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g, '');
html = html.replace(/<link[^>]+rel="preconnect"[^>]*>\s*/g, '');
html = html.replace(/<link[^>]+rel="stylesheet"[^>]*>\s*/g, '');
// NOTE: function replacers, not template strings. String.replace treats `$&`,
// `$'` etc. in a replacement STRING as pattern references, and minified
// three.js uses `$` as a variable name — `$&&` silently became `</body>&&`.
html = html.replace('</head>', () => `<style>\n${styleCss}\n</style>\n</head>`);
// inline the bundle as a classic script
html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>\s*/g, '');
html = html.replace('</body>', () => `<script>\n${js}\n</script>\n</body>`);

fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, 'claudemary-llmaci.html');
fs.writeFileSync(outFile, html);
fs.rmSync(TMP, { recursive: true, force: true });

const bytes = fs.statSync(outFile).size;
const leftovers = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]*"/g)].map((m) => m[0]);
console.log(`\n${path.relative(ROOT, outFile)}  ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`fonts embedded : ${faceCount ? `yes (${faceCount} faces)` : 'no (system fallback)'}`);
console.log(`external refs  : ${leftovers.length ? leftovers.join(', ') : 'none'}`);
