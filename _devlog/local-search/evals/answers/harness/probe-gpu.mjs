// node probe-gpu.mjs [--mode shell|headless|headed] [--flags "a,b" | --flags none]
// Prints what the browser's WebGPU adapter looks like in the worker.
import { MODES, openSession } from './browser.mjs';

const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const mode = arg('mode') ?? 'headless';
if (!MODES.includes(mode)) throw new Error(`mode must be one of ${MODES.join(', ')}`);
const flags = arg('flags');
const extraArgs = flags === undefined ? undefined : flags === 'none' ? [] : flags.split(',');
const session = await openSession({ mode, backend: 'webgpu', extraArgs });
const probe = await session.call('probe');
console.log(JSON.stringify({ mode, flags: extraArgs ?? 'default webgpu flags', probe, messages: session.messages }, null, 1));
await session.close();
