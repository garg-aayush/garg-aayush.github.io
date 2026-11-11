// Embeds the passages and queries of the site with one model in Node and saves the vectors outside the repo.
// Usage (Node 24.22.0, from this folder after npm install): node embed.mjs <model> [--reps titled,plain,code,desc] [--batch 8]
// Models are listed in models.mjs. The only network requests are the model's own file downloads from huggingface.co.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import os from 'node:os';
import { env, AutoTokenizer, AutoModel, AutoConfig } from '@huggingface/transformers';
import { MODELS, SANITY } from './models.mjs';
import { passages, mainCount, questions, passageText, queryText, modelsDir, vectorsDir, indexInfo } from './data.mjs';

const args = process.argv.slice(2);
const modelKey = args[0];
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const reps = option('--reps', 'titled,plain,code,desc').split(',');
const batchSize = Number(option('--batch', '8'));
// --threads 1 times the single threaded case (the browser on GitHub Pages cannot use threads); its vectors are saved under a .t1 name and not used for scoring
const threads = option('--threads') ? Number(option('--threads')) : null;
const model = MODELS[modelKey];
if (!model) throw new Error(`unknown model ${modelKey}; choose from ${Object.keys(MODELS).join(', ')}`);

env.cacheDir = modelsDir;
env.allowLocalModels = false;
mkdirSync(vectorsDir, { recursive: true });

const now = () => performance.now();
const ms = value => Math.round(value * 1000) / 1000;
const median = values => { const sorted = [...values].sort((a, b) => a - b); const mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };

function normalizeRows(data, dim) {
  const rows = data.length / dim;
  const norms = [];
  for (let r = 0; r < rows; r++) {
    let sum = 0;
    for (let i = 0; i < dim; i++) sum += data[r * dim + i] ** 2;
    const norm = Math.sqrt(sum);
    norms.push(norm);
    for (let i = 0; i < dim; i++) data[r * dim + i] /= norm || 1;
  }
  return norms;
}

function files(id) {
  const base = join(modelsDir, id);
  const out = [];
  const walk = dir => { for (const name of readdirSync(dir)) { const full = join(dir, name); if (statSync(full).isDirectory()) walk(full); else out.push({ file: full.slice(base.length + 1), bytes: statSync(full).size }); } };
  if (existsSync(base)) walk(base);
  return out;
}

// An embedder is { embed(texts) -> { data: Float32Array, dim, norms }, info }
async function loadTransformer() {
  const started = now();
  const tokenizer = await AutoTokenizer.from_pretrained(model.id);
  const options = { dtype: model.dtype, device: 'cpu' };
  if (threads) options.session_options = { intraOpNumThreads: threads, interOpNumThreads: 1 };
  if (model.textOnly) {
    const config = await AutoConfig.from_pretrained(model.id);
    config.vision_config = config.audio_config = null;
    options.config = config;
  }
  const net = await AutoModel.from_pretrained(model.id, options);
  const loadMs = now() - started;
  const embed = async texts => {
    const inputs = await tokenizer(texts, { padding: true, truncation: true, max_length: model.maxLength });
    const output = await net(inputs);
    if (model.kind === 'sentence_embedding') {
      const tensor = output.sentence_embedding;
      const dim = tensor.dims[1];
      const data = Float32Array.from(tensor.data);
      return { data, dim, norms: normalizeRows(data, dim), outputs: Object.keys(output) };
    }
    const hidden = output.last_hidden_state;
    const [batch, length, dim] = hidden.dims;
    const data = new Float32Array(batch * dim);
    const mask = inputs.attention_mask.data;
    for (let b = 0; b < batch; b++) {
      if (model.pooling === 'cls') { for (let i = 0; i < dim; i++) data[b * dim + i] = hidden.data[b * length * dim + i]; continue; }
      let count = 0;
      for (let t = 0; t < length; t++) {
        if (!Number(mask[b * length + t])) continue;
        count++;
        for (let i = 0; i < dim; i++) data[b * dim + i] += hidden.data[(b * length + t) * dim + i];
      }
      for (let i = 0; i < dim; i++) data[b * dim + i] /= count;
    }
    return { data, dim, norms: normalizeRows(data, dim), outputs: Object.keys(output) };
  };
  const tokenCount = async text => (await tokenizer([text], { truncation: false })).input_ids.dims[1];
  return { embed, loadMs, tokenCount };
}

