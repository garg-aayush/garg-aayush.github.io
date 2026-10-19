import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { evaluate } from '../.agent_hooks/bash-guard.mjs';
import { dashLines, editChecks, literalColors } from '../.agent_hooks/edit-checks.mjs';
import { editedFiles, repoRoot, writtenText } from '../.agent_hooks/lib.mjs';
import { checkPrompt } from '../.agent_hooks/prompt-secrets.mjs';
import { ENV_NAMES, scanText } from './check-secrets.mjs';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
const hook = name => join(projectDir, '.agent_hooks', name);
const emDash = String.fromCharCode(0x2014);
const enDash = String.fromCharCode(0x2013);

// Credential shaped values are assembled at runtime so this file never holds one and the repo-wide scan stays clean.
const fakes = {
  mapbox: ['pk', `eyJ${'a'.repeat(30)}`, 'b'.repeat(30)].join('.'),
  github: `ghp_${'a1'.repeat(20)}`,
  'github fine grained': `github_pat_${'A'.repeat(55)}`,
  'private key': `-----BEGIN ${'RSA '}PRIVATE KEY-----`,
  'aws access key': `AKIA${'B'.repeat(16)}`,
  anthropic: `sk-ant-${'x'.repeat(30)}`,
  openai: `sk-${'z'.repeat(40)}`,
  'openai project': `sk-proj-${'y'.repeat(40)}`,
  huggingface: `hf_${'h'.repeat(34)}`,
  slack: `xoxb-${'1'.repeat(12)}`,
  'google api key': `AIza${'g'.repeat(35)}`,
};
const expectedKind = kind => (kind.startsWith('github') ? 'github' : kind.startsWith('openai') ? 'openai' : kind);
const noEnv = {};

test('secret patterns report the kind and line, never the value', () => {
  for (const [name, value] of Object.entries(fakes)) {
    assert.deepEqual(scanText(`first line\ntoken = ${value}\n`, noEnv), [{ line: 2, kind: expectedKind(name) }], name);
  }
  assert.deepEqual(scanText(`${fakes.anthropic} and ${fakes.anthropic}`, noEnv).map(hit => hit.kind), ['anthropic']);
});

test('secret patterns ignore look-alikes and binary content', () => {
  const sha = '0123456789abcdef'.repeat(2) + '01234567';
  const harmless = [sha, 'sk-...', 'sk-ant-...', 'export OPENAI_API_KEY=sk-xxxx', 'pk.eyJabc.def', `disk-${'x'.repeat(40)}`, 'ghp_short', 'AKIA1234', 'https://example.com/hf_hub'];
  for (const text of harmless) assert.deepEqual(scanText(text, noEnv), [], text);
  assert.deepEqual(scanText(`\0${fakes.github}`, noEnv), []);
});

test('secret scan matches exact values from the environment only when long enough', () => {
  const value = 'Zq8-Lm3_Vx9Wk2';
  for (const name of ENV_NAMES) {
    assert.deepEqual(scanText(`x ${value} y`, { [name]: value }), [{ line: 1, kind: name }], name);
  }
  assert.deepEqual(scanText(`x ${value} y`, { MAPBOX_TOKEN: 'short' }), []);
  assert.deepEqual(scanText('x short y', { MAPBOX_TOKEN: 'short' }), []);
  assert.deepEqual(scanText(`x ${value} y`, { UNRELATED: value }), []);
  assert.deepEqual(scanText(`x ${value} y`, noEnv), []);
});

test('prompt check names kinds only', () => {
  const reason = checkPrompt(`please use ${fakes.github} for the push`, noEnv);
  assert.match(reason, /github/);
  assert.ok(!reason.includes(fakes.github));
  assert.equal(checkPrompt('Add a contact row to the about page.', noEnv), null);
});

const root = projectDir;
const decision = (command, branch = 'uiux/x') => evaluate(command, { cwd: root, root, branch: () => branch, home: '/Users/example' })?.decision ?? 'allow';

