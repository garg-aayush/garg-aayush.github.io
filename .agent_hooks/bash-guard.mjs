import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { ENV_NAMES } from '../scripts/check-secrets.mjs';
import { decide, nothing, readEvent, repoRoot } from './lib.mjs';

// PreToolUse on Bash. A static guard for literal commands and common wrappers, not a shell interpreter: variables, aliases, sourced scripts and heredoc bodies fed to a shell are not evaluated. Pass --codex to turn every ask into a deny, because Codex has no ask decision.

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const READ_COMMANDS = new Set(['cat', 'head', 'tail', 'less', 'more', 'grep', 'rg', 'sed', 'awk', 'bat']);
// The first positional argument of these is the pattern or script, not a file.
const PATTERN_COMMANDS = new Set(['grep', 'rg', 'sed', 'awk']);
const PUBLISHED = 'gh-pages and data are written by the publish workflow and the weather publishers';
const PROTECTED_BRANCHES = { master: 'pushing to master publishes the site; push a feature branch and open a pull request', 'gh-pages': PUBLISHED, data: PUBLISHED };
const BROAD_LITERALS = new Set(['/', '/*', '.', './', './*', '..', '../', '../*', '*', '~', '~/', '~/*', '$HOME', '$HOME/*', '${HOME}', '${HOME}/*']);
const KEYWORDS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', 'time', 'nohup']);
const PUSH_VALUE_FLAGS = new Set(['--repo', '--receive-pack', '--exec', '-o', '--push-option']);
const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix']);
const GH_VALUE_FLAGS = ['-R', '--repo', '--hostname'];
const WRANGLER_VALUE_FLAGS = ['-c', '--config', '-e', '--env', '--name'];
const WRAPPER_VALUE_FLAGS = { env: ['-u', '-C'], sudo: ['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T', '-U'], exec: ['-a'], command: [], npx: ['-p', '--package', '--prefix', '-w', '--workspace'] };
const TOKEN_REFERENCE = new RegExp(`\\$\\{?(?:${ENV_NAMES.join('|')})(?![A-Za-z0-9_])`);
// A $ that single quotes or a backslash protect never expands. Masking it keeps it from looking like a variable reference; a nested shell script gets the real $ back.
const INERT = '\uE000';

class ParseError extends Error {}

const deny = reason => ({ decision: 'deny', reason });
const ask = reason => ({ decision: 'ask', reason });

// A heredoc body is data, not shell. Left in place its prose unbalances the quote tracking below.
export function withoutHeredocs(command) {
  const lines = command.split('\n');
  const kept = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index++];
    kept.push(line);
    for (const match of line.matchAll(/(?<!<)<<(?!<)-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_]\w*))/g)) {
      const delimiter = match[1] ?? match[2] ?? match[3];
      while (index < lines.length && lines[index].trim() !== delimiter) index++;
      index++;
    }
  }
  return kept.join('\n');
}

