// Launch real Chromium (Playwright's own build) against the local server and give back a page with window.api.
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from './server.mjs';

// Chromium modes: 'shell' is the old headless build (chromium_headless_shell), 'headless' is the full browser without a window (new headless), 'headed' opens a window.
export const MODES = ['shell', 'headless', 'headed'];

// On the Mac of feasibility.md, 'headless' and 'headed' give a real Metal adapter with shader-f16 with no flags at all. 'shell' (the old headless build) gives only the SwiftShader software adapter, with or without --enable-unsafe-webgpu. Pass extra flags with --chromium-flags to try others.
export const WEBGPU_FLAGS = [];

export function launchOptions({ mode = 'headless', backend = 'webgpu', extraArgs } = {}) {
  const args = extraArgs ?? (backend === 'webgpu' ? WEBGPU_FLAGS : []);
  if (mode === 'shell') return { headless: true, args };
  if (mode === 'headless') return { headless: true, channel: 'chromium', args };
  if (mode === 'headed') return { headless: false, channel: 'chromium', args };
  throw new Error(`unknown mode ${mode}`);
}

// Resident memory of the browser and its children, in bytes, from ps. The main process is the one started with our profile directory.
export function browserMemory(profileDir) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean).map(line => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    return m && { pid: +m[1], ppid: +m[2], rssKb: +m[3], command: m[4] };
  }).filter(Boolean);
  const roots = rows.filter(r => r.command.includes(`--user-data-dir=${profileDir}`) && !r.command.includes('--type='));
  const keep = new Set(roots.map(r => r.pid));
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) if (!keep.has(r.pid) && keep.has(r.ppid)) { keep.add(r.pid); grew = true; }
  }
  let total = 0;
  const byType = {};
  for (const r of rows) if (keep.has(r.pid)) {
    total += r.rssKb * 1024;
    const type = r.command.match(/--type=([\w-]+)/)?.[1] ?? 'browser';
    byType[type] = (byType[type] ?? 0) + r.rssKb * 1024;
  }
  return { total, byType };
}

export async function openSession({ mode = 'headless', backend = 'webgpu', profileDir, cacheDir, port = 0, extraArgs, callTimeoutMs = 20 * 60 * 1000, log = () => {} } = {}) {
  const server = await startServer({ cacheDir, port, log });
  const ownProfile = !profileDir;
  profileDir ??= mkdtempSync(join(tmpdir(), 'answer-profile-'));
  const context = await chromium.launchPersistentContext(profileDir, { ...launchOptions({ mode, backend, extraArgs }), viewport: { width: 800, height: 600 } });
  const page = context.pages()[0] ?? await context.newPage();
  const messages = [];
  page.on('console', m => messages.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', e => messages.push(`pageerror: ${e.message}`));
  await page.goto(`${server.origin}/`);
  await page.waitForFunction(() => window.apiReady === true);
  // Peak resident memory while the session is open, sampled twice a second
  const memory = { peak: 0, peakByType: {}, samples: 0 };
  const timer = setInterval(() => {
    try {
      const m = browserMemory(profileDir);
      memory.samples++;
      if (m.total > memory.peak) { memory.peak = m.total; memory.peakByType = m.byType; }
    } catch { /* ps failed once; keep sampling */ }
  }, 500);
  // Call a window.api method and bring back either its result or the error, so a failed load is data
  const call = async (method, args) => {
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ ok: false, error: { message: `no answer from the page after ${Math.round(callTimeoutMs / 1000)} s (${method})` } }), callTimeoutMs); });
    const run = page.evaluate(async ([m, a]) => {
      try { return { ok: true, result: await window.api[m](a) }; } catch (e) { return { ok: false, error: { message: String(e.message), stack: String(e.stack) } }; }
    }, [method, args]).catch(e => ({ ok: false, error: { message: String(e.message) } }));
    try { return await Promise.race([run, timeout]); } finally { clearTimeout(timer); }
  };
  return {
    server, page, context, profileDir, memory, messages, call,
    memoryNow: () => browserMemory(profileDir),
    async close() { clearInterval(timer); await context.close().catch(() => {}); await server.close(); if (ownProfile) rmSync(profileDir, { recursive: true, force: true }); },
  };
}
