// Transformers.js in a Web Worker, as the site's search page would run it. Messages in: { id, type, ...args }. Messages out: { id, ok, result | error }.
import { AutoModelForCausalLM, AutoTokenizer, InterruptableStoppingCriteria, TextStreamer, env } from '/runtime/transformers.min.js';

env.allowLocalModels = false;
env.remoteHost = `${self.location.origin}/hf/`;
env.backends.onnx.wasm.wasmPaths = {
  mjs: `${self.location.origin}/ort/ort-wasm-simd-threaded.asyncify.mjs`,
  wasm: `${self.location.origin}/ort/ort-wasm-simd-threaded.asyncify.wasm`,
};
// One thread: GitHub Pages cannot send the headers that cross-origin isolation needs
env.backends.onnx.wasm.numThreads = 1;

let tokenizer = null;
let model = null;
let loaded = null;

async function probe() {
  const info = { crossOriginIsolated: self.crossOriginIsolated, hardwareConcurrency: navigator.hardwareConcurrency, userAgent: navigator.userAgent, hasNavigatorGpu: !!navigator.gpu };
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) info.adapter = null;
      else {
        const i = adapter.info || {};
        info.adapter = { vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description, isFallbackAdapter: i.isFallbackAdapter ?? adapter.isFallbackAdapter };
        info.features = [...adapter.features].sort();
        info.shaderF16 = adapter.features.has('shader-f16');
        info.limits = { maxBufferSize: adapter.limits.maxBufferSize, maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize };
      }
    } catch (error) { info.adapterError = String(error); }
  }
  return info;
}

async function load({ repo, revision, dtype, device }) {
  const t0 = performance.now();
  // Pin the revision in the URL template, not with the `revision` option: with the option, 4.3.2 builds a cache key that is not a URL and skips the Cache Storage write, and its tokenizer file check asks for "main"
  env.remotePathTemplate = `{model}/resolve/${revision}/`;
  const files = new Map();
  let lastDone = 0;
  const progress = event => {
    if (!event.file) return;
    const row = files.get(event.file) || { loaded: 0, total: 0 };
    if (event.status === 'progress' || event.status === 'done') { row.loaded = event.loaded ?? row.loaded; row.total = event.total ?? row.total; }
    if (event.status === 'done') lastDone = performance.now() - t0;
    files.set(event.file, row);
  };
  tokenizer = await AutoTokenizer.from_pretrained(repo, { progress_callback: progress });
  const tTokenizer = performance.now() - t0;
  model = await AutoModelForCausalLM.from_pretrained(repo, { dtype, device, progress_callback: progress });
  const totalMs = performance.now() - t0;
  loaded = { repo, revision, dtype, device };
  return { totalMs, tokenizerMs: tTokenizer, lastFileDoneMs: lastDone, sessionInitMs: totalMs - lastDone, files: Object.fromEntries(files) };
}

// Two complete sentences: a terminator (with closing quotes or brackets) followed by whitespace. Text after the last such terminator is cut.
function sentenceEnds(text) {
  const ends = [];
  const re = /[.!?]["')\]]*(?=\s)/g;
  let m;
  while ((m = re.exec(text))) ends.push(m.index + m[0].length);
  return ends;
}

async function generate({ messages, chatTemplateArgs, maxNewTokens, minNewTokens, maxSentences, repetitionPenalty, doSample }) {
  const tStart = performance.now();
  const prompt = tokenizer.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true, ...chatTemplateArgs });
  const inputs = tokenizer.apply_chat_template(messages, { add_generation_prompt: true, return_dict: true, ...chatTemplateArgs });
  const promptTokens = inputs.input_ids.dims.at(-1);
  const tTokenized = performance.now();
  const ids = [];
  const stamps = [];
  let stop = 'eos';
  const stopper = new InterruptableStoppingCriteria();
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: () => {},
    token_callback_function: tokens => {
      stamps.push(performance.now());
      ids.push(...tokens.map(Number));
      if (maxSentences && sentenceEnds(tokenizer.decode(ids, { skip_special_tokens: true })).length >= maxSentences) {
        stop = 'sentences';
        stopper.interrupt();
      }
    },
  });
  await model.generate({
    ...inputs,
    max_new_tokens: maxNewTokens,
    ...(minNewTokens ? { min_new_tokens: minNewTokens } : {}),
    do_sample: !!doSample,
    repetition_penalty: repetitionPenalty,
    streamer,
    stopping_criteria: stopper,
  });
  const tEnd = performance.now();
  const text = tokenizer.decode(ids, { skip_special_tokens: true });
  let answer = text;
  if (stop === 'sentences') answer = text.slice(0, sentenceEnds(text)[maxSentences - 1]);
  else if (ids.length >= maxNewTokens) stop = 'length';
  const decodeMs = stamps.length > 1 ? stamps.at(-1) - stamps[0] : 0;
  return {
    answer: answer.trim(),
    raw: text,
    prompt,
    promptTokens,
    tokens: ids.length,
    stop,
    ms: tEnd - tStart,
    tokenizeMs: tTokenized - tStart,
    ttftMs: stamps.length ? stamps[0] - tTokenized : null,
    decodeTokensPerSecond: decodeMs > 0 ? (stamps.length - 1) / (decodeMs / 1000) : null,
    jsHeapUsed: performance.memory?.usedJSHeapSize ?? null,
  };
}

async function dispose() {
  await model?.dispose?.();
  model = tokenizer = loaded = null;
}

self.onmessage = async ({ data }) => {
  const { id, type, ...args } = data;
  try {
    const result = type === 'probe' ? await probe() : type === 'load' ? await load(args) : type === 'generate' ? await generate(args) : type === 'dispose' ? await dispose() : (() => { throw new Error(`unknown message ${type}`); })();
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: { message: String(error?.message ?? error), stack: String(error?.stack ?? '') } });
  }
};
