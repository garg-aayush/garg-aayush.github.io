import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageKey } from '../static/js/search-rank.js';

const projectDir = fileURLToPath(new URL('../', import.meta.url));

export const SCHEMA_VERSION = 1;
// A section longer than this is split at block boundaries. About one MiniLM input (256 word pieces), which stage 2 will want.
const MAX_PASSAGE = 1000;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'body', 'caption', 'center', 'dd', 'details', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'ol', 'option', 'p', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul']);
// Never visible prose. Buttons are skipped only on Quarto pages, where they are the code copy and callout toggles; on tools they are the labels.
const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'nav', 'footer', 'canvas', 'iframe', 'video', 'audio', 'object', 'embed', 'textarea']);
// Site chrome that sits inside a page's main content, and the tools' back link.
const SKIP_CLASSES = new Set(['listing-no-matching', 'tools-empty', 'tools-filter', 'quarto-title-meta', 'footnote-back', 'footnote-ref', 'sr-only', 'screen-reader-only', 'back', 'back-link']);

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '\u2014', ndash: '\u2013', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', times: '×', middot: '·', larr: '←', rarr: '→', harr: '↔', uarr: '↑', darr: '↓', deg: '°', plusmn: '±', laquo: '«', raquo: '»', copy: '©', bull: '•', minus: '−', le: '≤', ge: '≥', ne: '≠', asymp: '≈', infin: '∞', micro: 'µ', shy: '' };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return whole; }
    }
    return NAMED[name] ?? NAMED[name.toLowerCase()] ?? whole;
  });
}

// A small forgiving HTML parser, so the post-render step needs no package that the deploy job does not install. It handles what Quarto, Pandoc and the hand-written tools emit: void elements, raw text elements, comments, and a few implied end tags.
export function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  const stack = [root];
  const token = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/([a-zA-Z][^\s>/]*)\s*>|<([a-zA-Z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+|<)/g;
  let match;
  while ((match = token.exec(html))) {
    const [, closing, opening, rest, text] = match;
    const top = stack[stack.length - 1];
    if (text !== undefined) {
      top.children.push({ text });
    } else if (closing) {
      const name = closing.toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === name) { stack.length = i; break; }
      }
    } else if (opening) {
      const name = opening.toLowerCase();
      const attrs = {};
      for (const attr of rest.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
        attrs[attr[1].toLowerCase()] = decodeEntities(attr[2] ?? attr[3] ?? attr[4] ?? '');
      }
      // Implied end tags
      if (name === 'p' || BLOCK.has(name)) while (stack[stack.length - 1].tag === 'p') stack.pop();
      if (['li', 'dt', 'dd', 'option', 'tr', 'td', 'th'].includes(name)) {
        const same = name === 'td' || name === 'th' ? ['td', 'th'] : [name];
        if (same.includes(stack[stack.length - 1].tag)) stack.pop();
      }
      const node = { tag: name, attrs, children: [], parent: stack[stack.length - 1] };
      stack[stack.length - 1].children.push(node);
      if (VOID.has(name) || /\/\s*$/.test(rest)) continue;
      if (RAW.has(name)) {
        const end = html.toLowerCase().indexOf(`</${name}`, token.lastIndex);
        const stop = end === -1 ? html.length : end;
        node.children.push({ text: html.slice(token.lastIndex, stop), raw: true });
        token.lastIndex = stop;
        continue;
      }
      stack.push(node);
    }
  }
  return root;
}

function find(node, test) {
  if (node.tag && test(node)) return node;
  for (const child of node.children ?? []) {
    const found = find(child, test);
    if (found) return found;
  }
  return null;
}

const hasClass = (node, name) => (node.attrs?.class ?? '').split(/\s+/).includes(name);