// Splits on ; & | newline ( ) and backticks outside quotes, and unquotes words. Throws ParseError on an unbalanced quote.
export function commandSegments(command) {
  const text = withoutHeredocs(command);
  const segments = [];
  let words = [];
  let word = '';
  let open = false;
  let quote = '';
  const endWord = () => {
    if (open) words.push(word);
    word = '';
    open = false;
  };
  const endSegment = () => {
    endWord();
    if (words.length) segments.push(words);
    words = [];
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (quote === "'") {
      if (char === "'") quote = '';
      else word += char === '$' ? INERT : char;
    } else if (quote === '"') {
      if (char === '"') quote = '';
      else if (char === '\\' && next !== undefined && '"\\$`\n'.includes(next)) {
        index++;
        if (next !== '\n') word += next === '$' ? INERT : next;
      } else word += char;
    } else if (char === '\\') {
      index++;
      if (next !== undefined && next !== '\n') {
        word += next === '$' ? INERT : next;
        open = true;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      open = true;
    } else if (char === '#' && !open) {
      while (index + 1 < text.length && text[index + 1] !== '\n') index++;
    } else if (char === ' ' || char === '\t' || char === '\r') {
      endWord();
    } else if (';|\n()`'.includes(char) || (char === '&' && !'<>'.includes(text[index - 1] ?? '') && next !== '>')) {
      endSegment();
    } else {
      word += char;
      open = true;
    }
  }
  if (quote) throw new ParseError('unbalanced quote');
  endSegment();
  return segments;
}

// Arguments that are not flags or the values of value taking flags.
function positionals(args, valueFlags = []) {
  const found = [];
  for (let index = 0; index < args.length; index++) {
    if (!args[index].startsWith('-')) found.push(args[index]);
    else if (valueFlags.includes(args[index])) index++;
  }
  return found;
}

function skipOptions(words, valueFlags = []) {
  let rest = words;
  while (rest.length && rest[0].startsWith('-')) {
    if (rest[0] === '--') return rest.slice(1);
    rest = rest.slice(valueFlags.includes(rest[0]) ? 2 : 1);
  }
  return rest;
}

// Strips assignments, shell keywords and wrappers (rtk, env, command, exec, sudo, npx and friends) to reach the command that actually runs.
export function peel(segment) {
  let words = segment;
  while (words.length) {
    const name = basename(words[0]);
    if (/^[A-Za-z_]\w*=/s.test(words[0]) || KEYWORDS.has(words[0])) words = words.slice(1);
    else if (name === 'rtk') words = words[1] === 'proxy' ? words.slice(2) : words.slice(1);
    else if (Object.hasOwn(WRAPPER_VALUE_FLAGS, name)) words = skipOptions(words.slice(1), WRAPPER_VALUE_FLAGS[name]);
    else if (['bunx', 'pnpx'].includes(name)) words = skipOptions(words.slice(1), WRAPPER_VALUE_FLAGS.npx);
    else if (['npm', 'pnpm', 'yarn'].includes(name) && ['exec', 'dlx'].includes(words[1])) words = skipOptions(words.slice(2), WRAPPER_VALUE_FLAGS.npx);
    else return words;
  }
  return words;
}

// True when a short option cluster such as -fd carries the letter; letters after one that takes a value belong to that value.
function hasShortFlag(args, letter, valueLetters = '') {
  return args.some(arg => {
    if (!/^-[A-Za-z]/.test(arg)) return false;
    for (const char of arg.slice(1)) {
      if (char === letter) return true;
      if (valueLetters.includes(char)) return false;
    }
    return false;
  });
}

function currentBranch(dir) {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// Reads the git global options before the subcommand. -C changes the directory the branch lookup uses.
function gitInvocation(args, cwd) {
  let rest = args;
  let dir = cwd;
  const config = [];
  while (rest.length && rest[0].startsWith('-')) {
    const [option] = rest;
    if (GIT_VALUE_OPTIONS.has(option) && rest.length > 1) {
      if (option === '-C') dir = resolve(dir, rest[1]);
      if (option === '-c') config.push(rest[1]);
      rest = rest.slice(2);
    } else rest = rest.slice(1);
  }
  return { args: rest, dir, config };
}

function pushFindings(args, dir, ctx) {
  const flags = [];
  const positional = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--') {
      positional.push(...args.slice(index + 1));
      break;
    }
    if (arg.startsWith('-') && arg !== '-') {
      flags.push(arg);
      if (PUSH_VALUE_FLAGS.has(arg)) index++;
    } else positional.push(arg);
  }
  if (flags.some(flag => flag.startsWith('--force') || flag === '--mirror') || hasShortFlag(flags, 'f', 'o') || positional.some(arg => arg.startsWith('+'))) {
    return [deny('force pushing can overwrite remote history; push without force, and ask Aayush if a force push is really needed')];
  }
  if (flags.includes('--all')) return [deny('git push --all updates every local branch, including master; push the branch by name')];
  const withRepo = flags.some(flag => flag === '--repo' || flag.startsWith('--repo='));
  const refspecs = withRepo ? positional : positional.slice(1);
  const branch = () => ctx.branch(dir);
  const found = [];
  for (const refspec of refspecs) {
    const spec = refspec.replace(/^\+/, '');
    let destination = (spec.includes(':') ? spec.slice(spec.indexOf(':') + 1) : spec).replace(/^refs\/heads\//, '');
    if (destination === 'HEAD') destination = branch();
    if (Object.hasOwn(PROTECTED_BRANCHES, destination)) found.push(deny(`git push to ${destination} is blocked: ${PROTECTED_BRANCHES[destination]}`));
  }
  if (!refspecs.length && !flags.includes('--tags') && branch() === 'master') {
    found.push(deny(`git push without a refspec on master is blocked: ${PROTECTED_BRANCHES.master}`));
  }
  return found;
}

function gitFindings(words, ctx) {
  if (basename(words[0]) !== 'git') return [];
  const { args, dir, config } = gitInvocation(words.slice(1), ctx.cwd);
  const [subcommand, ...rest] = args;
  const found = [];
  if (config.some(entry => entry.toLowerCase().startsWith('core.hookspath'))) found.push(deny('git hooks stay on; do not override core.hooksPath'));
  if (subcommand === 'reset' && rest.includes('--hard')) found.push(deny('git reset --hard can discard working tree changes'));
  if (subcommand === 'clean') {
    const dryRun = rest.includes('--dry-run') || hasShortFlag(rest, 'n', 'e');
    const forced = rest.includes('--force') || hasShortFlag(rest, 'f', 'e');
    const directories = rest.includes('--directories') || hasShortFlag(rest, 'd', 'e');
    if (forced && directories && !dryRun) found.push(deny('git clean with force and directory removal can delete untracked work'));
  }
  if (subcommand === 'commit' && (rest.includes('--no-verify') || hasShortFlag(rest, 'n', 'mFCctSu'))) {
    found.push(deny('commits never bypass the pre-commit and commit-msg hooks'));
  }
  if (subcommand === 'add') {
    const flags = [];
    const paths = [];
    let options = true;
    for (const arg of rest) {
      if (options && arg === '--') options = false;
      else if (options && arg.startsWith('-')) flags.push(arg);
      else paths.push(arg);
    }
    const broadFlag = flags.some(flag => flag === '--all' || flag === '--update') || hasShortFlag(flags, 'A') || hasShortFlag(flags, 'u');
    if (broadFlag || paths.some(path => ['.', './', '*', ':/'].includes(path))) {
      found.push(deny('stage files by name: Quarto appends to .gitignore on render and agent worktrees live under .claude/worktrees/'));
    }
  }
  if (subcommand === 'push') found.push(...pushFindings(rest, dir, ctx));
  return found;
}

function realPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function removeFindings(words, ctx) {
  if (basename(words[0]) !== 'rm') return [];
  const args = words.slice(1);
  const recursive = hasShortFlag(args, 'r') || hasShortFlag(args, 'R') || args.includes('--recursive');
  const forced = hasShortFlag(args, 'f') || args.includes('--force');
  if (!recursive || !forced) return [];
  const broad = new Set(['/', ...[ctx.home, ctx.cwd, dirname(ctx.cwd), ctx.root].flatMap(path => [resolve(path), realPath(path)])]);
  for (const arg of args.filter(arg => !arg.startsWith('-'))) {
    if (BROAD_LITERALS.has(arg)) return [deny('recursive forced deletion targets a broad filesystem location')];
    let target = arg.replace('${HOME}', ctx.home).replace('$HOME', ctx.home);
    if (target === '~' || target.startsWith('~/')) target = ctx.home + target.slice(1);
    if (target.includes('$')) continue;
    // A trailing bare wildcard stands for everything in its directory; compare that directory without expanding the glob.
    if (/(^|\/)\.?[*?]+$/.test(target)) target = target.includes('/') ? target.slice(0, target.lastIndexOf('/')) || '/' : '.';
    const path = resolve(ctx.cwd, target);
    if (broad.has(path) || broad.has(realPath(path))) return [deny('recursive forced deletion targets a broad filesystem location')];
  }
  return [];
}

function sensitivePath(token) {
  const path = token.toLowerCase().split('\\').join('/');
  const name = path.slice(path.lastIndexOf('/') + 1);
  // Tracked placeholder files carry no secrets.
  if (/\.(example|sample|template)$/.test(name)) return false;
  if (['.envrc', '.env', '.dev.vars', 'credentials'].includes(name) || name.startsWith('.env.') || name.startsWith('.dev.vars.')) return true;
  if (/(^|\/)\.ssh\/id_/.test(path) && !path.endsWith('.pub')) return true;
  return /\.(pem|key)$/.test(name);
}

function credentialReadFindings(words) {
  const name = basename(words[0]);
  if (!READ_COMMANDS.has(name)) return [];
  const searches = PATTERN_COMMANDS.has(name);
  let patternGiven = false;
  const paths = [];
  const args = words.slice(1);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const [option, attached] = arg.startsWith('-') ? arg.split(/=(.*)/s) : [arg];
    if (searches && ['-e', '--regexp'].includes(option)) {
      patternGiven = true;
      if (attached === undefined) index++;
    } else if (searches && ['-f', '--file'].includes(option)) {
      patternGiven = true;
      if (attached === undefined) paths.push(args[++index] ?? '');
      else paths.push(attached);
    } else if (!arg.startsWith('-')) paths.push(arg);
    else if (attached) paths.push(attached);
  }
  if (searches && !patternGiven) paths.shift();
  return paths.some(sensitivePath) ? [deny('direct reads of credential files are blocked to keep secrets out of the transcript; ask Aayush if the value is needed')] : [];
}

