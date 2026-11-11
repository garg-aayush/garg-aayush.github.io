// Validates questions.json against the site sources and prints counts per type.
// Usage: node _devlog/local-search/evals/check-questions.mjs [questions file] (from anywhere; paths resolve from this file).
// The default file is questions.json; the held-out set's ids carry an h- prefix.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const types = ['lookup', 'topic', 'question', 'paraphrase', 'partial', 'tool', 'person', 'multi', 'none'];
const errors = [];
const warnings = [];

const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, 'questions.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const questions = data.questions;

// The search page is being moved, so accept either location.
const searchPage = ['search.qmd', 'search/index.qmd'].map((p) => path.join(root, p)).find((p) => fs.existsSync(p));
if (!searchPage) errors.push('search page not found (search.qmd or search/index.qmd)');

// Searchable hrefs: the hand-listed pages in the search page front matter plus every post.
const searchable = new Set();
const key = (href) => href.split('#')[0].replace(/^\//, '').replace(/(^|\/)$/, '$1index.html');
if (searchPage) {
  const front = fs.readFileSync(searchPage, 'utf8').split(/^---$/m)[1] || '';
  for (const m of front.matchAll(/^\s+href:\s*(\S+)\s*$/gm)) searchable.add(key(m[1].replace(/^["']|["']$/g, '')));
}
for (const f of fs.readdirSync(path.join(root, 'posts'))) {
  if (/^20.*\.qmd$/.test(f)) searchable.add(`posts/${f.replace(/\.qmd$/, '.html')}`);
  else if (/^20/.test(f) && fs.existsSync(path.join(root, 'posts', f, 'index.qmd'))) searchable.add(`posts/${f}/index.html`);
}

function sourceFor(href) {
  const k = key(href);
  const candidates = [k.replace(/\.html$/, '.qmd'), k];
  return candidates.map((c) => path.join(root, c)).find((c) => fs.existsSync(c));
}

// Pandoc-style heading ids, plus explicit {#id} and <a name="..."> anchors.
function anchorsOf(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  const ids = new Set();
  for (const m of text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    let h = m[1];
    const explicit = h.match(/\{#([^}\s]+)[^}]*\}\s*$/);
    if (explicit) { ids.add(explicit[1]); continue; }
    h = h.replace(/\{[^}]*\}\s*$/, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, (c) => (c === '_' ? '_' : ''));
    const slug = h.toLowerCase().replace(/[^\p{L}\p{N}_\-. ]/gu, '').trim().replace(/\s+/g, '-').replace(/^[^\p{L}]+/u, '');
    if (slug) ids.add(slug);
  }
  for (const m of text.matchAll(/<a name="([^"]+)"/g)) ids.add(m[1]);
  return ids;
}

const seen = new Set();
const counts = Object.fromEntries(types.map((t) => [t, 0]));
const pagesUsed = new Set();
let grade2 = 0;
let grade1 = 0;

for (const q of questions) {
  const where = q.id || JSON.stringify(q.query);
  if (!q.id || !/^(h-)?[a-z]+-\d{2}$/.test(q.id)) errors.push(`${where}: id must look like type-01`);
  if (seen.has(q.id)) errors.push(`${where}: duplicate id`);
  seen.add(q.id);
  if (typeof q.query !== 'string' || !q.query.trim()) errors.push(`${where}: empty query`);
  if (!types.includes(q.type)) { errors.push(`${where}: unknown type ${q.type}`); continue; }
  if (q.id && !q.id.replace(/^h-/, '').startsWith(`${q.type}-`)) warnings.push(`${where}: id prefix does not match type ${q.type}`);
  counts[q.type] += 1;
  if (typeof q.why !== 'string' || !q.why.trim()) errors.push(`${where}: missing why`);
  if (!Array.isArray(q.relevant)) { errors.push(`${where}: relevant must be a list`); continue; }

  if (q.type === 'none' && q.relevant.length) errors.push(`${where}: a none query must have no relevant pages`);
  if (q.type !== 'none' && !q.relevant.some((r) => r.grade === 2)) errors.push(`${where}: an answerable query needs a grade 2 page`);
  if (q.type === 'multi' && q.relevant.filter((r) => r.grade === 2).length < 2) errors.push(`${where}: a multi query needs two or more grade 2 pages`);

  const hrefs = new Set();
  for (const r of q.relevant) {
    if (r.grade !== 1 && r.grade !== 2) errors.push(`${where}: ${r.href} grade must be 1 or 2`);
    if (r.grade === 2) grade2 += 1; else grade1 += 1;
    if (hrefs.has(r.href)) errors.push(`${where}: ${r.href} listed twice`);
    hrefs.add(r.href);
    if (/^\/|^https?:|#/.test(r.href)) errors.push(`${where}: ${r.href} must be site-root relative with no fragment`);
    const src = sourceFor(r.href);
    if (!src) { errors.push(`${where}: ${r.href} has no source file`); continue; }
    if (!searchable.has(key(r.href))) errors.push(`${where}: ${r.href} is not in the searchable page list`);
    pagesUsed.add(key(r.href));
    if (r.section !== undefined) {
      if (!src.endsWith('.qmd')) errors.push(`${where}: ${r.href} section given for a page with no headings`);
      else if (!anchorsOf(src).has(r.section)) errors.push(`${where}: ${r.href} has no heading id ${r.section}`);
    }
  }
}

const answerable = questions.length - counts.none;
console.log(`${path.basename(file)}: ${questions.length} queries, ${answerable} answerable, ${counts.none} with no answer`);
for (const t of types) console.log(`  ${t.padEnd(11)} ${counts[t]}`);
console.log(`relevance judgments: ${grade2} grade 2, ${grade1} grade 1`);
console.log(`pages judged relevant at least once: ${pagesUsed.size} of ${searchable.size} searchable`);
const unused = [...searchable].filter((p) => !pagesUsed.has(p)).sort();
if (unused.length) console.log(`never judged relevant: ${unused.join(', ')}`);
for (const w of warnings) console.log(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(1);
}
console.log('ok');
