import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
const required = ['title', 'tags', 'categories', 'date', 'permalink', 'description'];

export function validatePost(text, path) {
  const errors = [];
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) return [`${path}: missing YAML frontmatter`];
  let metadata;
  try {
    metadata = parse(frontmatter[1]);
  } catch (error) {
    return [`${path}: invalid YAML: ${error.message}`];
  }
  for (const field of required) {
    const value = metadata?.[field];
    const values = Array.isArray(value) ? value : [value];
    if (!values.length || values.some(item => typeof item !== 'string' || !item.trim())) {
      errors.push(`${path}: ${field} must contain nonempty text`);
    }
    if (!['tags', 'categories'].includes(field) && Array.isArray(value)) errors.push(`${path}: ${field} must be a single value`);
  }
  if (typeof metadata?.date === 'string' && (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.date) || !Number.isFinite(Date.parse(metadata.date)) || new Date(metadata.date).toISOString().slice(0, 10) !== metadata.date)) errors.push(`${path}: date must be a valid YYYY-MM-DD date`);
  if (typeof metadata?.permalink === 'string' && (!metadata.permalink.startsWith('/') || metadata.permalink.startsWith('//'))) errors.push(`${path}: permalink must be a site-relative path`);
  return errors;
}

export async function checkPosts(root = projectDir) {
  const files = await readdir(join(root, 'posts'), { recursive: true });
  const posts = files.filter(path => path.endsWith('.qmd'));
  const errors = [];
  const permalinks = new Map();
  for (const post of posts) {
    const path = join(root, 'posts', post);
    const text = await readFile(path, 'utf8');
    errors.push(...validatePost(text, relative(root, path)));
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    try {
      const permalink = frontmatter && parse(frontmatter[1])?.permalink;
      if (typeof permalink === 'string') {
        if (permalinks.has(permalink)) errors.push(`${relative(root, path)}: duplicate permalink also used by ${permalinks.get(permalink)}`);
        permalinks.set(permalink, relative(root, path));
      }
    } catch { /* Invalid YAML is reported by validatePost. */ }
  }
  if (!posts.length) errors.push('posts/: no Quarto posts found');
  return { count: posts.length, errors };
}

if (import.meta.main) {
  const result = await checkPosts();
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else console.log(`Post metadata: ${result.count} posts passed`);
}
