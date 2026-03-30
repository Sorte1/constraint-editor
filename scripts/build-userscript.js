import * as esbuild from "esbuild";
import sveltePlugin from "esbuild-svelte";

const outfile = "./build/krunker-constraint-editor.user.js";

const metadata = `// ==UserScript==
// @name         Krunker Constraint Editor
// @namespace    https://krunker.io/
// @version      0.1.0
// @description  In-editor TAS/pathfinding constraint
// @match        *://krunker.io/editor.html*
// @match        *://browserfps.com/editor.html*
// @match        http://localhost/*editor.html*
// @match        http://127.0.0.1/*editor.html*
// @match        file://*/*editor.html*
// @run-at       document-start
// @grant        none
// ==/UserScript==`;

await esbuild.build({
  entryPoints: ["index.js"],
  bundle: true,
  format: "iife",
  target: ["es2020"],
  platform: "browser",
  sourcemap: false,
  outfile,
  plugins: [
    sveltePlugin({
      compilerOptions: {
        css: "injected",
      },
    }),
  ],
  logLevel: "info",
});

const current = await Bun.file(outfile).text();
if (!current.startsWith(metadata)) {
  await Bun.write(outfile, `${metadata}\n\n${current}`);
}

console.log(`Built userscript at ${outfile}`);