// A static table: tokenize, look up one row per token, average, normalize. Model2Vec's own method, written out here.
async function download(id, file) {
  const target = join(modelsDir, id, file);
  if (existsSync(target)) return target;
  mkdirSync(dirname(target), { recursive: true });
  const response = await fetch(`https://huggingface.co/${id}/resolve/main/${file}`);
  if (!response.ok) throw new Error(`${id}/${file}: HTTP ${response.status}`);
  await streamPipeline(Readable.fromWeb(response.body), createWriteStream(target));
  return target;
}

function readSafetensors(path) {
  const buffer = readFileSync(path);
  const headerLength = Number(buffer.readBigUInt64LE(0));
  const header = JSON.parse(buffer.subarray(8, 8 + headerLength).toString('utf8'));
  const base = 8 + headerLength;
  const tensors = {};
  for (const [name, meta] of Object.entries(header)) {
    if (name === '__metadata__') continue;
    const [from, to] = meta.data_offsets;
    tensors[name] = { dtype: meta.dtype, shape: meta.shape, bytes: buffer.subarray(base + from, base + to) };
  }
  return { header, tensors };
}

function toFloat32(tensor) {
  const { bytes, dtype } = tensor;
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (dtype === 'F32') return new Float32Array(copy);
  if (dtype === 'F16') {
    const half = new Uint16Array(copy);
    const out = new Float32Array(half.length);
    for (let i = 0; i < half.length; i++) {
      const h = half[i]; const s = h & 0x8000 ? -1 : 1; const e = (h >> 10) & 0x1f; const f = h & 0x3ff;
      out[i] = e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024);
    }
    return out;
  }
  if (dtype === 'I8') return Float32Array.from(new Int8Array(copy));
  throw new Error(`unsupported dtype ${dtype}`);
}

// Symmetric int8 with one scale for the table, then back to floats: cosine does not depend on the scale
function quantizeInt8(table) {
  let max = 0;
  for (const value of table) max = Math.max(max, Math.abs(value));
  const scale = max / 127;
  const out = new Float32Array(table.length);
  const q = new Int8Array(table.length);
  for (let i = 0; i < table.length; i++) { q[i] = Math.max(-127, Math.min(127, Math.round(table[i] / scale))); out[i] = q[i] * scale; }
  return { table: out, scale, q };
}

// PCA to fewer dimensions the way scikit-learn does it: center the rows, project on the top eigenvectors of the covariance (Jacobi eigenvalue method)
function pcaReduce(table, rows, dim, target) {
  const mean = new Float64Array(dim);
  for (let r = 0; r < rows; r++) for (let i = 0; i < dim; i++) mean[i] += table[r * dim + i];
  for (let i = 0; i < dim; i++) mean[i] /= rows;
  const cov = Array.from({ length: dim }, () => new Float64Array(dim));
  const centered = new Float64Array(dim);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < dim; i++) centered[i] = table[r * dim + i] - mean[i];
    for (let i = 0; i < dim; i++) { const ci = centered[i]; const row = cov[i]; for (let j = i; j < dim; j++) row[j] += ci * centered[j]; }
  }
  for (let i = 0; i < dim; i++) for (let j = i; j < dim; j++) { cov[i][j] /= rows - 1; cov[j][i] = cov[i][j]; }
  const vectors = Array.from({ length: dim }, (_, i) => { const row = new Float64Array(dim); row[i] = 1; return row; });
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < dim; p++) for (let q = p + 1; q < dim; q++) off += cov[p][q] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < dim - 1; p++) for (let q = p + 1; q < dim; q++) {
      if (Math.abs(cov[p][q]) < 1e-15) continue;
      const theta = (cov[q][q] - cov[p][p]) / (2 * cov[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1); const s = t * c;
      for (let k = 0; k < dim; k++) { const a = cov[k][p]; const b = cov[k][q]; cov[k][p] = c * a - s * b; cov[k][q] = s * a + c * b; }
      for (let k = 0; k < dim; k++) { const a = cov[p][k]; const b = cov[q][k]; cov[p][k] = c * a - s * b; cov[q][k] = s * a + c * b; }
      for (let k = 0; k < dim; k++) { const a = vectors[k][p]; const b = vectors[k][q]; vectors[k][p] = c * a - s * b; vectors[k][q] = s * a + c * b; }
    }
  }
  const order = Array.from({ length: dim }, (_, i) => i).sort((a, b) => cov[b][b] - cov[a][a]).slice(0, target);
  const out = new Float32Array(rows * target);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < dim; i++) centered[i] = table[r * dim + i] - mean[i];
    for (let c = 0; c < target; c++) { let sum = 0; for (let i = 0; i < dim; i++) sum += centered[i] * vectors[i][order[c]]; out[r * target + c] = sum; }
  }
  const total = cov.reduce((sum, row, i) => sum + row[i], 0);
  return { table: out, explained: order.reduce((sum, i) => sum + cov[i][i], 0) / total };
}

