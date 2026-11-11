import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildSearchIndex, decodeEntities, extractPassages, hashPages, mathToText, pageKey, parseHtml, writeSearchIndex, SCHEMA_VERSION } from './build-search-index.mjs';

const quarto = body => `<html><body><nav id="TOC">Page contents</nav><main class="content" id="quarto-document-content">
<header id="title-block-header" class="quarto-title-block"><h1 class="title">Post title</h1><div class="description">Header words</div><p class="article-byline">Aayush Garg 8 min read</p></header>
<nav class="article-toc-mobile" aria-label="Contents"><details><summary>Contents</summary><ul><li><a href="#one">One</a></li></ul></details></nav>
${body}
<nav class="article-end" aria-label="All writing"><a class="link-back" href="../../blog/">All writing</a></nav>
</main><footer class="nav-footer">Site footer</footer><script>var tracker = 1;</script></body></html>`;

const texts = passages => passages.map(passage => passage[2]).join('\n');

test('keeps the article and drops site chrome, scripts and interface text', () => {
  const html = quarto(`<p>Intro words.</p>
<section id="one" class="level2"><h2 class="anchored">One</h2>
<p>Body of one.<sup><a href="#fn1" class="footnote-ref" id="fnref1" role="doc-noteref">1</a></sup></p>
<div id="listing-x" class="quarto-listing"><div class="listing-no-matching d-none">No matching items</div></div>
<figure class="quarto-figure"><img src="a.png" alt="A plot of loss"><figcaption>Figure 1: Loss falls.</figcaption></figure>
<div class="code-copy-outer-scaffold"><button title="Copy to Clipboard" class="code-copy-button"><i class="bi"></i></button></div>
<style>.x { color: red }</style>
</section>
<section id="footnotes" class="footnotes"><ol><li id="fn1"><p>A footnote.<a href="#fnref1" class="footnote-back" role="doc-backlink">↩︎</a></p></li></ol></section>`);
  const all = texts(extractPassages(html));
  for (const chrome of ['Post title', 'Header words', 'min read', 'Contents', 'All writing', 'Page contents', 'Site footer', 'tracker', 'No matching items', 'Copy to Clipboard', 'color: red', '↩︎']) assert.ok(!all.includes(chrome), chrome);
  for (const kept of ['Intro words.', 'Body of one.', 'A plot of loss', 'Figure 1: Loss falls.', 'A footnote.']) assert.ok(all.includes(kept), kept);
  assert.ok(!/Body of one\.1/.test(all), 'footnote marker stays out');
});

test('splits by section with anchors and headings, and keeps the text before the first heading', () => {
  const html = quarto(`<p>Before any heading.</p>
<section id="first-part" class="level2"><h2 class="anchored">First part</h2><p>Alpha.</p>
<section id="inner-part" class="level3"><h3 class="anchored">Inner part</h3><p>Beta.</p><h4>Deep heading</h4><p>Gamma.</p></section>
</section>
<section id="second" class="level2"><h2 class="anchored">Second</h2></section>`);
  assert.deepEqual(extractPassages(html), [
    ['', '', 'Before any heading.'],
    ['first-part', 'First part', 'Alpha.'],
    ['inner-part', 'Inner part', 'Beta.\nDeep heading\nGamma.'],
    ['second', 'Second', ''],
  ]);
});

test('splits a long section at paragraph boundaries and never inside one', () => {
  const paragraph = n => `<p>${`Paragraph ${n} `.repeat(30).trim()}</p>`;
  const html = quarto(`<section id="long" class="level2"><h2>Long</h2>${[1, 2, 3, 4, 5].map(paragraph).join('')}</section>`);
  const passages = extractPassages(html);
  assert.ok(passages.length > 1);
  for (const [anchor, heading, text] of passages) {
    assert.equal(anchor, 'long');
    assert.equal(heading, 'Long');
    assert.ok(text.length <= 1000);
    for (const line of text.split('\n')) assert.match(line, /^Paragraph \d( Paragraph \d)*$/);
  }
  assert.equal(passages.flatMap(passage => passage[2].split('\n')).length, 5);
});

test('shows inline math as readable text and keeps formula and code words out of the prose', () => {
  const html = quarto(`<section id="m" class="level2"><h2>Math</h2>
<p>The policy <span class="math inline">\\(\\pi_\\theta(a \\mid s)\\)</span> maps <span class="math inline">\\(N \\times N\\)</span> and <span class="math inline">\\(\\text{CO}_2\\)</span>.</p>
<p><span class="math display">\\[\\operatorname{softmax}(x_i) = \\frac{e^{x_i}}{\\sum_j e^{x_j}}\\]</span></p>
<div class="sourceCode"><pre class="sourceCode bash"><code class="sourceCode bash"><span id="cb1-1"><a href="#cb1-1" aria-hidden="true" tabindex="-1"></a>llama-server <span class="at">--parallel</span> 2</span></code></pre></div>
</section>`);
  const [[, , text, code]] = extractPassages(html);
  assert.equal(text, 'The policy π_θ(a s) maps N × N and CO_2.');
  assert.ok(!text.includes('softmax') && !text.includes('llama-server'));
  assert.deepEqual(code.split(' ').sort(), ['--parallel', '2', 'CO', 'llama-server', 'pi', 'softmax', 'theta'].sort());
  assert.equal(mathToText('\\frac{a}{b} \\leq \\sqrt{x}'), '(a)/(b) ≤ √(x)');
});

