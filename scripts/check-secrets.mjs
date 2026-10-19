import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = fileURLToPath(new URL('../', import.meta.url));

// Credentials this repo uses or could plausibly leak; a literal occurrence of the value in the environment is a hit.
export const ENV_NAMES = ['MAPBOX_TOKEN', 'WAQI_TOKEN', 'TRIGGER_SECRET', 'GITHUB_TOKEN', 'GH_TOKEN', 'CLOUDFLARE_API_TOKEN'];

export const PATTERNS = [
  ['mapbox', /\b[ps]k\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ['github', /\bgh[pousr]_[A-Za-z0-9]{36,}/],
  ['github', /\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['aws access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  // sk-ant- keys also fit the generic shape, so exclude them to report each key once.
  ['openai', /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['huggingface', /\bhf_[A-Za-z0-9]{30,}/],
  ['slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['google api key', /\bAIza[0-9A-Za-z_-]{35}/],
];

// Returns one hit per line and kind. Hits carry the line and kind, never the matched value.
export function scanText(text, env = process.env) {
  if (text.slice(0, 8000).includes('\0')) return [];
  const values = ENV_NAMES.filter(name => (env[name] ?? '').length >= 8).map(name => [name, env[name]]);
  const hits = [];
  text.split('\n').forEach((line, index) => {
    const kinds = new Set();
    for (const [kind, pattern] of PATTERNS) if (pattern.test(line)) kinds.add(kind);
    for (const [name, value] of values) if (line.includes(value)) kinds.add(name);
    for (const kind of kinds) hits.push({ line: index + 1, kind });
  });
  return hits;
}

function git(args) {
  return execFileSync('git', args, { cwd: projectDir, maxBuffer: 1 << 30 });
}

function names(args) {
  return git(args).toString().split('\0').filter(Boolean);
}

export async function scanRepository({ staged = false, env = process.env } = {}) {
  const files = staged ? names(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']) : names(['ls-files', '-z']);
  const hits = [];
  for (const path of files) {
    let content;
    try {
      // The index copy is what a commit records, so staged scans ignore later edits to the working tree.
      content = staged ? git(['show', `:${path}`]) : await readFile(join(projectDir, path));
    } catch (error) {
      if (['ENOENT', 'EISDIR'].includes(error.code)) continue;
      throw error;
    }
    hits.push(...scanText(content.toString('utf8'), env).map(hit => ({ path, ...hit })));
  }
  return { count: files.length, hits };
}

if (import.meta.main) {
  const staged = process.argv.includes('--staged');
  const { count, hits } = await scanRepository({ staged });
  if (hits.length) {
    console.error(hits.map(hit => `${hit.path}:${hit.line} ${hit.kind}`).join('\n'));
    console.error('Secrets stay in GitHub Actions or Worker secrets. Remove the value, and rotate it if it is real.');
    process.exitCode = 1;
  } else console.log(`Secret scan: ${count} ${staged ? 'staged' : 'tracked'} files clean`);
}