test('bash guard denies destructive git, staging, deletion, credential and merge commands', () => {
  const table = [
    ['git status', 'allow'],
    ['git push origin uiux/x', 'allow'],
    ['git push -u origin HEAD', 'allow'],
    ['git push --force origin x', 'deny'],
    ['git push -fu origin x', 'deny'],
    ['git push --force-with-lease', 'deny'],
    ['git push origin +x', 'deny'],
    ['git push origin master', 'deny'],
    ['git push origin HEAD:master', 'deny'],
    ['git push origin x:refs/heads/data', 'deny'],
    ['git push origin gh-pages', 'deny'],
    ['git -C worker push origin data', 'deny'],
    ['git reset --hard', 'deny'],
    ['git reset --soft HEAD~1', 'allow'],
    ['git clean -fd', 'deny'],
    ['git clean -f', 'allow'],
    ['git clean -nfd', 'allow'],
    ['git commit --no-verify -m x', 'deny'],
    ['git commit -n -m x', 'deny'],
    ['git commit -am "n"', 'allow'],
    ['git -c core.hooksPath=/dev/null commit -m x', 'deny'],
    ['git add -A', 'deny'],
    ['git add --all', 'deny'],
    ['git add -u', 'deny'],
    ['git add .', 'deny'],
    ['git add -- .', 'deny'],
    ['git add ./', 'deny'],
    ['git add :/', 'deny'],
    ['git add README.md scripts/check-secrets.mjs', 'allow'],
    ['rm -rf /', 'deny'],
    ['rm -rf .', 'deny'],
    ['rm -rf ..', 'deny'],
    ['rm -rf ./*', 'deny'],
    ['rm -rf *', 'deny'],
    ['rm -rf ~', 'deny'],
    ['rm -rf $HOME', 'deny'],
    ['rm -rf /Users/example', 'deny'],
    [`rm -rf ${root}`, 'deny'],
    ['rm -fr _site', 'allow'],
    ['rm -rf *.log', 'allow'],
    ['rm -r somedir', 'allow'],
    ['cat .envrc', 'deny'],
    ['cat .env.example', 'allow'],
    ['head -3 worker/.dev.vars', 'deny'],
    ['tail -f worker/.dev.vars.local', 'deny'],
    ['sed -n 1p ~/.aws/credentials', 'deny'],
    ['less ~/.ssh/id_ed25519', 'deny'],
    ['bat server.pem', 'deny'],
    ['grep -n token .envrc', 'deny'],
    ['rg credentials docs', 'allow'],
    ['cat README.md', 'allow'],
    ['echo $MAPBOX_TOKEN', 'deny'],
    ['echo "token is ${WAQI_TOKEN}"', 'deny'],
    ['printf "%s" "$GH_TOKEN"', 'deny'],
    ["echo '$MAPBOX_TOKEN'", 'allow'],
    ['echo $HOME', 'allow'],
    ['printenv TRIGGER_SECRET', 'deny'],
    ['printenv HOME', 'allow'],
    ['gh auth token', 'deny'],
    ['gh pr merge 5 --squash', 'deny'],
    ['gh pr merge 5 -s', 'deny'],
    ['gh pr merge 5 --rebase', 'deny'],
    ['gh pr merge 5 -r', 'deny'],
    ['gh pr merge 5 --merge', 'ask'],
    ['gh pr merge 5', 'ask'],
    ['gh pr view 5', 'allow'],
    ['npx wrangler deploy', 'ask'],
    ['wrangler secret put WAQI_TOKEN', 'ask'],
    ['wrangler secret delete X', 'ask'],
    ['wrangler secret bulk x.json', 'ask'],
    ['npm run deploy', 'ask'],
    ['npm --prefix worker run deploy', 'ask'],
    ['cd worker && npm run deploy', 'ask'],
    ['wrangler dev', 'allow'],
    ['npm run dev', 'allow'],
    ['gh workflow run india-weather-data.yml', 'ask'],
    ['gh run rerun 123', 'ask'],
    ['gh secret set MAPBOX_TOKEN', 'ask'],
    ['gh secret delete MAPBOX_TOKEN', 'ask'],
    ['gh workflow list', 'allow'],
  ];
  for (const [command, expected] of table) assert.equal(decision(command), expected, command);
});

