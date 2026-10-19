import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseFragment } from 'parse5';
import { DOMParser } from '@xmldom/xmldom';

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

if (import.meta.main) {
  const outputDir = resolve(projectDir, process.argv[2] ?? '_site');
  const result = await checkSite(outputDir);
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else console.log(`Rendered site: ${result.pages} HTML pages and ${result.references} references passed`);
}