const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
const SYMBOLS = { times: '×', cdot: '·', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', to: '→', rightarrow: '→', leftarrow: '←', in: '∈', pm: '±', infty: '∞', sim: '~', propto: '∝', sum: 'Σ', prod: 'Π', nabla: '∇', partial: '∂', ldots: '...', cdots: '...', dots: '...' };
const FUNCTIONS = new Set(['log', 'ln', 'exp', 'max', 'min', 'argmax', 'argmin', 'sin', 'cos', 'tan', 'tanh', 'det', 'lim', 'sup', 'inf', 'softmax']);
const WRAPPERS = '(?:text|textbf|textit|mathrm|mathbf|mathit|mathcal|mathbb|mathsf|mathtt|operatorname|boldsymbol|bm)';

// Inline math as readable text, for snippets: wrappers and Greek letters become letters, a few operators become symbols, any other command is dropped.
export function mathToText(tex) {
  let s = tex.replace(new RegExp(`\\\\${WRAPPERS}\\s*\\{([^{}]*)\\}`, 'g'), '$1');
  for (let i = 0; i < 2; i++) s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
  s = s.replace(/\\([a-zA-Z]+)/g, (_, name) => GREEK[name] ?? SYMBOLS[name] ?? (FUNCTIONS.has(name) ? name : ' '));
  return s.replace(/\\[,;:! ]/g, ' ').replace(/\\\\|&/g, ' ').replace(/\\([|{}%])/g, '$1').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

// Words in a formula that a reader could search for: text in wrappers, function names and Greek letter names. Bare letters are variables and stay out.
export function mathWords(tex) {
  const words = [];
  for (const m of tex.matchAll(new RegExp(`\\\\${WRAPPERS}\\s*\\{([^{}]*)\\}`, 'g'))) words.push(...(m[1].match(/[A-Za-z]{2,}/g) ?? []));
  for (const m of tex.matchAll(/\\([a-zA-Z]+)/g)) if (GREEK[m[1]] || FUNCTIONS.has(m[1])) words.push(m[1]);
  return words;
}

// The formula inside a Quarto math span, without its delimiters.
function texOf(node) {
  return decodeEntities(node.children.map(child => child.text ?? '').join('')).replace(/^\\[(\[]|\\[)\]]$/g, '').trim();
}

function squash(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Walks a page and returns its passages as [anchor, heading, text, code]. Text is prose in reading order; code is the words that sit in code blocks and formulas, kept apart so snippets stay prose and the ranker can weight them.
export function extractPassages(html, { quarto } = {}) {
  const tree = parseHtml(html);
  const main = find(tree, node => node.tag === 'main' && node.attrs.id === 'quarto-document-content');
  const isQuarto = quarto ?? Boolean(main);
  const root = main ?? find(tree, node => node.tag === 'body') ?? tree;

  const sections = [];
  let section = { anchor: '', heading: '', blocks: [] };
  let buffer = '';
  let extras = [];
  let pendingAnchor = '';

  const flush = () => {
    const text = squash(buffer);
    buffer = '';
    if (!text && !extras.length) return;
    const last = section.blocks[section.blocks.length - 1];
    if (text && last?.t === text) { last.c.push(...extras); extras = []; return; }
    section.blocks.push({ t: text, c: extras });
    extras = [];
  };

  const startSection = (anchor, heading) => {
    flush();
    sections.push(section);
    section = { anchor, heading, blocks: [] };
  };

  const skipped = node => SKIP_TAGS.has(node.tag)
    || (isQuarto && (node.tag === 'button' || (node.tag === 'header' && node.attrs.id === 'title-block-header')))
    || node.attrs.hidden !== undefined
    || node.attrs['aria-hidden'] === 'true'
    || (node.attrs.class ?? '').split(/\s+/).some(name => SKIP_CLASSES.has(name));

  const walk = node => {
    if (node.text !== undefined) {
      if (!node.raw) buffer += decodeEntities(node.text);
      return;
    }
    if (skipped(node)) return;
    const tag = node.tag;

    if (hasClass(node, 'math')) {
      const tex = texOf(node);
      extras.push(...mathWords(tex));
      if (hasClass(node, 'display')) { flush(); return; }
      buffer += mathToText(tex);
      return;
    }
    if (tag === 'pre') {
      flush();
      const code = squash(textOf(node));
      if (code) extras.push(code);
      flush();
      return;
    }
    if (tag === 'img') {
      flush();
      buffer += node.attrs.alt ?? '';
      flush();
      return;
    }
    if (tag === 'br') { buffer += ' '; return; }
    if (['input', 'textarea'].includes(tag)) {
      if (node.attrs.placeholder) { flush(); buffer += node.attrs.placeholder; flush(); }
      return;
    }
    if (tag === 'section' && node.attrs.id && /\blevel[23]\b/.test(node.attrs.class ?? '')) pendingAnchor = node.attrs.id;

    if (tag === 'h1') return;
    if (tag === 'h2' || tag === 'h3') {
      const anchor = node.attrs.id || (/\blevel[23]\b/.test(node.parent?.attrs?.class ?? '') ? node.parent.attrs.id : '') || pendingAnchor;
      pendingAnchor = '';
      const heading = squash(textOf(node));
      if (anchor && !(node.attrs.class ?? '').split(/\s+/).includes('tl-title')) {
        startSection(anchor, heading);
        return;
      }
      flush();
      buffer += heading;
      flush();
      return;
    }

    const block = BLOCK.has(tag);
    if (block) flush();
    for (const child of node.children) walk(child);
    if (block) flush();
  };

  // The text of a node with the same skips and readable math, for headings and code. Formula words are not collected here.
  const textOf = node => {
    let text = '';
    const visit = child => {
      if (child.text !== undefined) { if (!child.raw) text += decodeEntities(child.text); return; }
      if (skipped(child)) return;
      if (hasClass(child, 'math')) { text += mathToText(texOf(child)); return; }
      child.children.forEach(visit);
    };
    node.children.forEach(visit);
    return text;
  };

  walk(root);
  flush();
  sections.push(section);

  const passages = [];
  for (const { anchor, heading, blocks } of sections) {
    let current = null;
    const finish = () => { if (current) passages.push(current); current = null; };
    for (const block of blocks) {
      if (current && block.t && current.text && current.text.length + 1 + block.t.length > MAX_PASSAGE) finish();
      current ??= { anchor, heading, text: '', code: [] };
      current.text = current.text && block.t ? `${current.text}\n${block.t}` : current.text || block.t;
      current.code.push(...block.c);
    }
    finish();
    // A heading with nothing under it still makes its title searchable
    if (!blocks.length && heading && anchor) passages.push({ anchor, heading, text: '', code: [] });
  }
  return passages.map(({ anchor, heading, text, code }) => {
    const joined = [...new Set(code)].join(' ');
    return joined ? [anchor, heading, text, joined] : [anchor, heading, text];
  });
}

export function records(html) {
  const found = [];
  for (const match of html.matchAll(/<script type="application\/json" class="search-records">([\s\S]*?)<\/script>/g)) found.push(...JSON.parse(match[1]));
  return found;
}

const plain = value => squash(decodeEntities(String(value ?? '').replace(/<[^>]+>/g, '')));

export function hashPages(pages) {
  return createHash('sha256').update(JSON.stringify(pages)).digest('hex').slice(0, 16);
}

// complete: a full render. A missing search page or listed page is then an error; a partial render skips what is absent. A page whose text cannot be extracted keeps its title and description and is listed in failed, so one malformed page does not fail the render (npm run check:site still fails on it).
export async function buildSearchIndex(outputDir, { complete = false } = {}) {
  let searchPage;
  try {
    searchPage = await readFile(join(outputDir, 'search/index.html'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' && !complete) return null;
    throw error;
  }
  const pages = [];
  const missing = [];
  const failed = [];
  for (const record of records(searchPage)) {
    const key = pageKey(record.href);
    const page = { h: key, t: plain(record.title), d: plain(record.description), p: [] };
    if (record.body !== false) {
      let html;
      try {
        html = await readFile(join(outputDir, key), 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        missing.push(key);
        continue;
      }
      try {
        page.p = extractPassages(html);
      } catch (error) {
        failed.push({ key, message: error.message });
      }
    }
    pages.push(page);
  }
  if (complete && missing.length) throw new Error(`Search index: listed pages are missing from the render: ${missing.join(', ')}`);
  return { v: SCHEMA_VERSION, hash: hashPages(pages), pages, missing, failed };
}

export async function writeSearchIndex(outputDir, options) {
  const index = await buildSearchIndex(outputDir, options);
  if (!index) return null;
  const { missing, failed, ...data } = index;
  await writeFile(join(outputDir, 'search-index.json'), JSON.stringify(data));
  return { ...data, missing, failed };
}

if (import.meta.main) {
  const outputDir = resolve(projectDir, process.argv[2] ?? process.env.QUARTO_PROJECT_OUTPUT_DIR ?? '_site');
  const started = performance.now();
  const result = await writeSearchIndex(outputDir, { complete: process.env.QUARTO_PROJECT_RENDER_ALL === '1' });
  for (const { key, message } of result?.failed ?? []) console.error(`Search index: could not read the text of ${key} (${message}); indexed with its title and description only`);
  if (process.env.QUARTO_PROJECT_SCRIPT_QUIET !== '1') {
    if (!result) console.log('Search index: no rendered search page, skipped');
    else {
      const passages = result.pages.reduce((sum, page) => sum + page.p.length, 0);
      console.log(`Search index: ${result.pages.length} pages and ${passages} passages in ${Math.round(performance.now() - started)} ms${result.missing.length ? `, ${result.missing.length} listed pages not rendered` : ''}`);
    }
  }
}
