import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { placeArticleEnd, placeArticleEndFiles } from './place-article-end.mjs';

const nav = '<nav class="article-end" aria-label="All writing"><a class="link-back" href="../../blog/">All writing</a></nav>';
const footnotes = '<section id="footnotes" class="footnotes" role="doc-endnotes"><ol><li id="fn1"><p>Note.</p></li></ol></section>';
const page = body => `<body><main class="content">\n<section id="one" class="level2">\n<p>Text.</p>\n${body}</section>\n</main> <!-- /main --></body>`;
const afterAppendix = html => html.slice(html.indexOf('</div>', html.indexOf('id="quarto-appendix"')));

test('moves the link after the appendix when the link is in the last body section', () => {
  const html = page(`\n${nav}\n`).replace('</main>', `<div id="quarto-appendix" class="default">${footnotes}</div></main>`);
  const result = placeArticleEnd(html);
  assert.ok(result.indexOf('id="footnotes"') < result.indexOf('class="article-end"'));
  assert.ok(result.indexOf('class="article-end"') < result.indexOf('</main>'));
  assert.equal(result.match(/class="article-end"/g).length, 1);
  assert.match(afterAppendix(result), /^<\/div>\s*<nav class="article-end"[^]*<\/nav>\s*<\/main>/);
});

test('moves the link out of a trailing appendix section', () => {
  const appendix = `<section id="extra" class="level2 appendix"><h2>Extra</h2><div class="quarto-appendix-contents"><p>More.</p>\n${nav}\n</div></section>`;
  const html = `<body><main class="content"><section id="one"><p>Text.</p></section><div id="quarto-appendix" class="default">${appendix}${footnotes}</div></main></body>`;
  const result = placeArticleEnd(html);
  const section = result.slice(result.indexOf('id="extra"'), result.indexOf('id="footnotes"'));
  assert.ok(!section.includes('article-end'));
  assert.ok(result.indexOf('id="footnotes"') < result.indexOf('class="article-end"'));
});

test('leaves pages without an appendix, without the link or without main untouched', () => {
  const plain = page(`\n${nav}\n`);
  assert.equal(placeArticleEnd(plain), plain);
  const noLink = page('').replace('</main>', `<div id="quarto-appendix">${footnotes}</div></main>`);
  assert.equal(placeArticleEnd(noLink), noLink);
  const noMain = `<body><div id="quarto-appendix">${footnotes}</div>${nav}</body>`;
  assert.equal(placeArticleEnd(noMain), noMain);
});

test('is idempotent', () => {
  const html = page(`\n${nav}\n`).replace('</main>', `<div id="quarto-appendix" class="default">${footnotes}</div></main>`);
  const once = placeArticleEnd(html);
  assert.equal(placeArticleEnd(once), once);
});

test('updates only the pages that need it and honors the Quarto output directory from the CLI', async t => {
  const outputDir = await mkdtemp(join(tmpdir(), 'site-article-end-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  await mkdir(join(outputDir, 'posts/a'), { recursive: true });
  const withAppendix = page(`\n${nav}\n`).replace('</main>', `<div id="quarto-appendix">${footnotes}</div></main>`);
  const plain = page(`\n${nav}\n`);
  await writeFile(join(outputDir, 'posts/a/index.html'), withAppendix);
  await writeFile(join(outputDir, 'posts/plain.html'), plain);
  await writeFile(join(outputDir, 'index.html'), '<body>No link.</body>');
  assert.equal(await placeArticleEndFiles(outputDir), 1);
  assert.equal(await readFile(join(outputDir, 'posts/a/index.html'), 'utf8'), placeArticleEnd(withAppendix));
  assert.equal(await readFile(join(outputDir, 'posts/plain.html'), 'utf8'), plain);
  assert.equal(await placeArticleEndFiles(outputDir), 0);

  await writeFile(join(outputDir, 'posts/a/index.html'), withAppendix);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./place-article-end.mjs', import.meta.url))], {
    cwd: tmpdir(),
    env: { ...process.env, QUARTO_PROJECT_OUTPUT_DIR: outputDir, QUARTO_PROJECT_SCRIPT_QUIET: '1' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(await readFile(join(outputDir, 'posts/a/index.html'), 'utf8'), placeArticleEnd(withAppendix));
});
