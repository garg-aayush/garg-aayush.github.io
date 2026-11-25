import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { canonicalUrl, injectPageSeo, injectSeoFiles, normalizeSitemap } from './inject-seo-metadata.mjs';

test('canonicalUrl normalizes index.html paths to directory URLs and preserves named HTML files', () => {
  assert.equal(canonicalUrl('index.html'), 'https://aayushgarg.dev/');
  assert.equal(canonicalUrl('blog/index.html'), 'https://aayushgarg.dev/blog/');
  assert.equal(canonicalUrl('posts/2026-11-23-inkling2-mini-llamacpp/index.html'), 'https://aayushgarg.dev/posts/2026-11-23-inkling2-mini-llamacpp/');
  assert.equal(canonicalUrl('about.html'), 'https://aayushgarg.dev/about.html');
  assert.equal(canonicalUrl('tools/json-formatter.html'), 'https://aayushgarg.dev/tools/json-formatter.html');
});

test('injectPageSeo adds canonical, og tags and BlogPosting JSON-LD to posts and is idempotent', () => {
  const html = `<!doctype html><html><head>
<title>Test Post | Aayush Garg</title>
<meta name="author" content="Aayush Garg">
<meta name="dcterms.date" content="2026-11-23">
<meta name="description" content="A short description &amp; notes.">
<meta property="og:site_name" content="Aayush Garg">
<meta property="og:image" content="https://aayushgarg.dev/static/img/card.jpg">
</head><body><h1 class="title">Test Post</h1></body></html>`;

  const once = injectPageSeo(html, 'posts/2026-11-23-test/index.html');
  assert.match(once, /<link rel="canonical" href="https:\/\/aayushgarg\.dev\/posts\/2026-11-23-test\/">/);
  assert.match(once, /<meta property="og:url" content="https:\/\/aayushgarg\.dev\/posts\/2026-11-23-test\/">/);
  assert.match(once, /<meta property="og:type" content="article">/);
  assert.match(once, /<meta property="og:description" content="A short description &amp; notes\.">/);
  const ld = JSON.parse(once.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'BlogPosting');
  assert.equal(ld.headline, 'Test Post');
  assert.equal(ld.datePublished, '2026-11-23');
  assert.equal(ld.author.name, 'Aayush Garg');
  assert.equal(ld.image, 'https://aayushgarg.dev/static/img/card.jpg');

  assert.equal(injectPageSeo(once, 'posts/2026-11-23-test/index.html'), once);
});

test('injectPageSeo extracts Person sameAs links and role from index.html without hardcoded copy', () => {
  const html = `<!doctype html><html><head>
<title>Aayush Garg</title>
<meta name="description" content="Engineer bio.">
<meta property="og:site_name" content="Aayush Garg">
</head><body>
<img src="static/img/aayush-avatar.jpg" class="avatar">
<div class="hero-role"><p>Principal ML Engineer</p></div>
<a href="https://github.com/garg-aayush">GitHub</a>
<a href="https://www.linkedin.com/in/aayush-garg-8b26a734">LinkedIn</a>
<a href="https://twitter.com/Aayush_ander">X</a>
<a href="https://x.com/Aayush_ander">X</a>
<a href="https://github.com/garg-aayush/some-repo">Repo</a>
</body></html>`;

  const once = injectPageSeo(html, 'index.html');
  const ld = JSON.parse(once.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const person = ld['@graph'].find(node => node['@type'] === 'Person');
  assert.equal(person.jobTitle, 'Principal ML Engineer');
  assert.equal(person.image, 'https://aayushgarg.dev/static/img/aayush-avatar.jpg');
  assert.deepEqual(person.sameAs, [
    'https://github.com/garg-aayush',
    'https://www.linkedin.com/in/aayush-garg-8b26a734',
    'https://x.com/Aayush_ander',
  ]);
});

test('normalizeSitemap cleans index.html URLs, drops excluded URLs and appends extra tools', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://aayushgarg.dev/index.html</loc><lastmod>2026-11-24T00:00:00Z</lastmod></url>
  <url><loc>https://aayushgarg.dev/search/index.html</loc><lastmod>2026-11-24T00:00:00Z</lastmod></url>
  <url><loc>https://aayushgarg.dev/tools/index.html</loc><lastmod>2026-11-24T00:00:00Z</lastmod></url>
</urlset>`;
  const out = normalizeSitemap(xml, {
    exclude: new Set(['https://aayushgarg.dev/search/']),
    extra: [{ loc: 'https://aayushgarg.dev/tools/json-formatter.html', lastmod: '2026-11-25T00:00:00Z' }],
  });
  assert.match(out, /<loc>https:\/\/aayushgarg\.dev\/<\/loc>/);
  assert.match(out, /<loc>https:\/\/aayushgarg\.dev\/tools\/<\/loc>/);
  assert.match(out, /<loc>https:\/\/aayushgarg\.dev\/tools\/json-formatter\.html<\/loc>/);
  assert.doesNotMatch(out, /\/search\//);
  assert.doesNotMatch(out, /index\.html<\/loc>/);
});

test('injectSeoFiles updates pages and sitemap end-to-end while excluding noindex pages', async t => {
  const root = await mkdtemp(join(tmpdir(), 'site-seo-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'search'), { recursive: true });
  await mkdir(join(root, 'tools'), { recursive: true });
  await writeFile(join(root, 'search/index.html'), '<html><head><title>Search</title><meta name="robots" content="noindex, follow"></head><body></body></html>');
  await writeFile(join(root, 'tools/base64.html'), '<html><head><title>Base64</title><meta name="description" content="Encode base64."><link rel="canonical" href="https://aayushgarg.dev/tools/base64.html"></head><body><h1>Base64</h1></body></html>');
  await writeFile(join(root, 'sitemap.xml'), '<urlset><url><loc>https://aayushgarg.dev/search/index.html</loc></url><url><loc>https://aayushgarg.dev/tools/index.html</loc></url></urlset>');

  const res = await injectSeoFiles(root);
  assert.equal(res.pagesUpdated, 2);
  assert.equal(res.sitemapUpdated, true);

  const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
  assert.doesNotMatch(sitemap, /\/search\//);
  assert.match(sitemap, /https:\/\/aayushgarg\.dev\/tools\/base64\.html/);
  const toolHtml = await readFile(join(root, 'tools/base64.html'), 'utf8');
  assert.match(toolHtml, /"@type":"WebApplication"/);
});
