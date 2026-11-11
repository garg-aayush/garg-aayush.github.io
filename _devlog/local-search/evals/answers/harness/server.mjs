// A local server standing in for GitHub Pages and huggingface.co, so the page runs on localhost without cross-origin isolation (no COOP or COEP headers), like the real site.
// - /            the harness page (page/)
// - /runtime/    the Transformers.js bundle from node_modules
// - /ort/        the ONNX Runtime WebAssembly files from node_modules
// - /hf/         model files: read from the disk cache, fetched anonymously from huggingface.co on a miss and saved
// It counts the bytes it sends, which is what the browser downloaded.
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { MODELS } from './models.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.onnx': 'application/octet-stream', '.onnx_data': 'application/octet-stream', '.jinja': 'text/plain' };

export const defaultCacheDir = () => process.env.ANSWER_MODEL_CACHE || join(homedir(), '.cache', 'local-search-answer-models');

export async function startServer({ cacheDir = defaultCacheDir(), port = 0, log = () => {} } = {}) {
  const allowed = new Set(Object.values(MODELS).map(m => `${m.repo}/resolve/${m.revision}/`));
  const stats = { model: 0, runtime: 0, page: 0, requests: [], notFound: [], fetchedFromHub: [] };
  const missing = new Set();
  const inflight = new Map();

  const send = (res, status, headers = {}, body) => {
    res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
    res.end(body);
  };

  // Fetch one model file from huggingface.co into the disk cache
  async function ensureModelFile(rel, file) {
    if (existsSync(file)) return true;
    if (missing.has(rel)) return false;
    if (inflight.has(rel)) return inflight.get(rel);
    const job = (async () => {
      const t0 = performance.now();
      const hub = await fetch(`https://huggingface.co/${rel}`, { redirect: 'follow' });
      if (hub.status === 404) { missing.add(rel); return false; }
      if (!hub.ok) throw new Error(`huggingface.co answered ${hub.status} for ${rel}`);
      mkdirSync(dirname(file), { recursive: true });
      const part = `${file}.part`;
      await pipeline(Readable.fromWeb(hub.body), createWriteStream(part));
      renameSync(part, file);
      const bytes = statSync(file).size;
      stats.fetchedFromHub.push({ file: rel, bytes, seconds: +((performance.now() - t0) / 1000).toFixed(1) });
      log(`downloaded ${rel} (${bytes} bytes)`);
      return true;
    })().finally(() => inflight.delete(rel));
    inflight.set(rel, job);
    return job;
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    const count = (kind, n) => { stats[kind] += n; };
    res.on('finish', () => { if (res.statusCode === 404) stats.notFound.push(path); });
    let file, kind = 'page';
    if (path.startsWith('/hf/')) {
      const rel = path.slice(4);
      if (![...allowed].some(prefix => rel.startsWith(prefix)) || rel.includes('..')) return send(res, 403, {}, 'not a pinned model path');
      file = join(cacheDir, rel);
      kind = 'model';
      if (!(await ensureModelFile(rel, file))) return send(res, 404, {}, 'not found');
    } else if (path.startsWith('/runtime/')) {
      file = resolve(here, 'node_modules/@huggingface/transformers/dist', path.slice(9));
      kind = 'runtime';
    } else if (path.startsWith('/ort/')) {
      file = resolve(here, 'node_modules/onnxruntime-web/dist', path.slice(5));
      kind = 'runtime';
    } else {
      file = resolve(here, 'page', path === '/' ? 'index.html' : path.slice(1));
      if (!file.startsWith(resolve(here, 'page') + sep)) return send(res, 403, {}, 'forbidden');
    }
    file = normalize(file);
    if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, {}, 'not found');
    const size = statSync(file).size;
    const headers = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': size };
    if (req.method === 'HEAD') return send(res, 200, headers);
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    let start = 0, end = size - 1, status = 200;
    if (range) {
      start = Number(range[1]);
      end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      headers['Content-Length'] = end - start + 1;
    }
    res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
    let sent = 0;
    const stream = createReadStream(file, { start, end });
    stream.on('data', chunk => { sent += chunk.length; });
    res.on('close', () => { count(kind, sent); stats.requests.push({ path, kind, bytes: sent, complete: sent === end - start + 1 }); });
    stream.pipe(res);
  }

  const server = createServer((req, res) => handle(req, res).catch(error => { log(`error ${error.message}`); if (!res.headersSent) send(res, 500, {}, String(error.message)); else res.destroy(); }));
  await new Promise(done => server.listen(port, '127.0.0.1', done));
  const origin = `http://localhost:${server.address().port}`;
  return {
    origin,
    stats,
    resetStats() { stats.model = stats.runtime = stats.page = 0; stats.requests.length = 0; },
    close: () => new Promise(done => { server.closeAllConnections(); server.close(done); }),
  };
}
