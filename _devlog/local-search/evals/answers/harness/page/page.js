// The page the runner drives: one worker, a promise per message. window.api.ready resolves when the worker has started.
const worker = new Worker('/worker.js', { type: 'module' });
const pending = new Map();
let next = 1;
const failures = [];
worker.onmessage = ({ data }) => {
  const entry = pending.get(data.id);
  if (!entry) return;
  pending.delete(data.id);
  if (data.ok) entry.resolve(data.result);
  else entry.reject(Object.assign(new Error(data.error.message), { stack: data.error.stack }));
};
worker.onerror = event => {
  failures.push(event.message || 'worker error');
  for (const entry of pending.values()) entry.reject(new Error(`worker error: ${event.message}`));
  pending.clear();
};
const call = (type, args = {}) => new Promise((resolve, reject) => {
  const id = next++;
  pending.set(id, { resolve, reject });
  worker.postMessage({ id, type, ...args });
});
window.api = {
  probe: () => call('probe'),
  load: args => call('load', args),
  generate: args => call('generate', args),
  dispose: () => call('dispose'),
  failures,
};
window.apiReady = true;
