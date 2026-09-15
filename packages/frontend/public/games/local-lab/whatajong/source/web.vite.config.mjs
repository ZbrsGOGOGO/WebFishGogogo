import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
const rootPath = fileURLToPath(new URL('./src/renderer', import.meta.url));
export default defineConfig({
  root: rootPath, base: './', resolve: { alias: { '@solidjs/router': `${rootPath}/vendor/solid-router/index.jsx`, '@': rootPath } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [solid(), vanillaExtractPlugin(), {
    name: 'webfish-runtime-module-inventory',
    generateBundle(_, bundle) {
      const modules = Object.values(bundle).filter((entry) => entry.type === 'chunk').flatMap((entry) => Object.entries(entry.modules).filter(([, info]) => info.renderedLength > 0).map(([id]) => id.replace(fileURLToPath(new URL('./', import.meta.url)), '')));
      this.emitFile({ type: 'asset', fileName: 'bundle-modules.json', source: JSON.stringify(modules, null, 2) });
    }
  }],
  build: {
    outDir: fileURLToPath(new URL('./web-dist', import.meta.url)), emptyOutDir: true,
    minify: false, sourcemap: false,
    lib: { entry: `${rootPath}/index.tsx`, name: 'WhatajongApp', formats: ['iife'], fileName: () => 'game.js' },
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
});