function printFindings(words) {
  const name = basename(words[0]);
  const args = words.slice(1);
  if (['echo', 'printf'].includes(name) && args.some(arg => TOKEN_REFERENCE.test(arg))) {
    return [deny('printing a token or secret variable puts it in the transcript and logs')];
  }
  if (name === 'printenv' && args.some(arg => ENV_NAMES.includes(arg))) return [deny('printing a token or secret variable puts it in the transcript and logs')];
  return [];
}

function ghFindings(words) {
  if (basename(words[0]) !== 'gh') return [];
  const args = words.slice(1);
  const [group, action] = positionals(args, GH_VALUE_FLAGS);
  if (group === 'auth' && action === 'token') return [deny('gh auth token prints a credential')];
  if (group === 'auth' && action === 'status' && (args.includes('--show-token') || hasShortFlag(args, 't'))) return [deny('gh auth status --show-token prints a credential')];
  if (group === 'pr' && action === 'merge') {
    if (args.includes('--squash') || args.includes('--rebase') || hasShortFlag(args, 's', 'tbFAR') || hasShortFlag(args, 'r', 'tbFAR')) {
      return [deny('this repo merges with a merge commit so every commit lands on master; use gh pr merge --merge')];
    }
    return [ask('merging to master publishes the site')];
  }
  if ((group === 'workflow' && action === 'run') || (group === 'run' && action === 'rerun')) return [ask('this starts a workflow that can publish the site or weather data')];
  if (group === 'secret' && ['set', 'delete'].includes(action)) return [ask('this changes a GitHub Actions secret')];
  return [];
}

