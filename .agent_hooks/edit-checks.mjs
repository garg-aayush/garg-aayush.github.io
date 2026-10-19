import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { scanText } from '../scripts/check-secrets.mjs';
import { block, context, editedFiles, nothing, readEvent, repoRelative, repoRoot, writtenText } from './lib.mjs';

// PostToolUse after Write, Edit, MultiEdit, NotebookEdit and Codex apply_patch. A secret blocks; every other finding is reported as context and never blocks.

const DASH_EXTENSIONS = new Set(['.md', '.qmd', '.html', '.css', '.scss', '.js', '.mjs', '.cjs', '.lua', '.yml', '.yaml', '.json', '.ejs', '.txt']);
// U+2013 and U+2014, built from char codes so this file holds no dash characters itself.
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
// Hex colors, color functions, and the keywords white and black; a hyphen on either side means a name such as --color-white.
const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(?<![\w-])(?:white|black)(?![\w-])/gi;
// Comments, strings and unquoted url() contents are blanked so braces, semicolons and colors inside them cannot be mistaken for CSS.
const OPAQUE = /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|url\(\s*[^)"'\s][^)]*\)/gi;

export function dashLines(text, previous) {
  return text.split('\n').filter(line => DASH.test(line) && !previous.includes(line));
}

function shorten(line) {
  const trimmed = line.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

// Literal colors in declaration values, as { line, value }. Selectors such as #TOC are not declarations and are skipped.
export function literalColors(css) {
  const text = css.replace(OPAQUE, match => match.replace(/[^\n]/g, ' '));
  const hits = [];
  let start = 0;
  let depth = 0;
  const check = end => {
    const statement = text.slice(start, end);
    const colon = statement.indexOf(':');
    if (colon < 0) return;
    for (const match of statement.slice(colon + 1).matchAll(COLOR)) {
      const line = text.slice(0, start + colon + 1 + match.index).split('\n').length;
      if (!hits.some(hit => hit.line === line && hit.value === match[0])) hits.push({ line, value: match[0] });
    }
  };
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '{') {
      depth++;
      start = index + 1;
    } else if (text[index] === ';' || text[index] === '}') {
      if (depth > 0) check(index);
      if (text[index] === '}') depth = Math.max(0, depth - 1);
      start = index + 1;
    }
  }
  return hits;
}

const isStylesheet = path => path === 'styles.css' || (path.startsWith('static/css/') && path.endsWith('.css'));

function headText(root, path) {
  const result = spawnSync('git', ['show', `HEAD:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  return result.status === 0 ? result.stdout : '';
}

function postCheck(root) {
  if (!existsSync(join(root, 'node_modules/yaml'))) return 'Post check skipped: run npm ci --ignore-scripts to enable the post check.';
  const result = spawnSync(process.execPath, ['scripts/check-posts.mjs'], { cwd: root, encoding: 'utf8', timeout: 20000 });
  if (result.status === 0) return null;
  return `scripts/check-posts.mjs failed:\n${(result.stderr || result.stdout || result.error?.message || 'no output').trim()}`;
}

// Returns { reason } for a blocking secret hit (with any other findings appended), { context } for report-only findings, or {}.
export function editChecks(event, { env = process.env, root = repoRoot(event.cwd) } = {}) {
  const secrets = [];
  const notes = [];
  let posts = false;
  for (const file of editedFiles(event, root)) {
    const path = repoRelative(file, root);
    const content = readFileSync(file, 'utf8');
    secrets.push(...scanText(content, env).map(hit => `  ${path}:${hit.line} ${hit.kind}`));
    if (isStylesheet(path)) {
      const hits = literalColors(content);
      if (hits.length) notes.push(`Literal colors in ${path}; colors belong in static/design-tokens.css, use var():\n${hits.map(hit => `  ${path}:${hit.line} ${hit.value}`).join('\n')}`);
    }
    if (/^posts\/.+\.(qmd|md)$/.test(path)) posts = true;
  }

  const dashes = new Map();
  for (const { file, text, previous } of writtenText(event)) {
    const path = repoRelative(file, root);
    if (!DASH_EXTENSIONS.has(extname(path))) continue;
    const lines = dashLines(text, previous ?? headText(root, path));
    if (lines.length) dashes.set(path, [...new Set([...(dashes.get(path) ?? []), ...lines.map(shorten)])]);
  }
  for (const [path, lines] of dashes) {
    notes.push(`Em or en dashes in text just written to ${path}; replace with commas, colons or parentheses, ranges use a hyphen:\n${lines.map(line => `  ${line}`).join('\n')}`);
  }
  if (posts) {
    const note = postCheck(root);
    if (note) notes.push(note);
  }

  if (secrets.length) {
    const found = `Secret scan found credential shaped content:\n${secrets.join('\n')}\nRemove the value; tokens stay in GitHub Actions or Worker secrets.`;
    return { reason: [found, ...notes].join('\n\n') };
  }
  return notes.length ? { context: notes.join('\n\n') } : {};
}

async function main() {
  try {
    const result = editChecks(await readEvent());
    if (result.reason) block(result.reason);
    else if (result.context) context(result.context);
    else nothing();
  } catch (error) {
    block(`Edit checks could not complete: ${error.message}`);
  }
}

if (import.meta.main) await main();