test('indexes a standalone tool page from its visible text and leaves out its scripts and back link', () => {
  const html = `<!DOCTYPE html><html><head><title>Tool</title><style>.x{}</style></head><body>
<div class="page"><div class="header"><h1>Tool title</h1><div class="back"><a href="./">&larr; Back to Tools</a></div></div>
<div class="dropzone">Click or drag &amp; drop an image <span class="formats">PNG, JPEG</span></div>
<label for="q">Quality</label><input id="q" type="range"><input type="text" placeholder="Search keys and values">
<button class="btn">Download</button><textarea>hidden sample</textarea><div hidden>Not shown</div></div>
<script>document.title = "x";</script></body></html>`;
  const passages = extractPassages(html);
  assert.equal(passages.length, 1);
  assert.deepEqual(passages[0].slice(0, 2), ['', '']);
  for (const word of ['Click or drag & drop an image', 'PNG, JPEG', 'Quality', 'Search keys and values', 'Download']) assert.ok(passages[0][2].includes(word), word);
  for (const word of ['Tool title', 'Back to Tools', 'document.title', 'hidden sample', 'Not shown']) assert.ok(!passages[0][2].includes(word), word);
});

test('parses void elements, raw text, entities and implied end tags', () => {
  const tree = parseHtml('<ul><li>One<li>Two &amp; &#x41;</ul><p>A<br>B<script>if (a < b) {}</script><p>C<img alt="x">');
  const items = tree.children[0].children;
  assert.equal(items.length, 2);
  assert.equal(decodeEntities('Two &amp; &#x41; &larr; &unknown;'), 'Two & A ← &unknown;');
  assert.equal(tree.children.length, 3);
  assert.equal(pageKey('tools/'), 'tools/index.html');
  assert.equal(pageKey('/posts/a/index.html#x'), 'posts/a/index.html');
});

async function site(t, files) {
  const outputDir = await mkdtemp(join(tmpdir(), 'site-search-index-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(outputDir, name, '..'), { recursive: true });
    await writeFile(join(outputDir, name), content);
  }
  return outputDir;
}

const records = list => `<script type="application/json" class="search-records">${JSON.stringify(list)}</script>`;
const listing = [
  { title: 'Alpha &amp; Omega', href: 'a.html', section: 'Work', description: 'About <em>alpha</em>', body: true },
  { title: 'Gone', href: 'gone/', section: 'Work', description: 'Not rendered', body: true },
  { title: 'Weather', href: 'weather.html', section: 'Work', description: 'A map', body: false },
];
const page = '<main id="quarto-document-content"><p>Alpha body.</p></main>';

test('builds the index from the pages the search page lists, skipping absent pages in a partial render', async t => {
  const dir = await site(t, { 'search/index.html': records(listing), 'a.html': page, 'weather.html': '<main id="quarto-document-content"><p>Map controls.</p></main>' });
  const index = await buildSearchIndex(dir);
  assert.equal(index.v, SCHEMA_VERSION);
  assert.deepEqual(index.missing, ['gone/index.html']);
  assert.deepEqual(index.pages, [
    { h: 'a.html', t: 'Alpha & Omega', d: 'About alpha', p: [['', '', 'Alpha body.']] },
    { h: 'weather.html', t: 'Weather', d: 'A map', p: [] },
  ]);
  assert.equal(index.hash, hashPages(index.pages));
  assert.equal(index.hash, (await buildSearchIndex(dir)).hash);
});

test('a full render with a listed page or the search page missing is an error, a partial render is not', async t => {
  const dir = await site(t, { 'search/index.html': records(listing), 'a.html': page });
  await assert.rejects(buildSearchIndex(dir, { complete: true }), /gone\/index\.html/);
  const empty = await site(t, { 'a.html': page });
  assert.equal(await buildSearchIndex(empty), null);
  assert.equal(await writeSearchIndex(empty), null);
  await assert.rejects(buildSearchIndex(empty, { complete: true }), { code: 'ENOENT' });
});

test('writes search-index.json and honors the Quarto output directory from the CLI', async t => {
  const dir = await site(t, { 'search/index.html': records(listing.slice(0, 1)), 'a.html': page });
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./build-search-index.mjs', import.meta.url))], {
    cwd: tmpdir(),
    env: { ...process.env, QUARTO_PROJECT_OUTPUT_DIR: dir, QUARTO_PROJECT_SCRIPT_QUIET: '1' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  const written = JSON.parse(await readFile(join(dir, 'search-index.json'), 'utf8'));
  assert.equal(written.pages[0].p[0][2], 'Alpha body.');
  assert.equal(written.missing, undefined);
});