function deployFindings(words) {
  const name = basename(words[0]);
  const args = words.slice(1);
  const [verb, subverb] = positionals(args, name === 'wrangler' ? WRANGLER_VALUE_FLAGS : []);
  const reason = 'this deploys or changes the weather Worker';
  if (name === 'wrangler') {
    if (['deploy', 'publish', 'delete', 'rollback'].includes(verb)) return [ask(reason)];
    if (verb === 'secret' && ['put', 'delete', 'bulk'].includes(subverb)) return [ask(reason)];
    if (['versions', 'triggers'].includes(verb) && subverb === 'deploy') return [ask(reason)];
  }
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(name)) {
    const run = args.findIndex(arg => arg === 'run' || arg === 'run-script');
    if ((run >= 0 && args.slice(run + 1).includes('deploy')) || (name === 'yarn' && verb === 'deploy')) return [ask(reason)];
  }
  return [];
}

// The script of sh -c '...', including combined flags such as -lc.
function shellScript(args) {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('-') || arg === '--') return null;
    if (!arg.startsWith('--') && arg.includes('c') && index + 1 < args.length) return args[index + 1];
  }
  return null;
}

function commandFindings(command, ctx, depth) {
  if (depth > 20) return [deny('shell command nesting exceeds the safety check limit')];
  const found = [];
  for (const segment of commandSegments(command)) {
    const words = peel(segment);
    if (!words.length) continue;
    if (SHELLS.has(basename(words[0]))) {
      const script = shellScript(words.slice(1));
      if (script !== null) found.push(...commandFindings(script.replaceAll(INERT, '$'), ctx, depth + 1));
    }
    for (const check of [gitFindings, removeFindings, credentialReadFindings, printFindings, ghFindings, deployFindings]) found.push(...check(words, ctx));
  }
  return found;
}

// Returns null, or the first deny, or else the first ask. A deny anywhere in the command wins over an ask, so approving one step never lets a blocked step through.
export function evaluate(command, { cwd, root, branch = currentBranch, home = homedir() }) {
  let found;
  try {
    found = commandFindings(command, { cwd, root, branch, home }, 0);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    return deny(`could not parse the command (${error.message}); simplify it or ask Aayush to run it by hand`);
  }
  return found.find(item => item.decision === 'deny') ?? found[0] ?? null;
}

async function main() {
  const codex = process.argv.includes('--codex');
  try {
    const event = await readEvent();
    const command = event.tool_input?.command;
    if (typeof command !== 'string') throw new Error('hook input does not contain a Bash command');
    const cwd = resolve(event.cwd);
    const result = evaluate(command, { cwd, root: repoRoot(cwd) });
    if (!result) nothing();
    else if (result.decision === 'ask' && codex) decide('deny', `${result.reason}; ask Aayush to run it by hand`);
    else decide(result.decision, result.reason);
  } catch (error) {
    // Fail closed: a command that cannot be checked does not run.
    decide('deny', `Bash safety check could not complete: ${error.message}`);
  }
}

if (import.meta.main) await main();