async function loadStatic() {
  const started = now();
  const tokenizer = await AutoTokenizer.from_pretrained(model.id);
  const config = JSON.parse(readFileSync(await download(model.id, 'config.json'), 'utf8'));
  const { header, tensors } = readSafetensors(await download(model.id, 'model.safetensors'));
  const names = Object.keys(tensors);
  const embeddings = tensors.embeddings ?? tensors[names[0]];
  const [vocab, dim] = embeddings.shape;
  const base = toFloat32(embeddings);
  const loadMs = now() - started;
  const unk = tokenizer.unk_token_id ?? -1;
  const info = { tensors: Object.fromEntries(names.map(name => [name, { dtype: tensors[name].dtype, shape: tensors[name].shape }])), config, vocab, dim };
  const make = table => {
    const width = table.length / vocab;
    return async texts => {
      const data = new Float32Array(texts.length * width);
      texts.forEach((text, row) => {
        const ids = tokenizer.encode(text, { add_special_tokens: false }).filter(id => id !== unk).slice(0, 512);
        for (const id of ids) for (let i = 0; i < width; i++) data[row * width + i] += table[id * width + i];
        if (ids.length) for (let i = 0; i < width; i++) data[row * width + i] /= ids.length;
      });
      return { data, dim: width, norms: normalizeRows(data, width) };
    };
  };
  const variants = { [modelKey]: { table: base, dim } };
  const int8 = quantizeInt8(base);
  variants[`${modelKey}.int8`] = { table: int8.table, q: int8.q, dim, note: `table quantized to int8, scale ${int8.scale}` };
  const reduced = pcaReduce(base, vocab, dim, 128);
  variants[`${modelKey}.d128`] = { table: reduced.table, dim: 128, note: `PCA to 128 dimensions, ${(reduced.explained * 100).toFixed(1)} percent of the variance kept` };
  const reducedInt8 = quantizeInt8(reduced.table);
  variants[`${modelKey}.d128.int8`] = { table: reducedInt8.table, q: reducedInt8.q, dim: 128, note: 'PCA to 128 dimensions, then int8' };
  for (const variant of Object.values(variants)) variant.embed = make(variant.table);
  return { variants, loadMs, info, header: Object.keys(header) };
}

function cosine(a, b) { let sum = 0; for (let i = 0; i < a.length; i++) sum += a[i] * b[i]; return sum; }

async function embedAll(embed, texts, size) {
  let dim = 0;
  const parts = [];
  const norms = [];
  for (let i = 0; i < texts.length; i += size) {
    const result = await embed(texts.slice(i, i + size));
    dim = result.dim;
    parts.push(result.data);
    norms.push(...result.norms);
  }
  const data = new Float32Array(texts.length * dim);
  let offset = 0;
  for (const part of parts) { data.set(part, offset); offset += part.length; }
  return { data, dim, norms };
}

