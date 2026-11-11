// What run-answers.mjs and measure.mjs share: loading a model in the page, one generation, and the facts about this machine and these versions.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS } from './models.mjs';
import { GENERATION, REFUSAL, SYSTEM_PROMPT, buildMessages } from './prompt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const sha = text => createHash('sha256').update(text).digest('hex').slice(0, 12);
export const promptFileSha = () => sha(readFileSync(join(here, 'prompt.mjs'), 'utf8'));
export const pkgVersion = name => JSON.parse(readFileSync(join(here, 'node_modules', name, 'package.json'), 'utf8')).version;

export function environment(probe) {
  return {
    node: process.version,
    transformersJs: pkgVersion('@huggingface/transformers'),
    onnxruntimeWeb: pkgVersion('onnxruntime-web'),
    playwrightCore: pkgVersion('playwright-core'),
    machine: { os: process.platform, arch: process.arch, cpu: cpus()[0]?.model, cores: cpus().length, memoryGB: +(totalmem() / 2 ** 30).toFixed(1) },
    browser: probe ? { userAgent: probe.userAgent, crossOriginIsolated: probe.crossOriginIsolated, hardwareConcurrency: probe.hardwareConcurrency, adapter: probe.adapter, shaderF16: probe.shaderF16, features: probe.features, limits: probe.limits } : undefined,
  };
}

export function settingsFor(key, overrides = {}) {
  const model = MODELS[key];
  return {
    chatTemplateArgs: model.chatTemplateArgs,
    doSample: GENERATION.doSample,
    maxNewTokens: overrides.maxNewTokens ?? GENERATION.maxNewTokens,
    maxSentences: overrides.maxSentences ?? GENERATION.maxSentences,
    repetitionPenalty: overrides.repetitionPenalty ?? model.repetitionPenalty,
    ...(overrides.minNewTokens ? { minNewTokens: overrides.minNewTokens } : {}),
  };
}

export const promptRecord = () => ({ file: 'prompt.mjs', sha: promptFileSha(), system: SYSTEM_PROMPT, refusal: REFUSAL });

// Load one model on one backend in the open session. Never throws: a failed load is returned with its exact error.
export async function loadModel(session, key, backend, dtype) {
  const model = MODELS[key];
  const before = { model: session.server.stats.model, runtime: session.server.stats.runtime };
  const t0 = performance.now();
  const out = await session.call('load', { repo: model.repo, revision: model.revision, dtype: dtype ?? model.dtype, device: backend });
  const wallMs = performance.now() - t0;
  return {
    ok: out.ok,
    error: out.error,
    wallMs,
    ...(out.ok ? out.result : {}),
    bytesModelFiles: session.server.stats.model - before.model,
    bytesRuntime: session.server.stats.runtime - before.runtime,
    messages: [...session.messages],
  };
}

// One generation. Never throws: an error comes back as { ok: false, error }.
export async function generateOne(session, key, item, settings) {
  const messages = item.messages ?? buildMessages(item.question, item.passages);
  const out = await session.call('generate', { messages, ...settings });
  return out.ok ? { ok: true, ...out.result } : { ok: false, error: out.error };
}

// The browser keys its cache by origin, so a run that reuses a profile must reuse the port. A port from the profile's name keeps two different runs side by side apart.
export const portFor = name => 30000 + (parseInt(sha(name).slice(0, 4), 16) % 20000);
