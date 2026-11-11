import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkTokenizer, parseSafetensors, quantizeTable, REVISION, SOURCES } from './make-search-table.mjs';

function safetensors(tensors) {
  const header = {};
  let offset = 0;
  const parts = [];
  for (const [name, { dtype, shape, values }] of Object.entries(tensors)) {
    const bytes = Buffer.from(values.buffer);
    header[name] = { dtype, shape, data_offsets: [offset, offset + bytes.length] };
    offset += bytes.length;
    parts.push(bytes);
  }
  const json = Buffer.from(JSON.stringify(header));
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(json.length));
  return Buffer.concat([length, json, ...parts]);
}

test('reads the tensors of a safetensors file', () => {
  const file = safetensors({ embeddings: { dtype: 'F32', shape: [2, 2], values: Float32Array.from([1, -2, 3.5, 0]) } });
  const { embeddings } = parseSafetensors(file);
  assert.deepEqual(embeddings.shape, [2, 2]);
  assert.equal(embeddings.dtype, 'F32');
  assert.deepEqual([...new Float32Array(embeddings.bytes.buffer.slice(embeddings.bytes.byteOffset, embeddings.bytes.byteOffset + embeddings.bytes.byteLength))], [1, -2, 3.5, 0]);
});

test('quantizes with one scale for the whole table, the largest value at 127', () => {
  const { table, scale } = quantizeTable(Float32Array.from([0.5, -1, 0.25, 0]));
  assert.ok(Math.abs(scale - 1 / 127) < 1e-12);
  assert.deepEqual([...table], [64, -127, 32, 0]);
});

const tokenizer = {
  normalizer: { type: 'BertNormalizer', clean_text: true, handle_chinese_chars: true, strip_accents: null, lowercase: true },
  pre_tokenizer: { type: 'BertPreTokenizer' },
  added_tokens: ['[PAD]', '[UNK]', '[CLS]', '[SEP]', '[MASK]'].map((content, id) => ({ id, content, special: true, normalized: false })),
  model: { type: 'WordPiece', unk_token: '[UNK]', continuing_subword_prefix: '##', max_input_chars_per_word: 100, vocab: { '[PAD]': 0, '[UNK]': 1, '[CLS]': 2, '[SEP]': 3, '[MASK]': 4, a: 5 } },
};
const config = { normalize: true, hidden_dim: 256 };
const vocab = '[PAD]\n[UNK]\n[CLS]\n[SEP]\n[MASK]\na\n';

test('accepts the tokenizer settings search-embed.js implements and refuses any other', () => {
  assert.equal(checkTokenizer(tokenizer, config, vocab), 6);
  assert.throws(() => checkTokenizer({ ...tokenizer, normalizer: { ...tokenizer.normalizer, lowercase: false } }, config, vocab), /normalizer/);
  assert.throws(() => checkTokenizer({ ...tokenizer, model: { ...tokenizer.model, type: 'BPE' } }, config, vocab), /model/);
  assert.throws(() => checkTokenizer(tokenizer, { ...config, max_length: 128 }, vocab), /config/);
  assert.throws(() => checkTokenizer(tokenizer, config, '[PAD]\n[UNK]\n[CLS]\n[SEP]\n[MASK]\nb\n'), /vocab\.txt does not match/);
  assert.throws(() => checkTokenizer(tokenizer, config, vocab.trimEnd()), /newline/);
});

test('pins one revision and a SHA-256 for every source file', () => {
  assert.match(REVISION, /^[0-9a-f]{40}$/);
  for (const [name, hash] of Object.entries(SOURCES)) assert.match(hash, /^[0-9a-f]{64}$/, name);
});