test('bash guard sees through wrappers, shell -c, keywords and substitutions', () => {
  const table = [
    ['rtk git push --force', 'deny'],
    ['rtk proxy git reset --hard', 'deny'],
    ['GH_CONFIG_DIR=/x git push -f', 'deny'],
    ['env -u FOO git push origin master', 'deny'],
    ['command git push -f', 'deny'],
    ['sudo -u root rm -rf /', 'deny'],
    ['/usr/bin/git push -f', 'deny'],
    ['sh -c "git push --force"', 'deny'],
    ["bash -lc 'git reset --hard'", 'deny'],
    ["sh -c 'echo $MAPBOX_TOKEN'", 'deny'],
    ['sh -c "sh -c \'git add -A\'"', 'deny'],
    ['sh -c "git status"', 'allow'],
    ['cd worker && git push origin data', 'deny'],
    ['git status; git push -f', 'deny'],
    ['if true; then git push -f; fi', 'deny'],
    ['echo $(git push --force)', 'deny'],
    ['npx -y wrangler deploy', 'ask'],
    ['GH_CONFIG_DIR=/x gh pr merge 5 --merge', 'ask'],
    ['echo ok 2>&1 | tee out.txt', 'allow'],
  ];
  for (const [command, expected] of table) assert.equal(decision(command), expected, command);
});

test('bash guard does not read commit messages, quoted text or heredoc bodies as commands', () => {
  const table = [
    ['git commit -m "document git push --force and rm -rf /"', 'allow'],
    ["git commit -m 'never run git reset --hard; echo $MAPBOX_TOKEN'", 'allow'],
    ['echo "git push --force; git add -A"', 'allow'],
    ["git commit -F - <<'EOF'\nExplain why git push --force is blocked\nit's fine\nEOF", 'allow'],
    ['git commit -m "$(cat <<\'EOF\'\nDon\'t git push --force.\n\nSigned-off-by: Someone <a@example.com>\nEOF\n)"', 'allow'],
    ['git commit -m "x" # git push --force', 'allow'],
    ['git commit -m "fix" && git push origin uiux/x', 'allow'],
  ];
  for (const [command, expected] of table) assert.equal(decision(command), expected, command);
});

test('bash guard blocks a bare push on master and fails closed on unparseable commands', () => {
  assert.equal(decision('git push', 'master'), 'deny');
  assert.equal(decision('git push origin', 'master'), 'deny');
  assert.equal(decision('git push -u origin HEAD', 'master'), 'deny');
  assert.equal(decision('git push origin --tags', 'master'), 'allow');
  assert.equal(decision('git push', 'uiux/x'), 'allow');
  assert.equal(decision('git push', ''), 'allow');
  const unbalanced = evaluate('echo "unterminated', { cwd: root, root });
  assert.equal(unbalanced.decision, 'deny');
  assert.match(unbalanced.reason, /could not parse/);
});

test('a deny in any segment wins over an ask in another', () => {
  const result = evaluate('gh pr merge 5 --merge && git push --force', { cwd: root, root, branch: () => 'uiux/x' });
  assert.equal(result.decision, 'deny');
  assert.equal(evaluate('git push --force && gh pr merge 5 --merge', { cwd: root, root, branch: () => 'uiux/x' }).decision, 'deny');
});

test('bash guard reasons never repeat the command text', () => {
  const secret = `ghp_${'q9'.repeat(20)}`;
  const result = evaluate(`git push --force https://${secret}@github.com/x/y.git main`, { cwd: root, root, branch: () => 'uiux/x' });
  assert.equal(result.decision, 'deny');
  assert.ok(!result.reason.includes(secret));
});

test('writtenText reads Claude Write, Edit and MultiEdit and Codex patches', () => {
  const cwd = '/work/repo';
  assert.deepEqual(writtenText({ cwd, tool_input: { file_path: 'a.md', content: 'whole' } }), [{ file: '/work/repo/a.md', text: 'whole', previous: null }]);
  assert.deepEqual(writtenText({ cwd, tool_input: { file_path: '/work/repo/a.md', old_string: 'old', new_string: 'new' } }), [{ file: '/work/repo/a.md', text: 'new', previous: 'old' }]);
  assert.deepEqual(
    writtenText({ cwd, tool_input: { file_path: 'a.md', edits: [{ old_string: 'one', new_string: 'uno' }, { old_string: 'two', new_string: 'dos' }] } }),
    [{ file: '/work/repo/a.md', text: 'uno', previous: 'one' }, { file: '/work/repo/a.md', text: 'dos', previous: 'two' }],
  );
  const patch = ['*** Begin Patch', '*** Add File: docs/new.md', '+# Title', '+Second line', '*** Update File: README.md', '*** Move to: docs/moved.md', '@@', ' context', '-removed', '+added', '++++ not a line', '*** End Patch'].join('\n');
  assert.deepEqual(writtenText({ cwd, tool_input: { command: patch } }), [
    { file: '/work/repo/docs/new.md', text: '# Title\nSecond line', previous: '' },
    { file: '/work/repo/docs/moved.md', text: 'added', previous: '' },
  ]);
  assert.deepEqual(writtenText({ cwd, tool_input: { command: 'ls -la' } }), []);
});

