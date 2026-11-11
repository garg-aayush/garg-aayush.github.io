import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { VECTORS_VERSION, base64ToBytes, createEmbedder, dequantizeRows, parseVocab } from '../static/js/search-embed.js';
import { passages } from '../static/js/search-rank.js';
import { embedPassages, loadTable, writeSearchVectors } from './build-search-vectors.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const vocabText = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', '[MASK]', 'alpha', 'beta', 'gamma', 'delta'].join('\n') + '\n';
// Four dimensions, one row per vocabulary entry
const table = Int8Array.from({ length: 9 * 4 }, (_, i) => ((i * 37) % 101) - 50);

const data = { v: 1, hash: 'abc123', pages: [
  { h: 'a.html', t: 'Alpha', d: 'About alpha.', p: [['one', 'Beta', 'Gamma delta.']] },
  { h: 'b.html', t: 'Delta', d: 'About delta.', p: [] },
] };

async function fixture(t, { withTable = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'vectors-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const out = join(dir, 'site');
  const tableDir = join(dir, 'table');
  await mkdir(out);
  await mkdir(tableDir);
  await writeFile(join(out, 'search-index.json'), JSON.stringify(data));
  if (withTable) {
    const tableBytes = Buffer.from(table.buffer);
    await writeFile(join(tableDir, 'm.int8.bin'), tableBytes);
    await writeFile(join(tableDir, 'm.vocab.txt'), vocabText);
    const manifest = { model: { id: 'test/model', revision: 'r1' }, rows: 9, dimensions: 4, files: { table: { path: 'm.int8.bin', bytes: tableBytes.length, sha256: sha256(tableBytes) }, vocab: { path: 'm.vocab.txt', bytes: Buffer.byteLength(vocabText), sha256: sha256(vocabText) } } };
    await writeFile(join(tableDir, 'manifest.json'), JSON.stringify(manifest));
  }
  return { dir, out, tableDir };
}

test('embeds every passage of the index in index order, descriptions first, with title and heading', async t => {
  const { tableDir } = await fixture(t);
  const { embedder } = await loadTable(tableDir);
  const result = embedPassages(data, embedder);
  assert.deepEqual(result.texts, ['Alpha\nAbout alpha.', 'Alpha\nBeta\nGamma delta.', 'Delta\nAbout delta.']);
  assert.equal(result.texts.length, [...passages(data)].length);
  assert.equal(result.data.length, 3 * 4);
});

test('writes search-vectors.json with the hashes the page checks, and vectors that read back as unit rows', async t => {
  const { out, tableDir } = await fixture(t);
  const result = await writeSearchVectors(out, { tableDir });
  const file = JSON.parse(await readFile(join(out, 'search-vectors.json'), 'utf8'));
  assert.equal(file.v, VECTORS_VERSION);
  assert.equal(file.index, 'abc123');
  assert.equal(file.count, 3);
  assert.equal(file.dimensions, 4);
  assert.equal(file.model, 'test/model');
  assert.equal(file.table.rows, 9);
  assert.equal(file.table.path, 'static/search/m.int8.bin');
  assert.equal(file.table.sha256, sha256(Buffer.from(table.buffer)));
  assert.equal(file.vocab.sha256, sha256(vocabText));
  assert.equal(result.bytes, (await readFile(join(out, 'search-vectors.json'))).length);
  const bytes = base64ToBytes(file.vectors);
  assert.equal(bytes.length, file.count * file.dimensions);
  const rows = dequantizeRows(new Int8Array(bytes.buffer), file.dimensions, file.scale);
  for (let row = 0; row < file.count; row++) assert.ok(Math.abs(Math.hypot(...rows.subarray(row * 4, row * 4 + 4)) - 1) < 1e-5);
  // The same text embedded the same way matches its stored vector
  const embedder = createEmbedder({ vocab: parseVocab(vocabText), table, dimensions: 4 });
  const query = embedder.embed('Alpha\nAbout alpha.');
  const stored = rows.subarray(0, 4);
  assert.ok(query.reduce((sum, value, i) => sum + value * stored[i], 0) > 0.999);
});

test('is deterministic, so the same render gives the same file', async t => {
  const { out, tableDir } = await fixture(t);
  await writeSearchVectors(out, { tableDir });
  const first = await readFile(join(out, 'search-vectors.json'), 'utf8');
  await writeSearchVectors(out, { tableDir });
  assert.equal(await readFile(join(out, 'search-vectors.json'), 'utf8'), first);
});

test('a table that does not match its manifest is an error, never used', async t => {
  const { out, tableDir } = await fixture(t);
  await writeFile(join(tableDir, 'm.int8.bin'), Buffer.from(table.map(value => value + 1).buffer));
  await assert.rejects(writeSearchVectors(out, { tableDir }), /does not match static\/search\/manifest\.json/);
});

test('a partial render skips a missing index or table, a full render fails on them', async t => {
  const none = await fixture(t, { withTable: false });
  assert.equal(await writeSearchVectors(none.out, { tableDir: none.tableDir }), null);
  await assert.rejects(writeSearchVectors(none.out, { tableDir: none.tableDir, complete: true }), { code: 'ENOENT' });
  const { dir, tableDir } = await fixture(t);
  const empty = join(dir, 'empty');
  await mkdir(empty);
  assert.equal(await writeSearchVectors(empty, { tableDir }), null);
  await assert.rejects(writeSearchVectors(empty, { tableDir, complete: true }), { code: 'ENOENT' });
});

test('runs from the CLI against the committed table and honors the Quarto output directory', async t => {
  const { out } = await fixture(t, { withTable: false });
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./build-search-vectors.mjs', import.meta.url))], {
    cwd: tmpdir(),
    env: { ...process.env, QUARTO_PROJECT_OUTPUT_DIR: out, QUARTO_PROJECT_SCRIPT_QUIET: '1' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  const file = JSON.parse(await readFile(join(out, 'search-vectors.json'), 'utf8'));
  assert.equal(file.index, 'abc123');
  assert.equal(file.dimensions, 256);
  assert.equal(file.count, 3);
  assert.equal(file.table.rows, 29528);
});
