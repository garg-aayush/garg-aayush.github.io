// Cross-checks static/js/search-embed.js and the shipped int8 table against Model2Vec's own Python output (model2vec-reference.py).
// Usage (Node 24.22.0): node crosscheck-model2vec.mjs <work folder>   The folder holds model/ (config.json, model.safetensors, tokenizer.json, from the pinned revision); texts.json and reference.json are written to it.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmbedder, parseVocab, passageText } from '../../../../static/js/search-embed.js';
import { parseSafetensors } from '../../../../scripts/make-search-table.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const work = resolve(process.argv[2]);
const python = process.env.MODEL2VEC_PYTHON;
const siteDir = join(repo, process.env.CROSSCHECK_SITE ?? '_site');

const questions = JSON.parse(readFileSync(join(here, '..', 'questions.json'), 'utf8')).questions.map(q => q.query);
const index = JSON.parse(readFileSync(join(siteDir, 'search-index.json'), 'utf8'));
const passages = index.pages.flatMap(page => [passageText(page.t, '', page.d), ...page.p.map(([, heading, text]) => passageText(page.t, heading, text))]);
// Cases the site's own text does not cover: accents, other scripts, symbols, a long word, a long text, the special token strings, odd whitespace, nothing
const edge = [
  '', ' ', '!!!', '???', 'a', 'The Quick Brown Fox', 'café naïve résumé façade', 'Ångström über Straße İstanbul', 'ǅ ǆ ŉ ﬁ ﬃ', '数据库 搜索 日本語のテキスト', '한국어 텍스트', 'Привет мир', 'emoji 😀 and 👩‍💻 text',
  "don't can't it's o'clock 3.14 1,000 $5 100% a+b=c", 'state-of-the-art re-ranking x_y_z foo/bar', 'GPT-4o Llama-3.1 H200 gemma4 b200', 'tabs\tand\nnewlines\r\nand nbsp em space​zero width',
  'control\u0000char\u0007bell and � replacement', '[CLS] [SEP] [UNK] [PAD] [MASK] and [cls] and [CLS]hello', 'x'.repeat(100), 'x'.repeat(101), 'xyz'.repeat(60), 'pneumonoultramicroscopicsilicovolcanoconiosis',
  'zzzzzzqqqqqxxxxx qqqqq', '12345 67890 1e-5 0x1F 2026-11-11', 'diarisation diarization quantiz tokenizers geophysics', 'what does he do now', 'make a photo black and white',
  'long text '.repeat(400), `${'word '.repeat(700)}tail`, 'ÀÉÎÕÜ àéîõü ñ ç ø æ œ ß', 'ＦＵＬＬＷＩＤＴＨ ｆｕｌｌｗｉｄｔｈ ① ② ㊿', '́́ combining only', 'é vs é',
];
const texts = [...questions, ...passages, ...edge];
writeFileSync(join(work, 'texts.json'), JSON.stringify(texts));
execFileSync(python, ['-I', join(here, 'model2vec-reference.py'), join(work, 'model'), join(work, 'texts.json'), join(work, 'reference.json')], { stdio: 'inherit' });
const reference = JSON.parse(readFileSync(join(work, 'reference.json'), 'utf8'));

const manifest = JSON.parse(readFileSync(join(repo, 'static/search/manifest.json'), 'utf8'));
const vocab = parseVocab(readFileSync(join(repo, 'static/search', manifest.files.vocab.path), 'utf8'));
const int8 = new Int8Array(readFileSync(join(repo, 'static/search', manifest.files.table.path)).buffer.slice(0));
const { embeddings } = parseSafetensors(readFileSync(join(work, 'model', 'model.safetensors')));
const float = new Float32Array(embeddings.bytes.buffer.slice(embeddings.bytes.byteOffset, embeddings.bytes.byteOffset + embeddings.bytes.byteLength));
const dimensions = manifest.dimensions;
const floatEmbedder = createEmbedder({ vocab, table: float, dimensions });
const int8Embedder = createEmbedder({ vocab, table: int8, dimensions });

const dot = (a, b) => { let sum = 0; for (let i = 0; i < a.length; i++) sum += a[i] * b[i]; return sum; };
const norm = a => Math.sqrt(dot(a, a));
const cosine = (a, b) => { const n = norm(a) * norm(b); return n ? dot(a, b) / n : (norm(a) === 0 && norm(b) === 0 ? 1 : 0); };
const stats = values => ({ min: Math.min(...values), mean: values.reduce((a, b) => a + b, 0) / values.length, count: values.length });

const groups = [['queries', 0, questions.length], ['passages', questions.length, questions.length + passages.length], ['edge cases', questions.length + passages.length, texts.length]];
const rows = texts.map((text, i) => {
  const ref = Float32Array.from(reference.vectors[i]);
  const f = floatEmbedder.embed(text);
  const q = int8Embedder.embed(text);
  const ids = floatEmbedder.tokenIds(text);
  return { text, sameIds: ids.length === reference.ids[i].length && ids.every((id, j) => id === reference.ids[i][j]), jsFloatVsModel2Vec: cosine(f, ref), int8VsJsFloat: cosine(q, f), int8VsModel2Vec: cosine(q, ref), refNorm: norm(ref) };
});
const lines = [`model2vec ${reference.model2vec}, numpy ${reference.numpy}, tokenizers ${reference.tokenizers}, normalize ${reference.normalize}, max_length ${reference.maxLength}, median token length ${reference.medianTokenLength}`, ''];
for (const [name, from, to] of groups) {
  const part = rows.slice(from, to);
  const fmt = key => { const s = stats(part.map(r => r[key])); return `min ${s.min.toFixed(9)} mean ${s.mean.toFixed(9)}`; };
  lines.push(`${name} (${part.length}): same token ids ${part.filter(r => r.sameIds).length}/${part.length}; JS float32 vs Model2Vec ${fmt('jsFloatVsModel2Vec')}; int8 vs JS float32 ${fmt('int8VsJsFloat')}; int8 vs Model2Vec ${fmt('int8VsModel2Vec')}`);
}
const bad = rows.filter(r => !r.sameIds || r.jsFloatVsModel2Vec < 0.99999);
lines.push('', bad.length ? `Differences (${bad.length}):` : 'No text differs in token ids or has a JS float32 cosine under 0.99999.');
for (const row of bad) lines.push(`  ${JSON.stringify(row.text.slice(0, 60))}: same ids ${row.sameIds}, cosine ${row.jsFloatVsModel2Vec.toFixed(9)}, reference norm ${row.refNorm.toFixed(4)}`);
const worst = [...rows].sort((a, b) => a.int8VsJsFloat - b.int8VsJsFloat).slice(0, 5);
lines.push('', 'Lowest int8 vs float32 cosines:');
for (const row of worst) lines.push(`  ${row.int8VsJsFloat.toFixed(9)} ${JSON.stringify(row.text.slice(0, 60))}`);
console.log(lines.join('\n'));
