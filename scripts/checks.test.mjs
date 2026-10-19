import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { stringify } from 'yaml';
import { validatePost, checkPosts } from './check-posts.mjs';
import { checkSite, srcsetUrls } from './check-site.mjs';

const metadata = { title: 'Example', tags: ['AI'], categories: ['AI'], date: '2026-01-01', permalink: '/historical-route/', description: 'An example post.' };
const post = values => `---\n${stringify(values)}---\n\nContent.\n`;

test('post validation accepts existing metadata and rejects missing fields, bad YAML and invalid dates', () => {
  assert.deepEqual(validatePost(post(metadata), 'posts/example.qmd'), []);
  for (const field of Object.keys(metadata)) {
    const invalid = { ...metadata };
    delete invalid[field];
    assert.ok(validatePost(post(invalid), 'posts/example.qmd').some(error => error.includes(field)));
  }
  assert.ok(validatePost('No frontmatter.', 'example.qmd')[0].includes('frontmatter'));
  assert.ok(validatePost('---\ntitle: [broken\n---\n', 'example.qmd')[0].includes('invalid YAML'));
  assert.ok(validatePost(post({ ...metadata, date: '2026-02-30' }), 'example.qmd').some(error => error.includes('date')));
  assert.ok(validatePost(post({ ...metadata, categories: [] }), 'example.qmd').some(error => error.includes('categories')));
  assert.ok(validatePost(post({ ...metadata, permalink: 'https://example.com/' }), 'example.qmd').some(error => error.includes('permalink')));
});

test('post traversal includes old and directory posts and reports duplicate historical permalinks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'site-post-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'posts/new'), { recursive: true });
  await writeFile(join(root, 'posts/old.qmd'), post(metadata));
  await writeFile(join(root, 'posts/new/index.qmd'), post(metadata));
  const result = await checkPosts(root);
  assert.equal(result.count, 2);
  assert.ok(result.errors.some(error => error.includes('duplicate permalink')));
});

async function renderedFixture(t, extra = '') {
  const root = await mkdtemp(join(tmpdir(), 'site-render-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    'index.html': `<link href="style.css" rel="stylesheet"><script src="script.js"></script><a href="https://aayushgarg.dev/article.html?view=1#caf%C3%A9">Article</a><a href="https://garg-aayush.github.io/folder/#old">Legacy</a><a href="/article.html#:~:text=hello">Text fragment</a><img srcset="data:image/png;base64,AAAA 1x, image.svg 2x"><pre>&lt;img src="missing-example.png"&gt;</pre><a href="https://example.com/missing">External</a>${extra}`,
    'article.html': '<h1 id="café">Hello</h1><a name="named"></a>',
    'folder/index.html': '<h1 id="old">Old anchor</h1>',
    'style.css': '@import "extra.css"; .sample { background: url("image.svg?cache=1"); }',
    'extra.css': '/* url(ignored-example.png) */',
    'script.js': 'console.log("fixture");',
    'image.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'index.xml': '<rss><channel><link>https://aayushgarg.dev/</link><item><link>https://aayushgarg.dev/article.html#named</link><guid isPermaLink="false">https://garg-aayush.github.io/missing-opaque-id/</guid><description><![CDATA[<img src="/image.svg"><a href="/article.html#café">Article</a>]]></description></item></channel></rss>',
    'blog/index.xml': '<rss xmlns:atom="http://www.w3.org/2005/Atom"><channel><atom:link href="https://aayushgarg.dev/blog/index.xml"/><item><guid>opaque:any-value</guid></item></channel></rss>',
    'sitemap.xml': '<urlset><url><loc>https://aayushgarg.dev/article.html</loc><lastmod>2026-01-01</lastmod></url></urlset>',
  };
  for (const [name, text] of Object.entries(files)) {
    const path = join(root, name);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, text);
  }
  return root;
}

test('rendered validation resolves real routes, same-host URLs, anchors, CSS and feed descriptions while ignoring opaque GUIDs and examples', async t => {
  const root = await renderedFixture(t);
  const result = await checkSite(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.pages, 3);
});

test('rendered validation catches deliberate missing targets and fragments in HTML, CSS and RSS', async t => {
  const root = await renderedFixture(t, '<img src="missing.png"><a href="https://aayushgarg.dev/old-jekyll-route/">Old</a><a href="article.html#absent">Anchor</a><object data="missing.pdf"></object><a href="source.qmd">Unrewritten source</a>');
  await writeFile(join(root, 'extra.css'), '@import "missing.css"; .font { src: url(missing.woff2); }');
  await writeFile(join(root, 'blog/index.xml'), '<rss><channel><description><![CDATA[<img src="/rss-missing.png">]]></description></channel></rss>');
  const { errors } = await checkSite(root);
  for (const target of ['missing.png', 'old-jekyll-route', '#absent', 'missing.pdf', 'source.qmd', 'missing.css', 'missing.woff2', 'rss-missing.png']) assert.ok(errors.some(error => error.includes(target)), `${target}: ${errors.join('\n')}`);
});

test('rendered validation rejects malformed XML and missing required feeds', async t => {
  const root = await renderedFixture(t);
  await writeFile(join(root, 'index.xml'), '<rss><channel></rss>');
  await rm(join(root, 'blog/index.xml'));
  const { errors } = await checkSite(root);
  assert.ok(errors.some(error => error.includes('invalid XML')));
  assert.ok(errors.some(error => error.includes('blog/index.xml: required')));
});

test('srcset parsing preserves commas inside data URLs and handles width and density descriptors', () => {
  assert.deepEqual(srcsetUrls('small.png 1x, big.png 2x'), ['small.png', 'big.png']);
  assert.deepEqual(srcsetUrls('data:image/png;base64,AAAA 1x, wide.png 800w'), ['data:image/png;base64,AAAA', 'wide.png']);
  assert.deepEqual(srcsetUrls('first.png, second.png 2x'), ['first.png', 'second.png']);
});
