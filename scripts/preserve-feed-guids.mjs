import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
const legacyGuids = JSON.parse(await readFile(new URL('./legacy-feed-guids.json', import.meta.url), 'utf8'));
const guidMap = new Map(legacyGuids.map(guid => [
  `https://aayushgarg.dev${new URL(guid).pathname}`,
  guid,
]));

export function preserveFeedGuids(xml) {
  // Quarto emits plain GUID text. Skip literal XML in comments and CDATA.
  return xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<guid(?:\s[^>]*)?>([^<]*)<\/guid>/g, (element, guid) => {
    const legacyGuid = guidMap.get(guid);
    return legacyGuid ? `<guid isPermaLink="false">${legacyGuid}</guid>` : element;
  });
}

export async function preserveFeedFiles(outputDir, { requireFeeds = false } = {}) {
  let processed = 0;
  for (const feed of ['index.xml', 'blog/index.xml']) {
    const path = resolve(outputDir, feed);
    let xml;
    try {
      xml = await readFile(path, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT' && !requireFeeds) continue;
      throw error;
    }
    const updated = preserveFeedGuids(xml);
    if (updated !== xml) await writeFile(path, updated);
    processed++;
  }
  return processed;
}

if (import.meta.main) {
  const outputDir = resolve(projectDir, process.argv[2] ?? process.env.QUARTO_PROJECT_OUTPUT_DIR ?? '_site');
  const processed = await preserveFeedFiles(outputDir, { requireFeeds: process.env.QUARTO_PROJECT_RENDER_ALL === '1' });
  if (process.env.QUARTO_PROJECT_SCRIPT_QUIET !== '1') {
    console.log(`Preserve published RSS identities: ${processed} feeds checked`);
  }
}
