// One-off: builds the static embedding table that the search page serves, from minishlab/potion-base-8M at a pinned revision. Run it by hand when the model changes; the files it writes are committed, so the deploy needs no model download and no npm package.
// Usage: node scripts/make-search-table.mjs [--cache <dir>] [--out static/search]
// Writes potion-base-8M.int8.bin (the table as int8), potion-base-8M.vocab.txt (one token per line, line number = id) and manifest.json. NOTICE.txt next to them is written by hand.
// Only Node built-ins. The model files come anonymously from huggingface.co and are kept in a cache outside the repo; every source file is checked against the SHA-256 pinned below.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = fileURLToPath(new URL('../', import.meta.url));

export const MODEL = 'minishlab/potion-base-8M';
export const REVISION = 'bf8b056651a2c21b8d2565580b8569da283cab23';
export const SOURCES = {
  'model.safetensors': 'f65d0f325faadc1e121c319e2faa41170d3fa07d8c89abd48ca5358d9a223de2',
  'tokenizer.json': 'e67e803f624fb4d67dea1c730d06e1067e1b14d830e2c2202569e3ef0f70bb50',
  'vocab.txt': '1394523a67ddd404a825428018c0582a6998bcfa044ecbcbf1f4d71adb94c61c',
  'config.json': '2a6ac0e9aaa356a68a5688070db78fc3a464fefe85d2f06a1905ce3718687553',
  'README.md': 'de8ec91bf63c5f4c0e20751c227b2d049953e1cab5f8d5d44211c59a44795bdd',
};
export const TABLE_FILE = 'potion-base-8M.int8.bin';
export const VOCAB_FILE = 'potion-base-8M.vocab.txt';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// The tensors of a .safetensors file: an 8 byte little endian header length, a JSON header, then the raw data
export function parseSafetensors(buffer) {
  const headerLength = Number(buffer.readBigUInt64LE(0));
  const header = JSON.parse(buffer.subarray(8, 8 + headerLength).toString('utf8'));
  const tensors = {};
  for (const [name, meta] of Object.entries(header)) {
    if (name === '__metadata__') continue;
    const [from, to] = meta.data_offsets;
    tensors[name] = { dtype: meta.dtype, shape: meta.shape, bytes: buffer.subarray(8 + headerLength + from, 8 + headerLength + to) };
  }
  return tensors;
}

// Symmetric int8 with one scale for the whole table. Embeddings are averaged and normalized afterwards, so the scale cancels in the result; it is recorded so the table can be read back as floats.
export function quantizeTable(floats) {
  let max = 0;
  for (const value of floats) max = Math.max(max, Math.abs(value));
  const scale = max / 127;
  const table = new Int8Array(floats.length);
  for (let i = 0; i < floats.length; i++) table[i] = Math.max(-127, Math.min(127, Math.round(floats[i] / scale)));
  return { table, scale };
}

