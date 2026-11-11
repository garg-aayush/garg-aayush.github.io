// Writes results/stage2/costs.md from the metadata embed.mjs saved next to the vectors (file sizes, timings, machine) and from the shipped-table sizes.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { evalsDir, vectorsDir, mainCount, passages, indexInfo } from './data.mjs';

const meta = name => (existsSync(join(vectorsDir, `${name}.meta.json`)) ? JSON.parse(readFileSync(join(vectorsDir, `${name}.meta.json`), 'utf8')) : null);
const mb = bytes => `${(bytes / 1e6).toFixed(1)} MB`;
const kb = bytes => `${(bytes / 1e3).toFixed(0)} KB`;
const fmt = bytes => (bytes >= 1e6 ? mb(bytes) : kb(bytes));
const ms = value => (value >= 100 ? `${Math.round(value)}` : value >= 10 ? value.toFixed(1) : value >= 1 ? value.toFixed(2) : value.toFixed(3));
const total = meta('minilm') ?? meta('leaf');
const machine = total.machine;
const lines = [];
const push = (...text) => lines.push(...text);

push('# Stage 2 costs', '',
  `Measured on 2026-11-11 on one laptop: ${machine.cpu}, ${machine.cores} cores, ${machine.memoryGB} GB, macOS (arm64), Node ${total.node} with Transformers.js ${total.transformers} and its onnxruntime-node (CPU). Not measured: a browser, a phone, a real network. Other work was running on the machine at times (other agents), so the timings are indicative. Each timing is one run unless a median is given; passages are embedded in batches of ${total.batchSize} in index order, with the page title, section heading and prose of each of the ${mainCount} passages.`, '');

// downloads
push('## Download per model (bytes actually fetched from huggingface.co by Transformers.js in Node)', '',
  'Sizes are the files the library saved to its cache, so they are what a browser would also request for the same dtype (the browser adds the runtime below). The int8 table rows for potion are the table written as one int8 array after the int8 step (and the PCA step), then compressed here with gzip level 9 and brotli quality 11; they are not files a model repository publishes, and the rows have to be shipped with the tokenizer.', '',
  '| Model | Files | Total |', '|---|---|---|');
const rows = [['minilm', 'all-MiniLM-L6-v2, q8'], ['leaf', 'mdbr-leaf-ir, q8'], ['arctic', 'arctic-embed-m-v1.5, q8'], ['gemma2', 'EmbeddingGemma 2 text, q4'], ['potion8', 'potion-base-8M, fp32 table'], ['potion32r', 'potion-retrieval-32M, fp32 table']];
for (const [name, label] of rows) {
  const m = meta(name);
  if (!m) { push(`| ${label} | not run | |`); continue; }
  const sum = m.files.reduce((s, f) => s + f.bytes, 0);
  push(`| ${label} | ${m.files.map(f => `${f.file} ${f.bytes.toLocaleString('en-US')}`).join('; ')} | ${sum.toLocaleString('en-US')} bytes (${mb(sum)}) |`);
}
push('');
const tokenizer = meta('potion8')?.files.find(f => f.file === 'tokenizer.json')?.bytes ?? 0;
push('Shipped static tables (int8, one byte per value) with the potion-base-8M tokenizer.json:', '', '| Table | Raw bytes | Gzip level 9 | Brotli | With tokenizer.json, raw | With tokenizer.json, brotli |', '|---|---|---|---|---|---|');
for (const [name, label, tok] of [['potion8.int8', 'potion-base-8M, int8, 256 dims', tokenizer], ['potion8.d128.int8', 'potion-base-8M, int8, PCA 128 dims', tokenizer], ['potion32r.d128.int8', 'potion-retrieval-32M, int8, PCA 128 dims', meta('potion32r')?.files.find(f => f.file === 'tokenizer.json')?.bytes ?? 0]]) {
  const path = join(vectorsDir, `${name}.table.i8`);
  if (!existsSync(path)) { push(`| ${label} | not written | | | | |`); continue; }
  const data = readFileSync(path);
  const gz = gzipSync(data, { level: 9 }).length;
  const br = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }).length;
  const tokPath = join(vectorsDir, '..', 'models', name.startsWith('potion32r') ? 'minishlab/potion-retrieval-32M' : 'minishlab/potion-base-8M', 'tokenizer.json');
  const tokBr = brotliCompressSync(readFileSync(tokPath), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  push(`| ${label} | ${data.length.toLocaleString('en-US')} (${mb(data.length)}) | ${gz.toLocaleString('en-US')} | ${br.toLocaleString('en-US')} | ${(data.length + tok).toLocaleString('en-US')} (${mb(data.length + tok)}) | ${(br + tokBr).toLocaleString('en-US')} (${mb(br + tokBr)}) |`);
}
push('', '## Runtime in the browser (from the research file, not measured here)', '',
  '- Transformers.js `transformers.web.min.js`: 0.46 MB (108 KB with brotli from jsDelivr). The WebAssembly binary it loads by default, `ort-wasm-simd-threaded.asyncify.wasm`: 26.9 MB (4.70 MB with brotli). The three transformer rows (MiniLM, leaf-ir, arctic) need both; EmbeddingGemma 2 needs them too if run on WebAssembly.',
  '- A static table needs no ONNX runtime: a tokenizer (Transformers.js `AutoTokenizer`, which still pulls the 0.46 MB library, or a small WordPiece implementation) and one typed array.',
  '- GitHub Pages cannot enable cross-origin isolation, so WebAssembly runs on one thread. The one-thread rows below are the closest this run gets to that.', '');

