// The passages and queries every stage 2 script embeds, in one fixed order, so vectors saved by embed.mjs line up with the rankings made by compare.mjs.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, '../../../..');
export const evalsDir = resolve(here, '..');
// Model files and vectors stay outside the repo
export const scratch = process.env.STAGE2_SCRATCH ?? '/private/tmp/claude-501/-Users-aayushgarg-REPOS-garg-aayush-github-io/8f12f18b-2c61-494b-8e8f-fa5211658bc2/scratchpad';
export const modelsDir = join(scratch, 'models');
export const vectorsDir = join(scratch, 'vectors');

export const siteDir = resolve(root, process.env.STAGE2_SITE ?? '_site');
const indexText = readFileSync(join(siteDir, 'search-index.json'), 'utf8');
export const indexData = JSON.parse(indexText);
export const indexInfo = { bytes: Buffer.byteLength(indexText), hash: indexData.hash, pages: indexData.pages.length };
export const questionsText = readFileSync(join(evalsDir, 'questions.json'), 'utf8');
export const questions = JSON.parse(questionsText).questions;

export const pages = indexData.pages.map(page => ({ key: page.h, title: page.t, description: page.d }));

// One entry per passage of search-index.json (459), then one per page description (47, only used by the "+descriptions" ablation)
export const passages = [];
indexData.pages.forEach((page, pageIndex) => {
  for (const [anchor, heading, text, code = ''] of page.p) passages.push({ kind: 'passage', page: pageIndex, key: page.h, title: page.t, anchor, heading, text, code });
});
export const mainCount = passages.length;
indexData.pages.forEach((page, pageIndex) => passages.push({ kind: 'description', page: pageIndex, key: page.h, title: page.t, anchor: '', heading: '', text: page.d, code: '' }));

// What text stands for a passage. 'titled' is the headline choice: page title, then section heading, then the prose. 'plain' is the prose alone. 'code' adds the passage's code and formula words after the prose.
// Models with a title slot in their document format (EmbeddingGemma) get the page title there and the heading in front of the prose.
export function passageText(passage, representation, model) {
  const withContext = representation !== 'plain';
  const body = [withContext ? passage.heading : '', passage.text, representation === 'code' ? passage.code : ''].filter(Boolean).join('\n');
  if (model.docFormat === 'gemma') return `title: ${withContext && passage.title ? passage.title : 'none'} | text: ${body}`;
  return withContext ? `${passage.title}\n${body}` : body;
}
export function queryText(question, model) {
  return `${model.queryPrefix ?? ''}${question.query}`;
}
