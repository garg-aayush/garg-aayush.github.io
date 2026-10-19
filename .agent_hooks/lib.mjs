import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { text as readStream } from 'node:stream/consumers';

// Claude names the edited file on the tool input; notebook_path is NotebookEdit's spelling.
const PATH_KEYS = ['file_path', 'notebook_path'];
const PATCH_PATH_PREFIXES = ['*** Add File: ', '*** Update File: ', '*** Move to: '];

export async function readEvent(stream = process.stdin) {
  const event = JSON.parse(await readStream(stream));
  if (!event || typeof event !== 'object') throw new Error('hook input is not a JSON object');
  return event;
}

export function repoRoot(cwd) {
  return realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim());
}

function absolutePath(path, cwd) {
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}

// Codex sends apply_patch as a command whose body names the files; Claude sends the path directly.
function patchPaths(tool) {
  const command = typeof tool.command === 'string' ? tool.command : '';
  return command.split('\n').flatMap(line => PATCH_PATH_PREFIXES.filter(prefix => line.startsWith(prefix)).map(prefix => line.slice(prefix.length).trim()));
}

function insideRepo(path, root) {
  const inside = relative(root, path);
  return inside !== '' && !inside.startsWith('..') && !isAbsolute(inside);
}

export function repoRelative(file, root) {
  return relative(root, existsSync(file) ? realpathSync(file) : file).split('\\').join('/');
}

export function editedFiles(event, root = repoRoot(event.cwd)) {
  const tool = event.tool_input ?? {};
  const candidates = [...PATH_KEYS.map(key => tool[key]).filter(value => typeof value === 'string'), ...patchPaths(tool)];
  const files = new Set();
  for (const candidate of candidates) {
    const path = absolutePath(candidate, event.cwd);
    // Compare real paths: /tmp is a symlink on macOS and the repo root comes from git as a real path.
    if (existsSync(path) && statSync(path).isFile() && insideRepo(realpathSync(path), root)) files.add(realpathSync(path));
  }
  return [...files].sort();
}

// Text the agent wrote, per file. previous is the text it replaced, or null for a whole file Write whose old content is gone.
export function writtenText(event) {
  const tool = event.tool_input ?? {};
  const file = typeof tool.file_path === 'string' ? absolutePath(tool.file_path, event.cwd) : null;
  const written = [];
  if (file && typeof tool.content === 'string') written.push({ file, text: tool.content, previous: null });
  if (file && typeof tool.new_string === 'string') written.push({ file, text: tool.new_string, previous: tool.old_string ?? '' });
  if (file && Array.isArray(tool.edits)) {
    for (const edit of tool.edits) if (typeof edit?.new_string === 'string') written.push({ file, text: edit.new_string, previous: edit.old_string ?? '' });
  }
  if (typeof tool.command === 'string') {
    const added = new Map();
    let current = null;
    for (const line of tool.command.split('\n')) {
      const prefix = PATCH_PATH_PREFIXES.find(item => line.startsWith(item));
      if (prefix) {
        current = absolutePath(line.slice(prefix.length).trim(), event.cwd);
        if (!added.has(current)) added.set(current, []);
      } else if (current && line.startsWith('+') && !line.startsWith('+++')) added.get(current).push(line.slice(1));
    }
    for (const [path, lines] of added) if (lines.length) written.push({ file: path, text: lines.join('\n'), previous: '' });
  }
  return written;
}

function print(output) {
  console.log(JSON.stringify(output));
}

export function nothing() {
  print({});
}

export function block(reason) {
  print({ decision: 'block', reason });
}

export function context(message, eventName = 'PostToolUse') {
  print({ hookSpecificOutput: { hookEventName: eventName, additionalContext: message } });
}

export function decide(decision, reason) {
  print({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } });
}