// times
push('## Time to embed the passages and one query, in Node on the CPU', '',
  `All ${mainCount} passages (the deploy would pay this), then one query at a time (a visitor's search), median over the 40 queries after a warm-up call. The first column uses the library's default thread count; the one-thread columns pin the ONNX runtime to a single thread, which is closer to the browser but is still Node, not WebAssembly. Query times of a millisecond or less on a laptop are not a prediction for a phone.`, '',
  '| Model | Load model | Passages, default threads | Passages, one thread | Query, default threads (median / worst) | Query, one thread (median / worst) |', '|---|---|---|---|---|---|');
const timeRows = [['minilm', 'all-MiniLM-L6-v2, q8'], ['leaf', 'mdbr-leaf-ir, q8'], ['arctic', 'arctic-embed-m-v1.5, q8'], ['gemma2', 'EmbeddingGemma 2 text, q4'], ['potion8', 'potion-base-8M (any variant)'], ['potion32r', 'potion-retrieval-32M']];
for (const [name, label] of timeRows) {
  const m = meta(name); const t1 = meta(`${name}.t1`);
  if (!m) { push(`| ${label} | not run | | | | |`); continue; }
  push(`| ${label} | ${ms(m.loadMs)} ms | ${ms(m.reps.titled.ms)} ms | ${t1 ? `${ms(t1.reps.titled.ms)} ms` : name.startsWith('potion') ? 'single threaded already' : 'not run'} | ${ms(m.queryMs.median)} / ${ms(m.queryMs.worst)} ms | ${t1 ? `${ms(t1.queryMs.median)} / ${ms(t1.queryMs.worst)} ms` : name.startsWith('potion') ? 'single threaded already' : 'not run'} |`);
}
push('');
const tokens = ['minilm', 'leaf', 'arctic', 'gemma2'].map(n => [n, meta(n)]).filter(([, m]) => m?.tokens);
push('Passage lengths in word pieces (page title, heading and prose, as embedded):', '', '| Model | Median | Longest | Input limit used | Passages over the limit (cut at the end) |', '|---|---|---|---|---|');
for (const [n, m] of tokens) push(`| ${n} | ${m.tokens.median} | ${m.tokens.max} | ${m.tokens.limit} | ${m.tokens.overLimit} of ${mainCount} |`);
push('');

// vector sizes
push('## Size of the passage vectors', '', `${mainCount} passages (${mainCount + 47} if the 47 page descriptions are embedded too). float32 is 4 bytes a value, int8 is 1 byte plus one scale for the whole matrix. Arithmetic, not a measured download; the files embed.mjs wrote for the native dimension have these sizes exactly.`, '',
  '| Model | Dimensions | float32 | int8 | float32 with descriptions | int8 with descriptions |', '|---|---|---|---|---|---|');
for (const [model, dims] of [['potion-base-8M', [256, 128]], ['all-MiniLM-L6-v2', [384]], ['mdbr-leaf-ir', [768, 256]], ['EmbeddingGemma 2 text', [768, 512, 256, 128]], ['arctic-embed-m-v1.5 (asymmetric passages)', [768, 256]], ['potion-retrieval-32M', [512, 128]]]) {
  for (const d of dims) push(`| ${model} | ${d} | ${(mainCount * d * 4).toLocaleString('en-US')} (${kb(mainCount * d * 4)}) | ${(mainCount * d).toLocaleString('en-US')} (${kb(mainCount * d)}) | ${((mainCount + 47) * d * 4).toLocaleString('en-US')} | ${((mainCount + 47) * d).toLocaleString('en-US')} |`);
}
push('', `For scale: the BM25 index is ${indexInfo.bytes.toLocaleString('en-US')} bytes raw and 117,508 bytes gzipped (stage 1).`, '');
writeFileSync(join(evalsDir, 'results', 'stage2', 'costs.md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
