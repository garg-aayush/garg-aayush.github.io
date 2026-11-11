import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VECTORS_VERSION, bytesToBase64, createEmbedder, parseVocab, passageText, quantizeRows } from '../static/js/search-embed.js';
import { passages } from '../static/js/search-rank.js';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// One int8 vector per passage of search-index.json, in the order createIndex numbers its passages. rows is the matrix as floats and texts is what was embedded.
export function embedPassages(data, embedder) {
  const texts = [...passages(data)].map(({ page, heading, text }) => passageText(data.pages[page].t, heading, text));
  const floats = new Float32Array(texts.length * embedder.dimensions);
  texts.forEach((text, row) => floats.set(embedder.embed(text), row * embedder.dimensions));
  return { texts, floats, ...quantizeRows(floats) };
}

// Reads the committed table (static/search) and checks it against its manifest before anything is embedded with it
export async function loadTable(tableDir) {
  const manifest = JSON.parse(await readFile(join(tableDir, 'manifest.json'), 'utf8'));
  const [table, vocab] = await Promise.all([readFile(join(tableDir, manifest.files.table.path)), readFile(join(tableDir, manifest.files.vocab.path))]);
  for (const [name, bytes] of [['table', table], ['vocab', vocab]]) {
    const expected = manifest.files[name];
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error(`Search vectors: ${expected.path} does not match static/search/manifest.json; run scripts/make-search-table.mjs`);
  }
  const embedder = createEmbedder({ vocab: parseVocab(vocab.toString('utf8')), table: new Int8Array(table.buffer, table.byteOffset, table.length), dimensions: manifest.dimensions });
  return { manifest, embedder };
}

// complete: a full render. A missing index or table is then an error; a partial render skips what is absent.
export async function writeSearchVectors(outputDir, { complete = false, tableDir = join(projectDir, 'static/search') } = {}) {
  let indexText;
  try {
    indexText = await readFile(join(outputDir, 'search-index.json'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' && !complete) return null;
    throw error;
  }
  const data = JSON.parse(indexText);
  let loaded;
  try {
    loaded = await loadTable(tableDir);
  } catch (error) {
    if (error.code === 'ENOENT' && !complete) return null;
    throw error;
  }
  const { manifest, embedder } = loaded;
  const { floats, data: int8, scale } = embedPassages(data, embedder);
  const vectors = {
    v: VECTORS_VERSION,
    // The index these vectors belong to, and the table that made them. The page uses them only if both match what it loaded.
    index: data.hash,
    model: manifest.model.id,
    revision: manifest.model.revision,
    dimensions: manifest.dimensions,
    scale,
    count: floats.length / manifest.dimensions,
    table: { path: `static/search/${manifest.files.table.path}`, bytes: manifest.files.table.bytes, sha256: manifest.files.table.sha256, rows: manifest.rows },
    vocab: { path: `static/search/${manifest.files.vocab.path}`, bytes: manifest.files.vocab.bytes, sha256: manifest.files.vocab.sha256 },
    vectors: bytesToBase64(new Uint8Array(int8.buffer, int8.byteOffset, int8.length)),
  };
  const text = JSON.stringify(vectors);
  await writeFile(join(outputDir, 'search-vectors.json'), text);
  return { ...vectors, vectors: undefined, bytes: Buffer.byteLength(text) };
}

if (import.meta.main) {
  const outputDir = resolve(projectDir, process.argv[2] ?? process.env.QUARTO_PROJECT_OUTPUT_DIR ?? '_site');
  const started = performance.now();
  const result = await writeSearchVectors(outputDir, { complete: process.env.QUARTO_PROJECT_RENDER_ALL === '1' });
  if (process.env.QUARTO_PROJECT_SCRIPT_QUIET !== '1') {
    if (!result) console.log('Search vectors: no search index or table, skipped');
    else console.log(`Search vectors: ${result.count} passages x ${result.dimensions} dimensions, ${result.bytes} bytes, in ${Math.round(performance.now() - started)} ms`);
  }
}