async function runConfiguration(name, embed, base) {
  const modelCfg = { ...model };
  const meta = { name, model: model.id, label: model.label, dtype: model.dtype ?? 'fp32 table', queryPrefix: model.queryPrefix ?? '', maxLength: model.maxLength ?? null, ...base, node: process.version, transformers: '4.3.2', machine: { cpu: os.cpus()[0].model, cores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 2 ** 30) }, batchSize, index: indexInfo, reps: {} };
  const queryTexts = questions.map(q => queryText(q, modelCfg));
  // The first call loads kernels, so it is not timed
  await embed([queryTexts[0]]);
  const queries = await embedAll(embed, queryTexts, batchSize);
  writeFileSync(join(vectorsDir, `${name}.queries.f32`), Buffer.from(queries.data.buffer));
  meta.dim = queries.dim;
  meta.queryNormBeforeNormalizing = { min: Math.min(...queries.norms), max: Math.max(...queries.norms) };
  // One query at a time, as the browser would do it, in Node on the CPU
  const single = [];
  for (const text of queryTexts) { const t = now(); await embed([text]); single.push(now() - t); }
  meta.queryMs = { median: ms(median(single)), mean: ms(single.reduce((a, b) => a + b, 0) / single.length), worst: ms(Math.max(...single)), runs: single.length };

  const sanity = [];
  for (const [query, related, unrelated] of SANITY) {
    const doc = text => passageText({ title: '', heading: '', text, code: '' }, 'plain', modelCfg);
    const out = await embed([`${modelCfg.queryPrefix ?? ''}${query}`, doc(related), doc(unrelated)]);
    const dim = out.dim;
    const v = i => out.data.subarray(i * dim, (i + 1) * dim);
    const a = cosine(v(0), v(1)); const b = cosine(v(0), v(2));
    sanity.push({ query, related: Math.round(a * 1000) / 1000, unrelated: Math.round(b * 1000) / 1000, ok: a > b });
  }
  meta.sanity = sanity;
  if (model.card) {
    const texts = [...model.card.queries.map(q => `${modelCfg.queryPrefix ?? ''}${q}`), ...model.card.docs.map(text => passageText({ title: '', heading: '', text, code: '' }, 'plain', modelCfg))];
    const out = await embed(texts);
    const nq = model.card.queries.length;
    const v = i => out.data.subarray(i * out.dim, (i + 1) * out.dim);
    meta.cardCheck = { expected: model.card.expected, measured: model.card.queries.map((_, qi) => model.card.docs.map((__, di) => Math.round(cosine(v(qi), v(nq + di)) * 1000) / 1000)) };
  }

  const save = async (rep, indices, timed) => {
    const texts = indices.map(i => passageText(passages[i], rep === 'desc' ? 'titled' : rep, modelCfg));
    const t = now();
    const result = await embedAll(embed, texts, batchSize);
    const elapsed = now() - t;
    writeFileSync(join(vectorsDir, `${name}.${rep}.f32`), Buffer.from(result.data.buffer));
    meta.reps[rep] = { indices, dim: result.dim, count: indices.length, ms: ms(elapsed), normBeforeNormalizing: { min: Math.min(...result.norms), max: Math.max(...result.norms) } };
    console.log(`${name} ${rep}: ${indices.length} texts, dim ${result.dim}, ${ms(elapsed)} ms`);
    if (!timed) return;
  };
  const all = Array.from({ length: mainCount }, (_, i) => i);
  if (reps.includes('titled')) await save('titled', all, true);
  if (reps.includes('plain')) await save('plain', all, false);
  if (reps.includes('code')) await save('code', all.filter(i => passages[i].code), false);
  if (reps.includes('desc')) await save('desc', Array.from({ length: passages.length - mainCount }, (_, i) => mainCount + i), false);
  writeFileSync(join(vectorsDir, `${name}.meta.json`), `${JSON.stringify(meta, null, 1)}\n`);
  console.log(`${name}: dim ${meta.dim}, query ${meta.queryMs.median} ms median, sanity ${sanity.map(s => (s.ok ? 'ok' : 'WRONG')).join(' ')}`);
}

if (model.kind === 'static') {
  const loaded = await loadStatic();
  for (const [name, variant] of Object.entries(loaded.variants)) {
    // The int8 table as it would be shipped, for measuring its compressed size
    if (variant.q) writeFileSync(join(vectorsDir, `${name}.table.i8`), Buffer.from(variant.q.buffer));
    await runConfiguration(name, variant.embed, { loadMs: ms(loaded.loadMs), files: files(model.id), static: loaded.info, note: variant.note ?? 'fp32 table at its native dimension' });
  }
} else {
  const loaded = await loadTransformer();
  const probe = await loaded.embed(['hello world']);
  // Token counts of every passage, to see how many are cut by the input limit
  const counts = [];
  for (let i = 0; i < mainCount; i++) counts.push(await loaded.tokenCount(passageText(passages[i], 'titled', model)));
  const over = counts.filter(c => c > model.maxLength).length;
  await runConfiguration(threads ? `${modelKey}.t${threads}` : modelKey, loaded.embed, { threads: threads ?? 'default', loadMs: ms(loaded.loadMs), files: files(model.id), outputs: probe.outputs, nativeDim: probe.dim, tokens: { median: median(counts), max: Math.max(...counts), overLimit: over, limit: model.maxLength } });
}
