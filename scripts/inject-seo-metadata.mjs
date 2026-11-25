import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
const SITE_URL = 'https://aayushgarg.dev';
const PERSON_ID = `${SITE_URL}/#person`;

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function escapeAttr(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function getHead(html) {
  const match = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  return match ? match[1] : '';
}

function getMeta(head, attr, value) {
  const pattern = new RegExp(`<meta\\b[^>]*\\b${attr}=["']${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
  const tag = head.match(pattern)?.[0];
  if (!tag) return '';
  const content = tag.match(/\bcontent=(?:"([^"]*)"|'([^']*)')/i);
  return content ? decodeEntities(content[1] ?? content[2] ?? '').trim() : '';
}

function getTagText(html, tag) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? stripTags(match[1]) : '';
}

function extractSameAs(html) {
  const seen = new Set();
  const urls = [];
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["'](https?:\/\/[^"']+)["']/gi)) {
    const href = decodeEntities(match[1]);
    let parsed;
    try { parsed = new URL(href); } catch { continue; }
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const isProfile =
      (host === 'github.com' && /^\/[^/]+\/?$/.test(parsed.pathname)) ||
      (host === 'linkedin.com' && /^\/in\/[^/]+\/?$/.test(parsed.pathname)) ||
      ((host === 'x.com' || host === 'twitter.com') && /^\/[^/]+\/?$/.test(parsed.pathname));
    if (!isProfile) continue;
    const normalized = host === 'twitter.com'
      ? `https://x.com${parsed.pathname.replace(/\/$/, '')}`
      : `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(normalized);
  }
  return urls;
}

export function canonicalUrl(relativePath) {
  const normalized = relativePath.split('\\').join('/').replace(/^\/+/, '');
  if (normalized === 'index.html') return `${SITE_URL}/`;
  if (normalized.endsWith('/index.html')) return `${SITE_URL}/${normalized.slice(0, -'index.html'.length)}`;
  return `${SITE_URL}/${normalized}`;
}

function buildJsonLd(html, head, relativePath, url) {
  const normalized = relativePath.split('\\').join('/');
  const siteName = getMeta(head, 'property', 'og:site_name') || 'Aayush Garg';
  const description = getMeta(head, 'name', 'description');
  const ogImage = getMeta(head, 'property', 'og:image');

  if (normalized === 'index.html') {
    const sameAs = extractSameAs(html);
    const roleMatch = html.match(/<div\b[^>]*class="[^"]*\bhero-role\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const jobTitle = roleMatch ? stripTags(roleMatch[1]) : '';
    const person = {
      '@type': 'Person',
      '@id': PERSON_ID,
      name: siteName,
      url: `${SITE_URL}/`,
    };
    if (jobTitle) person.jobTitle = jobTitle;
    if (description) person.description = description;
    const avatarTag = html.match(/<img\b[^>]*\bclass="[^"]*\bavatar\b[^"]*"[^>]*>/i)?.[0];
    const avatarSrc = avatarTag?.match(/\bsrc="([^"]+)"/i)?.[1];
    if (avatarSrc) person.image = new URL(decodeEntities(avatarSrc), `${SITE_URL}/`).href;
    if (sameAs.length) person.sameAs = sameAs;

    const website = {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: siteName,
      url: `${SITE_URL}/`,
    };
    if (description) website.description = description;

    return {
      '@context': 'https://schema.org',
      '@graph': [website, person],
    };
  }

  if (normalized === 'about.html') {
    const sameAs = extractSameAs(html);
    const person = {
      '@type': 'Person',
      '@id': PERSON_ID,
      name: siteName,
      url: `${SITE_URL}/`,
    };
    if (description) person.description = description;
    if (sameAs.length) person.sameAs = sameAs;
    const page = {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      url,
      name: getTagText(html, 'h1') || getTagText(head, 'title'),
      mainEntity: person,
    };
    if (description) page.description = description;
    return page;
  }

  if (normalized.startsWith('posts/')) {
    const h1Match = html.match(/<h1\b[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
    const headline = h1Match ? stripTags(h1Match[1]) : getTagText(head, 'title');
    const datePublished = getMeta(head, 'name', 'dcterms.date');
    const authorName = getMeta(head, 'name', 'author') || siteName;
    const posting = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline,
      url,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      author: {
        '@type': 'Person',
        '@id': PERSON_ID,
        name: authorName,
        url: `${SITE_URL}/`,
      },
    };
    if (description) posting.description = description;
    if (datePublished) posting.datePublished = datePublished;
    if (ogImage) posting.image = ogImage;
    return posting;
  }

  if (normalized.startsWith('tools/') && normalized !== 'tools/index.html') {
    const name = getTagText(html, 'h1') || getTagText(head, 'title');
    const app = {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name,
      url,
      applicationCategory: 'UtilityApplication',
      operatingSystem: 'Any',
      author: {
        '@type': 'Person',
        '@id': PERSON_ID,
        name: siteName,
        url: `${SITE_URL}/`,
      },
    };
    if (description) app.description = description;
    return app;
  }

  return null;
}

export function injectPageSeo(html, relativePath) {
  const closeHead = html.search(/<\/head>/i);
  if (closeHead === -1) return html;
  const head = getHead(html);
  const url = canonicalUrl(relativePath);
  const normalized = relativePath.split('\\').join('/');
  const description = getMeta(head, 'name', 'description');
  const additions = [];

  if (!/<link\b[^>]*\brel=["']canonical["']/i.test(head)) {
    additions.push(`<link rel="canonical" href="${escapeAttr(url)}">`);
  }
  if (!getMeta(head, 'property', 'og:url')) {
    additions.push(`<meta property="og:url" content="${escapeAttr(url)}">`);
  }
  if (!getMeta(head, 'property', 'og:type')) {
    const ogType = normalized.startsWith('posts/') ? 'article' : 'website';
    additions.push(`<meta property="og:type" content="${ogType}">`);
  }
  if (description && !getMeta(head, 'property', 'og:description')) {
    additions.push(`<meta property="og:description" content="${escapeAttr(description)}">`);
  }
  if (description && !getMeta(head, 'name', 'twitter:description')) {
    additions.push(`<meta name="twitter:description" content="${escapeAttr(description)}">`);
  }
  if (!/<script\b[^>]*\btype=["']application\/ld\+json["']/i.test(head)) {
    const schema = buildJsonLd(html, head, normalized, url);
    if (schema) {
      const json = JSON.stringify(schema).replace(/</g, '\\u003c');
      additions.push(`<script type="application/ld+json">${json}</script>`);
    }
  }

  if (!additions.length) return html;
  return `${html.slice(0, closeHead)}${additions.join('\n')}\n${html.slice(closeHead)}`;
}

export function normalizeSitemap(xml, { exclude = new Set(), extra = [] } = {}) {
  const entries = new Map();
  for (const match of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?\s*<\/url>/g)) {
    let loc = match[1].trim();
    const lastmod = match[2]?.trim() ?? '';
    if (loc.endsWith('/index.html')) loc = `${loc.slice(0, -'index.html'.length)}`;
    if (exclude.has(loc)) continue;
    if (!entries.has(loc)) entries.set(loc, lastmod);
  }
  for (const { loc, lastmod } of extra) {
    if (exclude.has(loc) || entries.has(loc)) continue;
    entries.set(loc, lastmod ?? '');
  }
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const [loc, lastmod] of entries) {
    lines.push('  <url>');
    lines.push(`    <loc>${loc}</loc>`);
    if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push('  </url>');
  }
  lines.push('</urlset>', '');
  return lines.join('\n');
}

export async function injectSeoFiles(outputDir) {
  let pagesUpdated = 0;
  const noindex = new Set();
  const toolEntries = [];

  for (const name of (await readdir(outputDir, { recursive: true })).sort()) {
    const normalized = name.split('\\').join('/');
    if (!normalized.endsWith('.html') || normalized.startsWith('site_libs/')) continue;
    const path = join(outputDir, name);
    const html = await readFile(path, 'utf8');
    const head = getHead(html);
    if (/\bnoindex\b/i.test(getMeta(head, 'name', 'robots'))) {
      noindex.add(canonicalUrl(normalized));
    }
    const updated = injectPageSeo(html, normalized);
    if (updated !== html) {
      await writeFile(path, updated);
      pagesUpdated++;
    }
    if (normalized.startsWith('tools/') && normalized !== 'tools/index.html') {
      const info = await stat(path);
      toolEntries.push({ loc: canonicalUrl(normalized), lastmod: info.mtime.toISOString() });
    }
  }

  let sitemapUpdated = false;
  const sitemapPath = join(outputDir, 'sitemap.xml');
  let sitemapXml;
  try {
    sitemapXml = await readFile(sitemapPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (sitemapXml) {
    const next = normalizeSitemap(sitemapXml, { exclude: noindex, extra: toolEntries });
    if (next !== sitemapXml) {
      await writeFile(sitemapPath, next);
      sitemapUpdated = true;
    }
  }

  return { pagesUpdated, sitemapUpdated };
}

if (import.meta.main) {
  const outputDir = resolve(projectDir, process.argv[2] ?? process.env.QUARTO_PROJECT_OUTPUT_DIR ?? '_site');
  const { pagesUpdated, sitemapUpdated } = await injectSeoFiles(outputDir);
  if (process.env.QUARTO_PROJECT_SCRIPT_QUIET !== '1') {
    console.log(`Inject SEO metadata: ${pagesUpdated} pages updated${sitemapUpdated ? ', sitemap updated' : ''}`);
  }
}
