// Meaning vectors for the search page: a static embedding table, so no neural network. Tokenize as the model's BERT WordPiece tokenizer does, look up one row of the table per piece, average, normalize. No DOM and no dependencies, so the browser and scripts/build-search-vectors.mjs run this same file. The table, vocabulary and settings come from scripts/make-search-table.mjs; static/search/manifest.json lists them.

export const VECTORS_VERSION = 1;

const SPECIAL = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', '[MASK]'];
const SPECIAL_SPLIT = new RegExp(`(${SPECIAL.map(token => token.replace(/[[\]]/g, '\\$&')).join('|')})`);
const CONTROL = /[\0�]|(?![\t\n\r])\p{C}/gu;
const CJK = /[㐀-䶿一-鿿豈-﫿]|[\u{20000}-\u{2A6DF}\u{2A700}-\u{2B81F}\u{2B820}-\u{2CEAF}\u{2F800}-\u{2FA1F}]/gu;
const MARK = /\p{Mn}/gu;
// BERT's pre-tokenizer: every punctuation character, ASCII symbols included, is a word of its own
const WORDS = /[^\s!-/:-@[-`{-~\p{P}]+|[!-/:-@[-`{-~\p{P}]/gu;

// The tokenizer's normalizer: control characters out, whitespace to spaces, spaces around CJK characters, accents stripped, lowercase
export function normalize(text) {
  return text.replace(CONTROL, '').replace(/\p{White_Space}/gu, ' ').replace(CJK, ' $& ').normalize('NFD').replace(MARK, '').toLowerCase();
}

// The vocabulary file has one token per line and the line number is the id
export function parseVocab(text) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return new Map(lines.map((token, id) => [token, id]));
}

function wordPieces(word, vocab, unknown) {
  const chars = Array.from(word);
  if (chars.length > 100) return [unknown];
  const ids = [];
  let start = 0;
  while (start < chars.length) {
    let end = chars.length;
    let id;
    for (; end > start; end--) {
      id = vocab.get((start ? '##' : '') + chars.slice(start, end).join(''));
      if (id !== undefined) break;
    }
    if (end === start) return [unknown];
    ids.push(id);
    start = end;
  }
  return ids;
}

// vocab is a Map from parseVocab, table the int8 rows (vocab size times dimensions)
export function createEmbedder({ vocab, table, dimensions }) {
  if (table.length !== vocab.size * dimensions) throw new Error(`table has ${table.length} values, expected ${vocab.size} x ${dimensions}`);
  const unknown = vocab.get('[UNK]');
  // Model2Vec first cuts the text to 512 times the median token length in characters, then to 512 pieces
  const lengths = [...vocab.keys()].map(token => Array.from(token).length).sort((a, b) => a - b);
  const middle = lengths.length >> 1;
  const maxChars = 512 * Math.trunc(lengths.length % 2 ? lengths[middle] : (lengths[middle - 1] + lengths[middle]) / 2);

  // The ids of a text, with the unknown token dropped as Model2Vec drops it
  function tokenIds(text) {
    if (text.length > maxChars) text = Array.from(text).slice(0, maxChars).join('');
    const ids = [];
    text.split(SPECIAL_SPLIT).forEach((part, i) => {
      if (i % 2) ids.push(vocab.get(part));
      else for (const word of normalize(part).match(WORDS) ?? []) ids.push(...wordPieces(word, vocab, unknown));
    });
    return ids.slice(0, 512).filter(id => id !== unknown);
  }

  // A unit length vector, or all zeros when no piece of the text is in the vocabulary
  function embed(text) {
    const ids = tokenIds(text);
    const sum = new Float64Array(dimensions);
    for (const id of ids) {
      const row = id * dimensions;
      for (let i = 0; i < dimensions; i++) sum[i] += table[row + i];
    }
    let norm = 0;
    for (let i = 0; i < dimensions; i++) norm += sum[i] * sum[i];
    norm = Math.sqrt(norm);
    const out = new Float32Array(dimensions);
    if (norm > 0) for (let i = 0; i < dimensions; i++) out[i] = sum[i] / norm;
    return out;
  }

  return { dimensions, tokenIds, embed };
}

// What is embedded for a passage: the page title, the section heading and the prose, one per line. Without the title and heading a passage often does not say what it is about.
export function passageText(title, heading, text) {
  return [title, heading, text].filter(Boolean).join('\n');
}

// Passage vectors are stored as int8 with one scale for the whole matrix (the largest absolute value over 127), and read back as unit length rows
export function quantizeRows(floats) {
  let max = 0;
  for (const value of floats) max = Math.max(max, Math.abs(value));
  const scale = max / 127;
  const data = new Int8Array(floats.length);
  for (let i = 0; i < floats.length; i++) data[i] = Math.max(-127, Math.min(127, Math.round(floats[i] / scale)));
  return { data, scale };
}

export function dequantizeRows(data, dimensions, scale) {
  const out = new Float32Array(data.length);
  for (let row = 0; row < data.length; row += dimensions) {
    let norm = 0;
    for (let i = 0; i < dimensions; i++) { out[row + i] = data[row + i] * scale; norm += out[row + i] ** 2; }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dimensions; i++) out[row + i] /= norm;
  }
  return out;
}

export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
