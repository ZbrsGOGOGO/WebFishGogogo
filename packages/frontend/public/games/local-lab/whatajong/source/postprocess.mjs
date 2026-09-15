// Whatajong MIT self-hosted adaptation, 2026-09-15. Deterministic text only.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postcss from 'postcss';

export function normalizeGameText(text) {
  return text.replace(/\r\n/g, '\n').replace(/[\t ]+$/gm, '').replace(/\n*$/, '\n');
}

export function assembleGameCss(generated, local) {
  // The CSS plugin may concatenate a closing rule and the next generated
  // selector with or without LF. Parse the fixed-lock PostCSS syntax tree
  // and normalize whitespace only between nodes after a closed block.
  // Declaration values, quoted content, comments and image bytes are untouched.
  const root = postcss.parse(generated);
  root.walk((node) => {
    const previous = node.prev();
    if (previous && Array.isArray(previous.nodes) && /^\s*$/.test(node.raws.before ?? '')) {
      node.raws.before = '\n';
    }
  });
  return normalizeGameText(`${root.toString()}\n${local}`);
}

// Run only as the explicit build step, never merely by importing this helper.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = fileURLToPath(new URL('./web-dist/', import.meta.url));
  const generated = readFileSync(resolve(output, 'webfish-whatajong-static-build.css'), 'utf8');
  const local = readFileSync(new URL('./local.css', import.meta.url), 'utf8');
  writeFileSync(resolve(output, 'game.css'), assembleGameCss(generated, local));
  const script = resolve(output, 'game.js');
  writeFileSync(script, normalizeGameText(readFileSync(script, 'utf8')));
}
