// Validates the stage 3 answer question set against the site sources and prints counts.
// Usage: node _devlog/local-search/evals/answers/check-answer-questions.mjs [questions file] (from anywhere; paths resolve from this file).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const answerableKinds = ['fact', 'how', 'broad', 'person'];
const unanswerableKinds = ['near-miss', 'off-topic'];
const prefixes = { fact: 'fact', how: 'how', broad: 'broad', person: 'person', 'near-miss': 'near', 'off-topic': 'off' };
const errors = [];
const warnings = [];

const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, 'questions.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const answerable = data.answerable || [];
const unanswerable = data.unanswerable || [];

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
  return [k.replace(/\.html$/, '.qmd'), k].map((c) => path.join(root, c)).find((c) => fs.existsSync(c));
}

// Fenced code is left out so a quote cannot come only from code. Whitespace runs are collapsed because some sources are hard-wrapped.
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const proseCache = new Map();
function proseOf(file) {
  if (!proseCache.has(file)) proseCache.set(file, norm(fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, ' ')));
  return proseCache.get(file);
}

// Pandoc-style heading ids, plus explicit {#id} and <a name="..."> anchors.
function anchorsOf(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  const ids = new Set();
  for (const m of text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    let h = m[1];
    const explicit = h.match(/\{#([^}\s]+)[^}]*\}\s*$/);
    if (explicit) { ids.add(explicit[1]); continue; }
    h = h.replace(/\{[^}]*\}\s*$/, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '');
    const slug = h.toLowerCase().replace(/[^\p{L}\p{N}_\-. ]/gu, '').trim().replace(/\s+/g, '-').replace(/^[^\p{L}]+/u, '');
    if (slug) ids.add(slug);
  }
  for (const m of text.matchAll(/<a name="([^"]+)"/g)) ids.add(m[1]);
  return ids;
}

function checkHref(where, href) {
  if (typeof href !== 'string' || /^\/|^https?:|#/.test(href)) { errors.push(`${where}: ${href} must be site-root relative with no fragment`); return null; }
  if (!searchable.has(key(href))) errors.push(`${where}: ${href} is not in the searchable page list`);
  const src = sourceFor(href);
  if (!src) errors.push(`${where}: ${href} has no source file`);
  return src;
}

// Retrieval queries, to catch a question that repeats one of them.
const retrieval = [];
for (const f of ['questions.json', 'questions-holdout.json']) {
  const p = path.join(here, '..', f);
  if (fs.existsSync(p)) for (const q of JSON.parse(fs.readFileSync(p, 'utf8')).questions) retrieval.push(q.query);
}
const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
function closestRetrieval(question) {
  const a = words(question);
  let best = { score: 0, query: '' };
  for (const r of retrieval) {
    const b = words(r);
    if (!b.size) continue;
    const shared = [...b].filter((w) => a.has(w)).length;
    const score = shared / b.size;
    if (score > best.score) best = { score, query: r };
  }
  return best;
}

const seen = new Set();
const seenQuestions = new Set();
const counts = Object.fromEntries([...answerableKinds, ...unanswerableKinds].map((k) => [k, 0]));
const pagesUsed = new Set();
let quotes = 0;

function checkCommon(q, kinds) {
  const where = q.id || JSON.stringify(q.question);
  if (!q.id || !/^[a-z]+-\d{2}$/.test(q.id)) errors.push(`${where}: id must look like fact-01`);
  if (seen.has(q.id)) errors.push(`${where}: duplicate id`);
  seen.add(q.id);
  if (typeof q.question !== 'string' || !q.question.trim()) errors.push(`${where}: empty question`);
  else {
    const n = norm(q.question.toLowerCase());
    if (seenQuestions.has(n)) errors.push(`${where}: question repeated in this set`);
    seenQuestions.add(n);
    if (retrieval.some((r) => norm(r.toLowerCase()) === n)) errors.push(`${where}: question repeats a retrieval query`);
    const close = closestRetrieval(q.question);
    if (close.score === 1) warnings.push(`${where}: every content word of retrieval query "${close.query}" is in this question`);
  }
  if (!kinds.includes(q.kind)) { errors.push(`${where}: kind must be one of ${kinds.join(', ')}`); return where; }
  counts[q.kind] += 1;
  if (q.id && !q.id.startsWith(`${prefixes[q.kind]}-`)) warnings.push(`${where}: id prefix does not match kind ${q.kind}`);
  return where;
}

for (const q of answerable) {
  const where = checkCommon(q, answerableKinds);
  if (typeof q.reference !== 'string' || !q.reference.trim()) errors.push(`${where}: missing reference`);
  if (!Array.isArray(q.support) || !q.support.length) { errors.push(`${where}: support must be a non-empty list`); continue; }
  const pages = new Set();
  for (const s of q.support) {
    const src = checkHref(where, s.href);
    if (!src) continue;
    pages.add(key(s.href));
    pagesUsed.add(key(s.href));
    if (typeof s.quote !== 'string' || !s.quote.trim()) { errors.push(`${where}: ${s.href} quote is empty`); continue; }
    quotes += 1;
    if (!proseOf(src).includes(norm(s.quote))) errors.push(`${where}: quote not found in ${path.relative(root, src)} outside code: "${s.quote.slice(0, 60)}..."`);
    if (s.section !== undefined) {
      if (!src.endsWith('.qmd')) errors.push(`${where}: ${s.href} section given for a page with no headings`);
      else if (!anchorsOf(src).has(s.section)) errors.push(`${where}: ${s.href} has no heading id ${s.section}`);
    }
  }
  if (q.kind === 'broad' && q.support.length < 2) errors.push(`${where}: a broad question needs two or more supporting passages`);
  if (q.kind === 'broad' && pages.size < 2) warnings.push(`${where}: broad question supported by one page only`);
}

for (const q of unanswerable) {
  const where = checkCommon(q, unanswerableKinds);
  if (q.reference !== undefined || q.support !== undefined) errors.push(`${where}: an unanswerable question has no reference or support`);
  if (typeof q.why !== 'string' || !q.why.trim()) errors.push(`${where}: missing why`);
  if (!Array.isArray(q.nearest) || !q.nearest.length) { errors.push(`${where}: nearest must be a non-empty list`); continue; }
  for (const href of q.nearest) checkHref(where, href);
}

const nAnswerable = answerableKinds.reduce((n, k) => n + counts[k], 0);
const nUnanswerable = unanswerableKinds.reduce((n, k) => n + counts[k], 0);
console.log(`${path.basename(file)}: ${nAnswerable + nUnanswerable} questions, ${nAnswerable} answerable, ${nUnanswerable} unanswerable`);
for (const k of [...answerableKinds, ...unanswerableKinds]) console.log(`  ${k.padEnd(10)} ${counts[k]}`);
console.log(`supporting quotes: ${quotes}`);
console.log(`pages cited as support: ${pagesUsed.size} of ${searchable.size} searchable`);
for (const w of warnings) console.log(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(1);
}
console.log('ok');