// What the tokenizer and the model must be for static/js/search-embed.js to match them. A new revision that changes any of this stops here instead of shipping a table the code reads wrongly.
export function checkTokenizer(tokenizer, config, vocabText) {
  const same = (name, actual, expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${name} is ${JSON.stringify(actual)}, search-embed.js expects ${JSON.stringify(expected)}`);
  };
  same('normalizer', tokenizer.normalizer, { type: 'BertNormalizer', clean_text: true, handle_chinese_chars: true, strip_accents: null, lowercase: true });
  same('pre_tokenizer', tokenizer.pre_tokenizer, { type: 'BertPreTokenizer' });
  const { vocab, ...model } = tokenizer.model;
  same('model', model, { type: 'WordPiece', unk_token: '[UNK]', continuing_subword_prefix: '##', max_input_chars_per_word: 100 });
  same('special tokens', tokenizer.added_tokens.map(token => [token.id, token.content, token.special, token.normalized]), ['[PAD]', '[UNK]', '[CLS]', '[SEP]', '[MASK]'].map((content, id) => [id, content, true, false]));
  same('config', { normalize: config.normalize, max_length: config.max_length ?? null, hidden_dim: config.hidden_dim }, { normalize: true, max_length: null, hidden_dim: 256 });
  const lines = vocabText.split('\n');
  if (lines.pop() !== '') throw new Error('vocab.txt does not end with a newline');
  const ordered = Object.entries(vocab).sort((a, b) => a[1] - b[1]);
  if (ordered.length !== lines.length || ordered.some(([token, id], i) => id !== i || token !== lines[i])) throw new Error('vocab.txt does not match the tokenizer vocabulary');
  return lines.length;
}

async function fetchTo(cache, name) {
  const target = join(cache, `${REVISION}-${name}`);
  if (!existsSync(target)) {
    const response = await fetch(`https://huggingface.co/${MODEL}/resolve/${REVISION}/${name}`);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
  return readFile(target);
}

export async function makeTable({ cache, out }) {
  await mkdir(cache, { recursive: true });
  await mkdir(out, { recursive: true });
  const sources = {};
  for (const [name, expected] of Object.entries(SOURCES)) {
    sources[name] = await fetchTo(cache, name);
    const actual = sha256(sources[name]);
    if (expected && actual !== expected) throw new Error(`${name}: SHA-256 ${actual} is not the pinned ${expected}`);
    if (!expected) console.log(`pin ${name}: ${actual}`);
  }
  if (!/^license: mit$/m.test(sources['README.md'].toString('utf8').split('---')[1] ?? '')) throw new Error('the model card no longer says license: mit; read it and update NOTICE.txt before going on');

  const config = JSON.parse(sources['config.json'].toString('utf8'));
  const vocabText = sources['vocab.txt'].toString('utf8');
  const rows = checkTokenizer(JSON.parse(sources['tokenizer.json'].toString('utf8')), config, vocabText);

  const { embeddings } = parseSafetensors(sources['model.safetensors']);
  if (!embeddings || embeddings.dtype !== 'F32' || embeddings.shape.length !== 2 || embeddings.shape[0] !== rows) throw new Error(`unexpected embeddings tensor: ${JSON.stringify(embeddings && { dtype: embeddings.dtype, shape: embeddings.shape })}`);
  const dimensions = embeddings.shape[1];
  const floats = new Float32Array(embeddings.bytes.buffer.slice(embeddings.bytes.byteOffset, embeddings.bytes.byteOffset + embeddings.bytes.byteLength));
  const { table, scale } = quantizeTable(floats);

  const tableBytes = Buffer.from(table.buffer);
  const vocabBytes = Buffer.from(vocabText, 'utf8');
  await writeFile(join(out, TABLE_FILE), tableBytes);
  await writeFile(join(out, VOCAB_FILE), vocabBytes);

  const manifest = {
    schema: 1,
    model: { id: MODEL, revision: REVISION, license: 'MIT', url: `https://huggingface.co/${MODEL}/tree/${REVISION}`, sourceSha256: Object.fromEntries(Object.keys(SOURCES).map(name => [name, sha256(sources[name])])) },
    rows,
    dimensions,
    quantization: { type: 'int8', scope: 'one scale for the whole table', scale, range: [-127, 127] },
    // How static/js/search-embed.js turns text into rows of the table: the settings of the model's tokenizer.json and Model2Vec's encode
    tokenizer: { type: 'WordPiece', lowercase: true, stripAccents: true, cleanText: true, chineseChars: true, prefix: '##', unknown: '[UNK]', maxCharsPerWord: 100, special: ['[PAD]', '[UNK]', '[CLS]', '[SEP]', '[MASK]'] },
    pooling: { type: 'mean', dropUnknown: true, maxTokens: 512, normalize: true },
    files: {
      table: { path: TABLE_FILE, bytes: tableBytes.length, sha256: sha256(tableBytes) },
      vocab: { path: VOCAB_FILE, bytes: vocabBytes.length, sha256: sha256(vocabBytes) },
    },
  };
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const cache = resolve(option('--cache', process.env.SEARCH_TABLE_CACHE ?? join(homedir(), '.cache', 'aayushgarg-dev', 'search-table')));
  const out = resolve(projectDir, option('--out', 'static/search'));
  const manifest = await makeTable({ cache, out });
  console.log(`Search table: ${manifest.rows} rows x ${manifest.dimensions} dimensions, scale ${manifest.quantization.scale}`);
  for (const file of Object.values(manifest.files)) console.log(`  ${file.path}: ${file.bytes} bytes, sha256 ${file.sha256}`);
}
