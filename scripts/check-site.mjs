import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseFragment } from 'parse5';
import { DOMParser } from '@xmldom/xmldom';
import { base64ToBytes, VECTORS_VERSION } from '../static/js/search-embed.js';
import { INDEX_VERSION } from '../static/js/search-rank.js';
import { hashPages, pageKey, records } from './build-search-index.mjs';
import { embedPassages, loadTable } from './build-search-vectors.mjs';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
const siteUrl = 'https://aayushgarg.dev/';
const localHosts = new Set(['aayushgarg.dev', 'garg-aayush.github.io']);

export function srcsetUrls(value) {
  const urls = [];
  let rest = value;
  while (rest.trim()) {
    rest = rest.replace(/^[\s,]+/, '');
    const match = rest.match(/^\S+/);
    if (!match) break;
    const url = match[0];
    urls.push(url.replace(/,+$/, ''));
    rest = rest.slice(url.length);
    if (!url.endsWith(',')) rest = rest.replace(/^[^,]*(?:,|$)/, '');
  }
  return urls;
}

function cssUrls(text) {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return [
    ...Array.from(css.matchAll(/url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/gs), match => match[2] ?? match[3]),
    ...Array.from(css.matchAll(/@import\s+(["'])(.*?)\1/gs), match => match[2]),
  ];
}

function htmlReferences(document) {
  const references = [];
  const ids = new Set();
  function visit(node) {
    const attrs = Object.fromEntries((node.attrs ?? []).map(attr => [attr.name, attr.value]));
    if (attrs.id) ids.add(attrs.id);
    if (node.tagName === 'a' && attrs.name) ids.add(attrs.name);
    for (const attr of ['href', 'src', 'poster']) if (attrs[attr]) references.push(attrs[attr]);
    if (node.tagName === 'object' && attrs.data) references.push(attrs.data);
    if (attrs.srcset) references.push(...srcsetUrls(attrs.srcset));
    if (attrs.style) references.push(...cssUrls(attrs.style));
    if (node.tagName === 'style') references.push(...cssUrls((node.childNodes ?? []).map(child => child.value ?? '').join('')));
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  }
  visit(document);
  return { references, ids };
}

export async function checkSite(directory) {
  const root = resolve(directory);
  const errors = [];
  const names = await readdir(root, { recursive: true });
  const documents = new Map();
  const references = [];
  for (const required of ['index.html', 'index.xml', 'blog/index.xml', 'sitemap.xml']) {
    if (!names.includes(required)) errors.push(`${required}: required rendered output is missing`);
  }
  for (const name of names) {
    const path = join(root, name);
    const extension = extname(path);
    if (!['.html', '.css', '.xml'].includes(extension)) continue;
    const text = await readFile(path, 'utf8');
    const base = new URL(name.split('\\').join('/'), siteUrl);
    if (extension === '.html') {
      const parsed = htmlReferences(parse(text));
      documents.set(path, parsed.ids);
      references.push(...parsed.references.map(url => ({ source: name, base, url })));
    } else if (extension === '.css') {
      references.push(...cssUrls(text).map(url => ({ source: name, base, url })));
    } else {
      let xml;
      try {
        xml = new DOMParser({ onError(level, message) { if (level !== 'warning') throw new Error(message); } }).parseFromString(text, 'application/xml');
      } catch (error) {
        errors.push(`${name}: invalid XML: ${error.message}`);
        continue;
      }
      for (const element of Array.from(xml.getElementsByTagName('*'))) {
        const tag = element.localName;
        if (tag === 'guid') continue;
        if (['link', 'loc'].includes(tag) || (tag === 'url' && !Array.from(element.childNodes).some(child => child.nodeType === 1))) {
          const url = element.getAttribute('href') || element.textContent.trim();
          if (url) references.push({ source: name, base, url });
        }
        if (tag === 'enclosure' && element.hasAttribute('url')) references.push({ source: name, base, url: element.getAttribute('url') });
        if (tag === 'description') references.push(...htmlReferences(parseFragment(element.textContent)).references.map(url => ({ source: `${name} description`, base, url })));
      }
    }
  }
  for (const { source, base, url: raw } of references) {
    let url;
    try { url = new URL(raw, base); } catch { errors.push(`${source}: invalid URL ${raw}`); continue; }
    if (!['http:', 'https:'].includes(url.protocol) || !localHosts.has(url.hostname)) continue;
    let pathname;
    let fragment;
    try {
      pathname = decodeURIComponent(url.pathname);
      fragment = decodeURIComponent(url.hash.slice(1)).split(':~:')[0];
    } catch { errors.push(`${source}: invalid URL encoding ${raw}`); continue; }
    let target = resolve(root, '.' + pathname);
    if (relative(root, target).startsWith('..')) { errors.push(`${source}: URL escapes rendered output ${raw}`); continue; }
    try {
      if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
      if (!(await stat(target)).isFile()) throw new Error('not a file');
    } catch { errors.push(`${source}: missing target ${raw} (${relative(root, target)})`); continue; }
    // #category=... is Quarto's listing filter hash, read by its script, not an element id
    if (fragment && !fragment.startsWith('category=') && extname(target) === '.html' && !documents.get(target)?.has(fragment)) errors.push(`${source}: missing fragment ${raw} (${relative(root, target)}#${fragment})`);
  }
  return { pages: documents.size, references: references.length, errors };
}

// The search files a render has to leave: the index covers every page the search page lists, the vectors belong to that index and were made with the table the manifest names, and the table files are the ones the manifest hashes. A broken post-render step otherwise leaves a page that quietly falls back to keyword search.
export async function checkSearch(directory) {
  const root = resolve(directory);
  const errors = [];
  const read = async name => {
    try { return await readFile(join(root, name)); } catch { errors.push(`${name}: required rendered output is missing`); return null; }
  };
  const [searchPage, indexBytes, vectorsBytes, manifestBytes] = await Promise.all(['search/index.html', 'search-index.json', 'search-vectors.json', 'static/search/manifest.json'].map(read));
  if (!searchPage || !indexBytes) return { errors };

  let index;
  try { index = JSON.parse(indexBytes.toString('utf8')); } catch (error) { return { errors: [...errors, `search-index.json: invalid JSON: ${error.message}`] }; }
  if (index.v !== INDEX_VERSION) errors.push(`search-index.json: version ${index.v}, the page reads ${INDEX_VERSION}`);
  if (index.hash !== hashPages(index.pages ?? [])) errors.push('search-index.json: hash does not match its pages');
  const indexed = new Map((index.pages ?? []).map(page => [page.h, page]));
  const listed = records(searchPage.toString('utf8'));
  if (!listed.length) errors.push('search/index.html: no pages listed for the search index');
  for (const record of listed) {
    const page = indexed.get(pageKey(record.href));
    if (!page) errors.push(`search-index.json: ${record.href} is listed on the search page but is not indexed`);
    else if (record.body !== false && !page.p.length) errors.push(`search-index.json: ${record.href} has no passages`);
  }
  if (indexed.size > listed.length) errors.push(`search-index.json: ${indexed.size} pages indexed but ${listed.length} listed`);

  if (!vectorsBytes || !manifestBytes) return { errors };
  let vectors;
  let manifest;
  try { vectors = JSON.parse(vectorsBytes.toString('utf8')); manifest = JSON.parse(manifestBytes.toString('utf8')); } catch (error) { return { errors: [...errors, `search vectors or manifest: invalid JSON: ${error.message}`] }; }
  const passages = (index.pages ?? []).reduce((sum, page) => sum + 1 + page.p.length, 0);
  if (vectors.v !== VECTORS_VERSION) errors.push(`search-vectors.json: version ${vectors.v}, the page reads ${VECTORS_VERSION}`);
  if (vectors.index !== index.hash) errors.push(`search-vectors.json: made for index ${vectors.index}, the index is ${index.hash}`);
  if (vectors.count !== passages) errors.push(`search-vectors.json: ${vectors.count} vectors for ${passages} passages`);
  if (vectors.dimensions !== manifest.dimensions) errors.push(`search-vectors.json: ${vectors.dimensions} dimensions, the table has ${manifest.dimensions}`);
  if (base64ToBytes(vectors.vectors ?? '').length !== vectors.count * vectors.dimensions) errors.push('search-vectors.json: the vector data is not count x dimensions bytes');
  for (const [name, file] of [['table', manifest.files.table], ['vocab', manifest.files.vocab]]) {
    const pointer = vectors[name];
    if (pointer?.sha256 !== file.sha256 || pointer?.path !== `static/search/${file.path}`) errors.push(`search-vectors.json: its ${name} is not the one static/search/manifest.json names`);
    const bytes = await read(`static/search/${file.path}`);
    if (bytes && (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256)) errors.push(`static/search/${file.path}: does not match its hash in manifest.json`);
  }
  if (errors.length) return { errors };

  // The vectors must be the ones the index text and the table give, so an edited page cannot keep an old vector
  try {
    const { embedder } = await loadTable(join(root, 'static/search'));
    const fresh = embedPassages(index, embedder);
    const stored = base64ToBytes(vectors.vectors);
    if (fresh.data.length !== stored.length || fresh.data.some((value, i) => value !== (stored[i] << 24 >> 24)) || Math.abs(fresh.scale - vectors.scale) > 1e-12) errors.push('search-vectors.json: the vectors are not what the index text and the table give');
  } catch (error) {
    errors.push(`search-vectors.json: ${error.message}`);
  }
  return { errors, pages: indexed.size, passages };
}

if (import.meta.main) {
  const outputDir = resolve(projectDir, process.argv[2] ?? '_site');
  const result = await checkSite(outputDir);
  const search = await checkSearch(outputDir);
  const errors = [...result.errors, ...search.errors];
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log(`Rendered site: ${result.pages} HTML pages and ${result.references} references passed; search: ${search.pages} pages and ${search.passages} passages indexed and embedded`);
}
