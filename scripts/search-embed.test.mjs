import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { base64ToBytes, bytesToBase64, createEmbedder, dequantizeRows, normalize, parseVocab, passageText, quantizeRows } from '../static/js/search-embed.js';

const vocabText = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', '[MASK]', 'cafe', 'the', 'quick', 'un', '##believ', '##able', ',', '.', '[', ']', 'e', '日', '本', 'fox', 'play', '##ing'].join('\n') + '\n';
const vocab = parseVocab(vocabText);
const ids = text => [...createEmbedder({ vocab, table: new Int8Array(vocab.size * 2), dimensions: 2 }).tokenIds(text)];
const id = token => vocab.get(token);

test('the normalizer strips accents and controls, lowercases and spaces out CJK characters', () => {
  assert.equal(normalize('Café\u0000 NAÏVE'), 'cafe naive');
  assert.equal(normalize('a b\tc\nd​e'), 'a b c d e'.replace('d e', 'de'));
  assert.equal(normalize('日本'), ' 日  本 ');
  assert.equal(normalize('é'), 'e');
});

test('tokenizes as WordPiece: whole words first, then ## pieces, punctuation on its own, unknown words dropped', () => {
  assert.deepEqual(ids('The quick, FOX.'), [id('the'), id('quick'), id(','), id('fox'), id('.')]);
  assert.deepEqual(ids('unbelievable'), [id('un'), id('##believ'), id('##able')]);
  assert.deepEqual(ids('playing'), [id('play'), id('##ing')]);
  assert.deepEqual(ids('Café 日本'), [id('cafe'), id('日'), id('本')]);
  assert.deepEqual(ids('unbelievabl'), [], 'a word that cannot be covered is unknown as a whole');
  assert.deepEqual(ids('x'.repeat(101)), []);
  assert.deepEqual(ids(''), []);
});

test('the special token strings are tokens, case sensitive, and cut the text around them', () => {
  assert.deepEqual(ids('the [SEP] fox'), [id('the'), id('[SEP]'), id('fox')]);
  assert.deepEqual(ids('[CLS]fox'), [id('[CLS]'), id('fox')]);
  assert.deepEqual(ids('[cls]'), [id('['), id(']')], 'lowercase, so it is plain punctuation and an unknown word');
  assert.deepEqual(ids('[UNK] fox'), [id('fox')], 'the unknown token is dropped like any other');
});

test('embeds as the mean of the rows, normalized, and as zeros when nothing is known', () => {
  const dimensions = 2;
  const table = new Int8Array(vocab.size * dimensions);
  table.set([3, 0], id('the') * dimensions);
  table.set([0, 4], id('fox') * dimensions);
  const embedder = createEmbedder({ vocab, table, dimensions });
  assert.deepEqual([...embedder.embed('the')], [1, 0]);
  const both = embedder.embed('the fox');
  assert.ok(Math.abs(both[0] - 0.6) < 1e-6 && Math.abs(both[1] - 0.8) < 1e-6, 'the mean of (3, 0) and (0, 4) has direction (0.6, 0.8)');
  assert.deepEqual([...embedder.embed('zzzz')], [0, 0]);
  assert.throws(() => createEmbedder({ vocab, table: new Int8Array(3), dimensions }), /table has 3 values/);
});

test('a passage is embedded with its page title and heading in front', () => {
  assert.equal(passageText('Title', 'Heading', 'Body.'), 'Title\nHeading\nBody.');
  assert.equal(passageText('Title', '', 'Description.'), 'Title\nDescription.');
});

test('passage vectors keep their direction through int8 and come back as unit rows', () => {
  const floats = Float32Array.from([0.6, 0.8, 0, 0, 1, 0, -0.28, 0.96]);
  const { data, scale } = quantizeRows(floats);
  assert.equal(Math.max(...Array.from(data, Math.abs)), 127);
  assert.ok(Math.abs(scale - 1 / 127) < 1e-12);
  const back = dequantizeRows(data, 2, scale);
  for (let row = 0; row < 4; row++) {
    const [x, y] = [back[row * 2], back[row * 2 + 1]];
    if (row !== 1) assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-6);
    assert.ok(Math.abs(x - floats[row * 2]) < 0.01 && Math.abs(y - floats[row * 2 + 1]) < 0.01);
  }
});

test('base64 round trips bytes, including more than one chunk', () => {
  const bytes = Uint8Array.from({ length: 0x8000 * 2 + 5 }, (_, i) => (i * 7) % 256);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test('the committed table, vocabulary and manifest agree, and tokenizing matches Model2Vec on known cases', async () => {
  const dir = new URL('../static/search/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', dir), 'utf8'));
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
  const table = await readFile(new URL(manifest.files.table.path, dir));
  const vocabFile = await readFile(new URL(manifest.files.vocab.path, dir));
  assert.equal(table.length, manifest.files.table.bytes);
  assert.equal(table.length, manifest.rows * manifest.dimensions);
  assert.equal(sha256(table), manifest.files.table.sha256);
  assert.equal(sha256(vocabFile), manifest.files.vocab.sha256);
  const real = parseVocab(vocabFile.toString('utf8'));
  assert.equal(real.size, manifest.rows);
  const embedder = createEmbedder({ vocab: real, table: new Int8Array(table.buffer, table.byteOffset, table.length), dimensions: manifest.dimensions });
  // Token ids that model2vec 0.10.0 (tokenizers 0.23.3) gave for the same texts, from _devlog/local-search/evals/results/stage2-browser/crosscheck-model2vec.txt
  const expected = {
    diarisation: [21945, 5941, 2376],
    'café naïve résumé façade': [6674, 14749, 12752, 7514],
    '数据库 搜索 日本語のテキスト': [870, 882, 956, 677, 29245, 29233, 29239, 29246],
    '[CLS] [SEP] [UNK] [PAD] [MASK] and [cls] and [CLS]hello': [2, 3, 0, 4, 1004, 37, 17862, 1021, 39, 1004, 2, 6598],
    'GPT-4o Llama-3.1 H200 gemma4 b200': [13252, 1108, 17, 24, 1086, 1228, 7073, 17, 23, 18, 21, 50, 27338, 18079, 1555, 44, 27338],
    'make a photo black and white': [1197, 43, 5308, 1310, 1004, 1323],
  };
  for (const [text, tokens] of Object.entries(expected)) assert.deepEqual([...embedder.tokenIds(text)], tokens, text);
  const vector = embedder.embed('make a photo black and white');
  assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-5);
  assert.equal(vector.length, manifest.dimensions);
});

test('the vocabulary file ends with one newline and has the unknown token at id 1', async () => {
  const text = await readFile(fileURLToPath(new URL('../static/search/potion-base-8M.vocab.txt', import.meta.url)), 'utf8');
  assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
  assert.equal(parseVocab(text).get('[UNK]'), 1);
});