async function temporaryRepo(t, branch = 'feature/x') {
  const directory = await mkdtemp(join(tmpdir(), 'site-agent-hooks-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const git = (...args) => spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
  assert.equal(git('init', '-q').status, 0);
  git('symbolic-ref', 'HEAD', `refs/heads/${branch}`);
  return { directory, git };
}

test('editedFiles keeps existing files inside the repo and ignores the rest', async t => {
  const { directory } = await temporaryRepo(t);
  await mkdir(join(directory, 'docs'));
  await writeFile(join(directory, 'docs/a.md'), 'a');
  const outside = await mkdtemp(join(tmpdir(), 'site-agent-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'b.md'), 'b');
  const root = repoRoot(directory);
  const patch = '*** Update File: docs/a.md\n*** Add File: docs/missing.md\n*** Add File: ../../elsewhere.md';
  assert.deepEqual(editedFiles({ cwd: directory, tool_input: { command: patch } }, root), [join(root, 'docs/a.md')]);
  assert.deepEqual(editedFiles({ cwd: directory, tool_input: { file_path: join(outside, 'b.md') } }, root), []);
  assert.deepEqual(editedFiles({ cwd: directory, tool_input: { notebook_path: 'docs/a.md' } }, root), [join(root, 'docs/a.md')]);
  assert.deepEqual(editedFiles({ cwd: directory, tool_input: { file_path: 'docs' } }, root), []);
});

test('dash filter reports only text that was not already there', () => {
  const old = `Old line ${emDash} untouched\nSecond line`;
  assert.deepEqual(dashLines(`Old line ${emDash} untouched\nSecond line\nNew ${enDash} line`, old), [`New ${enDash} line`]);
  assert.deepEqual(dashLines('Clean text 4-5 range', ''), []);
  assert.deepEqual(dashLines(`a ${emDash} b`, ''), [`a ${emDash} b`]);
});

test('literal color check reads declaration values only', () => {
  const css = [
    '/* #fff in a comment */',
    '#TOC { color: var(--text); }',
    'a:hover { color: #1a2b3c; }',
    '@media (min-width: 600px) {',
    '  .card { background: rgba(0, 0, 0, .5); border: 1px solid black; }',
    '  .ok { color: var(--white); fill: var(--color-black); content: "#fff"; background: url(data:image/svg+xml;utf8,<svg fill="#fff"/>); }',
    '}',
    '.last { outline: 2px solid WHITE }',
    '.token { --accent: hsl(210 50% 50%); }',
  ].join('\n');
  assert.deepEqual(literalColors(css), [
    { line: 3, value: '#1a2b3c' },
    { line: 5, value: 'rgba(' },
    { line: 5, value: 'black' },
    { line: 8, value: 'WHITE' },
    { line: 9, value: 'hsl(' },
  ]);
  assert.deepEqual(literalColors('.a { color: var(--text); margin: 0 }\n#main > .b::after { content: "x" }'), []);
});

test('edit checks block secrets, report dashes, colors and posts, and say nothing otherwise', async t => {
  const { directory } = await temporaryRepo(t);
  await mkdir(join(directory, 'posts'));
  await mkdir(join(directory, 'static/css'), { recursive: true });
  const write = async (path, text) => {
    await writeFile(join(directory, path), text);
    return { cwd: directory, tool_name: 'Write', tool_input: { file_path: path, content: text } };
  };

  const secret = await write('notes.md', `line one\nkey: ${fakes.github}\n`);
  const blocked = editChecks(secret, { env: noEnv });
  assert.match(blocked.reason, /notes\.md:2 github/);
  assert.match(blocked.reason, /GitHub Actions or Worker secrets/);
  assert.ok(!blocked.reason.includes(fakes.github));

  const dash = await write('notes.md', `A line ${emDash} with a dash\n`);
  const reported = editChecks(dash, { env: noEnv });
  assert.equal(reported.reason, undefined);
  assert.match(reported.context, /notes\.md/);
  assert.match(reported.context, /A line/);
  assert.match(reported.context, /ranges use a hyphen/);

  const css = await write('static/css/home.css', '.a { color: #fff; }\n');
  assert.match(editChecks(css, { env: noEnv }).context, /static\/css\/home\.css:1 #fff/);
  assert.match(editChecks(css, { env: noEnv }).context, /static\/design-tokens\.css/);
  assert.deepEqual(editChecks(await write('other.css', '.a { color: #fff; }\n'), { env: noEnv }), {});

  const post = await write('posts/2026-01-01-x.qmd', '---\ntitle: x\n---\n');
  assert.match(editChecks(post, { env: noEnv }).context, /npm ci --ignore-scripts/);

  const edit = { cwd: directory, tool_input: { file_path: 'notes.md', old_string: `A line ${emDash} with a dash`, new_string: `A line ${emDash} with a dash and more` } };
  assert.match(editChecks(edit, { env: noEnv }).context, /with a dash and more/);
  const untouched = { cwd: directory, tool_input: { file_path: 'notes.md', old_string: `A line ${emDash} with a dash\nx`, new_string: `A line ${emDash} with a dash\ny` } };
  assert.deepEqual(editChecks(untouched, { env: noEnv }), {});

  const clean = await write('clean.md', 'Nothing to see here.\n');
  assert.deepEqual(editChecks(clean, { env: noEnv }), {});
});

function runHook(name, event, args = []) {
  const run = spawnSync(process.execPath, [hook(name), ...args], { input: typeof event === 'string' ? event : JSON.stringify(event), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test('hook scripts speak the Claude Code hook protocol end to end', async t => {
  const cleanPrompt = runHook('prompt-secrets.mjs', { cwd: projectDir, prompt: 'Tighten the home page copy.' });
  assert.deepEqual(cleanPrompt, {});
  const secretPrompt = runHook('prompt-secrets.mjs', { cwd: projectDir, prompt: `use ${fakes.mapbox}` });
  assert.equal(secretPrompt.decision, 'block');
  assert.match(secretPrompt.reason, /mapbox/);
  assert.ok(!JSON.stringify(secretPrompt).includes(fakes.mapbox));
  assert.equal(runHook('prompt-secrets.mjs', 'not json').decision, 'block');
  assert.equal(runHook('prompt-secrets.mjs', { cwd: projectDir }).decision, 'block');

  assert.deepEqual(runHook('bash-guard.mjs', { cwd: projectDir, tool_input: { command: 'git status' } }), {});
  const denied = runHook('bash-guard.mjs', { cwd: projectDir, tool_input: { command: 'git push --force origin x' } }).hookSpecificOutput;
  assert.equal(denied.hookEventName, 'PreToolUse');
  assert.equal(denied.permissionDecision, 'deny');
  const asked = { cwd: projectDir, tool_input: { command: 'gh pr merge 5 --merge' } };
  assert.equal(runHook('bash-guard.mjs', asked).hookSpecificOutput.permissionDecision, 'ask');
  const codex = runHook('bash-guard.mjs', asked, ['--codex']).hookSpecificOutput;
  assert.equal(codex.permissionDecision, 'deny');
  assert.match(codex.permissionDecisionReason, /; ask Aayush to run it by hand$/);
  assert.equal(runHook('bash-guard.mjs', { cwd: projectDir, tool_input: {} }).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(runHook('bash-guard.mjs', 'not json').hookSpecificOutput.permissionDecision, 'deny');

  const { directory } = await temporaryRepo(t);
  await writeFile(join(directory, 'a.md'), `A ${emDash} B\n`);
  const reported = runHook('edit-checks.mjs', { cwd: directory, tool_input: { file_path: 'a.md', content: `A ${emDash} B\n` } });
  assert.equal(reported.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(reported.hookSpecificOutput.additionalContext, /a\.md/);
  await writeFile(join(directory, 'b.md'), 'Fine.\n');
  assert.deepEqual(runHook('edit-checks.mjs', { cwd: directory, tool_input: { file_path: 'b.md', content: 'Fine.\n' } }), {});
  await writeFile(join(directory, 'c.md'), `${fakes.github}\n`);
  assert.equal(runHook('edit-checks.mjs', { cwd: directory, tool_input: { file_path: 'c.md', content: 'x' } }).decision, 'block');
  assert.equal(runHook('edit-checks.mjs', 'not json').decision, 'block');
});

async function scannerRepository(t, branch) {
  const repository = await temporaryRepo(t, branch);
  await mkdir(join(repository.directory, 'scripts'));
  await copyFile(join(projectDir, 'scripts/check-secrets.mjs'), join(repository.directory, 'scripts/check-secrets.mjs'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !ENV_NAMES.includes(name)));
  const scan = (...args) => spawnSync(process.execPath, ['scripts/check-secrets.mjs', ...args], { cwd: repository.directory, env, encoding: 'utf8' });
  return { ...repository, scan, env };
}

test('secret scan CLI reads the index for --staged and the working tree otherwise', async t => {
  const { directory, git, scan } = await scannerRepository(t);
  await writeFile(join(directory, 'a.txt'), 'clean\n');
  git('add', 'a.txt', 'scripts/check-secrets.mjs');
  const clean = scan('--staged');
  assert.equal(clean.status, 0);
  assert.match(clean.stdout, /2 staged files clean/);

  await writeFile(join(directory, 'a.txt'), `clean\nkey = ${fakes.github}\n`);
  assert.equal(scan('--staged').status, 0, 'the index still holds the clean copy');
  const tracked = scan();
  assert.equal(tracked.status, 1);
  assert.match(tracked.stderr, /a\.txt:2 github/);

  git('add', 'a.txt');
  const staged = scan('--staged');
  assert.equal(staged.status, 1);
  assert.match(staged.stderr, /a\.txt:2 github/);
  assert.ok(!staged.stderr.includes(fakes.github));
  assert.ok(!staged.stdout.includes(fakes.github));
});

test('pre-commit refuses master and scans the staged files', { skip: process.platform === 'win32' }, async t => {
  const preCommit = join(projectDir, '.agent_hooks/git/pre-commit');
  const onMaster = await scannerRepository(t, 'master');
  const refused = spawnSync('sh', [preCommit], { cwd: onMaster.directory, env: onMaster.env, encoding: 'utf8' });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Refusing to commit on master/);

  const { directory, git, env } = await scannerRepository(t, 'tools');
  await writeFile(join(directory, 'a.txt'), 'clean\n');
  git('add', 'a.txt');
  assert.equal(spawnSync('sh', [preCommit], { cwd: directory, env, encoding: 'utf8' }).status, 0);
  await writeFile(join(directory, 'a.txt'), `${fakes.anthropic}\n`);
  git('add', 'a.txt');
  const blocked = spawnSync('sh', [preCommit], { cwd: directory, env, encoding: 'utf8' });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /a\.txt:1 anthropic/);
});

test('commit-msg rejects em and en dashes and attribution lines but ignores comments', { skip: process.platform === 'win32' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'site-commit-msg-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const check = async message => {
    const file = join(directory, 'MSG');
    await writeFile(file, message);
    return spawnSync('sh', [join(projectDir, '.agent_hooks/git/commit-msg'), file], { encoding: 'utf8' });
  };
  const ok = await check(`Add hooks to keep secrets out\n\nRanges like 4-5 are fine.\nScreenshots are regenerated with the new palette.\n# a comment ${emDash} is ignored\n# Co-Authored-By: in a comment is ignored\n`);
  assert.equal(ok.status, 0, ok.stderr);
  const trailer = await check(`Add hooks\n\nCo-authored-by: Claude <noreply@anthropic.com>\n`);
  assert.equal(trailer.status, 1);
  assert.match(trailer.stderr, /attribution lines[\s\S]*3: Co-authored-by/);
  const footer = await check(`Add hooks\n\n${String.fromCodePoint(0x1f916)} Generated with [Claude Code](https://claude.com/claude-code)\n`);
  assert.equal(footer.status, 1);
  assert.match(footer.stderr, /3: .*Generated with/);
  const em = await check(`Add hooks ${emDash} fast\n`);
  assert.equal(em.status, 1);
  assert.match(em.stderr, /1: Add hooks .* fast/);
  const en = await check(`Subject\n\nBody with ${enDash} a dash\n`);
  assert.equal(en.status, 1);
  assert.match(en.stderr, /3: Body with/);
});
