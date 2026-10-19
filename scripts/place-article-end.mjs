import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
const endLink = /[ \t]*<nav class="article-end"[^>]*>[\s\S]*?<\/nav>[ \t]*\n?/;

// Quarto appends its appendix (references, footnotes, appendix sections) to the end of <main> after every filter has run, so _filters/article.lua can only put the "All writing" link before it. Move the link to the end of <main> when the page has an appendix.
export function placeArticleEnd(html) {
  const link = html.match(endLink);
  if (!link || !html.includes('<div id="quarto-appendix"')) return html;
  const rest = html.replace(endLink, '');
  const close = rest.lastIndexOf('</main>');
  if (close === -1) return html;
  const placed = `${rest.slice(0, close).trimEnd()}\n\n${link[0].trim()}\n\n${rest.slice(close)}`;
  return placed === html ? html : placed;
}

export async function placeArticleEndFiles(outputDir) {
  let updated = 0;
  for (const name of await readdir(outputDir, { recursive: true })) {
    if (!name.endsWith('.html')) continue;
    const path = join(outputDir, name);
    const html = await readFile(path, 'utf8');
    if (!html.includes('class="article-end"')) continue;
    const placed = placeArticleEnd(html);
    if (placed !== html) {
      await writeFile(path, placed);
      updated++;
    }
  }
  return updated;
}

if (import.meta.main) {
  const outputDir = resolve(projectDir, process.argv[2] ?? process.env.QUARTO_PROJECT_OUTPUT_DIR ?? '_site');
  const updated = await placeArticleEndFiles(outputDir);
  if (process.env.QUARTO_PROJECT_SCRIPT_QUIET !== '1') {
    console.log(`Place article end links: ${updated} pages updated`);
  }
}
