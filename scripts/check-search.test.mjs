import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { writeSearchIndex } from './build-search-index.mjs';
import { writeSearchVectors } from './build-search-vectors.mjs';
import { checkSearch } from './check-site.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const vocabText = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', '[MASK]', 'alpha', 'beta', 'gamma', 'delta'].join('\n') + '\n';
const table = Int8Array.from({ length: 9 * 4 }, (_, i) => ((i * 37) % 101) - 50);
const listing = [
  { title: 'Alpha', href: 'a.html', section: 'Work', description: 'About alpha' },
  { title: 'Beta', href: 'b.html', section: 'Work', description: 'About beta' },
];
const records = list => `<html><body><script type="application/json" class="search-records">${JSON.stringify(list)}</script></body></html>`;
const page = text => `<main id="quarto-document-content"><p>${text}</p></main>`;

// A rendered site with the search page, the pages it lists, the table in static/search and both search files, built the way the post-render steps build them
async function site(t) {
  const dir = await mkdtemp(join(tmpdir(), 'check-search-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'search'));
  await mkdir(join(dir, 'static/search'), { recursive: true });
  await writeFile(join(dir, 'search/index.html'), records(listing));
  await writeFile(join(dir, 'a.html'), page('Alpha gamma words.'));
  await writeFile(join(dir, 'b.html'), page('Beta delta words.'));
  const tableBytes = Buffer.from(table.buffer);
  await writeFile(join(dir, 'static/search/m.int8.bin'), tableBytes);
  await writeFile(join(dir, 'static/search/m.vocab.txt'), vocabText);
  await writeFile(join(dir, 'static/search/manifest.json'), JSON.stringify({ model: { id: 'test/model', revision: 'r1' }, rows: 9, dimensions: 4, files: { table: { path: 'm.int8.bin', bytes: tableBytes.length, sha256: sha256(tableBytes) }, vocab: { path: 'm.vocab.txt', bytes: Buffer.byteLength(vocabText), sha256: sha256(vocabText) } } }));
  await rebuild(dir);
  return dir;
}
async function rebuild(dir) {
  await writeSearchIndex(dir, { complete: true });
  await writeSearchVectors(dir, { complete: true, tableDir: join(dir, 'static/search') });
}
const edit = async (dir, name, change) => {
  const value = JSON.parse(await readFile(join(dir, name), 'utf8'));
  change(value);
  await writeFile(join(dir, name), JSON.stringify(value));
};

test('a render with the index, the vectors and the table in agreement passes', async t => {
  const result = await checkSearch(await site(t));
  assert.deepEqual(result.errors, []);
  assert.equal(result.pages, 2);
  assert.equal(result.passages, 4);
});

test('fails when the search index or the vectors are missing', async t => {
  const dir = await site(t);
  await rm(join(dir, 'search-vectors.json'));
  assert.ok((await checkSearch(dir)).errors.some(error => error.startsWith('search-vectors.json: required rendered output is missing')));
  await rm(join(dir, 'search-index.json'));
  assert.ok((await checkSearch(dir)).errors.some(error => error.startsWith('search-index.json: required rendered output is missing')));
});

test('fails when the index does not cover a page the search page lists, or lists one that is gone', async t => {
  const dir = await site(t);
  await writeFile(join(dir, 'search/index.html'), records([...listing, { title: 'Gamma', href: 'c.html', section: 'Work', description: 'New post' }]));
  assert.ok((await checkSearch(dir)).errors.some(error => error.includes('c.html is listed on the search page but is not indexed')));
  await writeFile(join(dir, 'search/index.html'), records(listing.slice(0, 1)));
  assert.ok((await checkSearch(dir)).errors.some(error => error.includes('2 pages indexed but 1 listed')));
});

test('fails when a listed page was indexed with no text', async t => {
  const dir = await site(t);
  await writeFile(join(dir, 'b.html'), '<main id="quarto-document-content"></main>');
  await rebuild(dir);
  assert.ok((await checkSearch(dir)).errors.some(error => error.includes('b.html has no passages')));
});

test('fails when the vectors were made for another index, for a page that has since been edited', async t => {
  const dir = await site(t);
  await writeFile(join(dir, 'a.html'), page('Alpha completely different words.'));
  await writeSearchIndex(dir, { complete: true });
  const errors = (await checkSearch(dir)).errors;
  assert.ok(errors.some(error => error.includes('made for index') && error.includes('the index is')), errors.join('\n'));
});

test('fails when the vectors do not belong to the index text even though their hash was copied', async t => {
  const dir = await site(t);
  const vectors = JSON.parse(await readFile(join(dir, 'search-vectors.json'), 'utf8'));
  await edit(dir, 'search-vectors.json', value => { value.vectors = Buffer.from(Buffer.from(value.vectors, 'base64').map(byte => (byte + 5) % 256)).toString('base64'); });
  assert.ok(vectors.vectors);
  assert.ok((await checkSearch(dir)).errors.some(error => error.includes('not what the index text and the table give')));
});

test('fails when the vector count, the table pointer or the table file do not match', async t => {
  const dir = await site(t);
  await edit(dir, 'search-vectors.json', value => { value.count = 3; });
  assert.ok((await checkSearch(dir)).errors.some(error => error.includes('3 vectors for 4 passages')));
  await rebuild(dir);
  await edit(dir, 'search-vectors.json', value => { value.table.sha256 = '0'.repeat(64); });
  assert.ok((await checkSearch(dir)).errors.some(error => error.includes('its table is not the one')));
  await rebuild(dir);
  await writeFile(join(dir, 'static/search/m.int8.bin'), Buffer.from(table.map(value => value + 1).buffer));
  assert.ok((await checkSearch(dir)).errors.some(error => error.includes('does not match its hash in manifest.json')));
});

test('fails on a version the page does not read', async t => {
  const dir = await site(t);
  await edit(dir, 'search-vectors.json', value => { value.v = 99; });
  assert.ok((await checkSearch(dir)).errors.some(error => error.includes('version 99')));
  await rebuild(dir);
  await edit(dir, 'search-index.json', value => { value.v = 99; });
  assert.ok((await checkSearch(dir)).errors.some(error => error.includes('search-index.json: version 99')));
});
