import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { preserveFeedFiles, preserveFeedGuids } from './preserve-feed-guids.mjs';

const canonical = 'https://aayushgarg.dev';
const previous = 'https://garg-aayush.github.io';
const existingPath = '/posts/2026-03-27-flash-attention/';
const oldPath = '/posts/2024-05-19-manage-multiple-cuda.html';
const futurePath = '/posts/2099-01-01-new-post/';
const item = (path, attrs = '') => `<item><link>${canonical}${path}</link><guid${attrs}>${canonical}${path}</guid></item>`;
const feed = `<rss><channel><link>${canonical}/</link>${item(existingPath)}${item(oldPath, ' isPermaLink="true"')}${item(futurePath)}</channel></rss>`;

test('preserves published directory and HTML identities without changing links or future IDs', () => {
  const result = preserveFeedGuids(feed);
  assert.ok(result.includes(`<guid isPermaLink="false">${previous}${existingPath}</guid>`));
  assert.ok(result.includes(`<guid isPermaLink="false">${previous}${oldPath}</guid>`));
  assert.ok(result.includes(`<link>${canonical}${existingPath}</link>`));
  assert.ok(result.includes(item(futurePath)));
  assert.equal(preserveFeedGuids(result), result);
});

test('preserves all recorded IDs, and leaves descriptions, comments and unrelated GUIDs intact', async () => {
  const legacyGuids = JSON.parse(await readFile(new URL('./legacy-feed-guids.json', import.meta.url), 'utf8'));
  assert.equal(legacyGuids.length, 24);
  assert.equal(new Set(legacyGuids).size, legacyGuids.length);
  for (const guid of legacyGuids) {
    const generated = `<guid>${canonical}${new URL(guid).pathname}</guid>`;
    assert.equal(preserveFeedGuids(generated), `<guid isPermaLink="false">${guid}</guid>`);
  }
  const content = `<description>&lt;guid&gt;${canonical}${existingPath}&lt;/guid&gt;</description><![CDATA[<guid>${canonical}${existingPath}</guid>]]><!-- <guid>${canonical}${existingPath}</guid> -->`;
  assert.equal(preserveFeedGuids(content), content);
  const external = `<guid>https://example.com${existingPath}</guid>`;
  assert.equal(preserveFeedGuids(external), external);
});

test('handles both feeds and partial output, but rejects missing feeds for a full render', async t => {
  const outputDir = await mkdtemp(join(tmpdir(), 'site-feed-test-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  assert.equal(await preserveFeedFiles(outputDir), 0);
  await assert.rejects(preserveFeedFiles(outputDir, { requireFeeds: true }), { code: 'ENOENT' });
  await writeFile(join(outputDir, 'index.xml'), feed);
  assert.equal(await preserveFeedFiles(outputDir), 1);
  await mkdir(join(outputDir, 'blog'));
  await writeFile(join(outputDir, 'blog/index.xml'), feed);
  assert.equal(await preserveFeedFiles(outputDir, { requireFeeds: true }), 2);
  for (const path of ['index.xml', 'blog/index.xml']) {
    assert.equal(await readFile(join(outputDir, path), 'utf8'), preserveFeedGuids(feed));
  }
});

test('CLI honors Quarto output directory from a different working directory', async t => {
  const outputDir = await mkdtemp(join(tmpdir(), 'site-feed-cli-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  await writeFile(join(outputDir, 'index.xml'), feed);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./preserve-feed-guids.mjs', import.meta.url))], {
    cwd: tmpdir(),
    env: { ...process.env, QUARTO_PROJECT_OUTPUT_DIR: outputDir, QUARTO_PROJECT_RENDER_ALL: '', QUARTO_PROJECT_SCRIPT_QUIET: '1' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(await readFile(join(outputDir, 'index.xml'), 'utf8'), preserveFeedGuids(feed));
});
