// GitHub Git Data API client tailored for the data branch:
// each run rewrites the branch with a single parentless commit. Mirrors what
// the retired Actions workflow used to do via `git push --force`, just done
// from a Cloudflare Worker via the REST API.
//
// Two entry points:
//   readDataBranch()   - read current state (parses history-*.json content,
//                        carries daily-*.json forward by SHA only)
//   commitDataBranch() - upload blobs, build tree, write parentless commit,
//                        force-update the ref. Creates the branch if missing.

const API = 'https://api.github.com';

function ghHeaders(token) {
  return {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    // GitHub rejects API requests without a User-Agent.
    'User-Agent': 'india-weather-worker',
  };
}

async function ghFetch(path, { token, method = 'GET', body } = {}) {
  const url = path.startsWith('http') ? path : API + path;
  const init = {
    method,
    headers: {
      ...ghHeaders(token),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(url, init);
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    const err = new Error('GitHub ' + method + ' ' + path + ' -> ' + r.status + ' ' + text.slice(0, 240));
    err.status = r.status;
    throw err;
  }
  return await r.json();
}

// GitHub returns blob content base64-encoded regardless of how it was uploaded.
// Decode through TextDecoder so multi-byte UTF-8 is handled correctly.
function decodeBlobContent(blob) {
  if (blob.encoding === 'base64') {
    const cleaned = blob.content.replace(/\n/g, '');
    const bytes = Uint8Array.from(atob(cleaned), c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return blob.content;
}

// Read the current state of the data branch.
//
// Returns:
//   exists         - false if the branch does not exist (first-ever run)
//   historyByCity  - { [cityId]: parsedHistoryJson } for each history-*.json
//   dailyEntries   - array of tree entries for daily-*.json (carry forward by SHA)
export async function readDataBranch({ token, owner, repo, branch }) {
  let ref;
  try {
    ref = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, { token });
  } catch (err) {
    if (err.status === 404) {
      return { exists: false, historyByCity: {}, dailyEntries: [] };
    }
    throw err;
  }
  const commitSha = ref.object.sha;

  const commit = await ghFetch(`/repos/${owner}/${repo}/git/commits/${commitSha}`, { token });
  const treeSha = commit.tree.sha;

  const tree = await ghFetch(`/repos/${owner}/${repo}/git/trees/${treeSha}`, { token });
  const entries = (tree.tree || []).filter(e => e.type === 'blob');

  const dailyEntries = entries.filter(e => /^daily-.*\.json$/.test(e.path));

  const historyEntries = entries.filter(e => /^history-.*\.json$/.test(e.path));
  const historyPairs = await Promise.all(historyEntries.map(async e => {
    const blob = await ghFetch(`/repos/${owner}/${repo}/git/blobs/${e.sha}`, { token });
    let parsed = null;
    try { parsed = JSON.parse(decodeBlobContent(blob)); } catch (_) { parsed = null; }
    const cityId = e.path.replace(/^history-/, '').replace(/\.json$/, '');
    return [cityId, parsed];
  }));

  return {
    exists: true,
    historyByCity: Object.fromEntries(historyPairs),
    dailyEntries,
  };
}

// Write the new state as a single parentless commit and force-update the ref.
// Keeps the data branch at exactly one commit, matching the orphan-style
// `git push --force` pattern the Actions workflow used.
//
// Returns { commitSha, refSha }.
export async function commitDataBranch({
  token, owner, repo, branch,
  weather, history, dailyEntries, message,
}) {
  // 1. Upload weather.json + every history-<id>.json as fresh blobs in parallel.
  const blobInputs = [
    { path: 'weather.json', content: JSON.stringify(weather, null, 2) + '\n' },
    ...Object.entries(history).map(([cityId, h]) => ({
      path: 'history-' + cityId + '.json',
      content: JSON.stringify(h) + '\n',
    })),
  ];

  const newBlobEntries = await Promise.all(blobInputs.map(async ({ path, content }) => {
    const blob = await ghFetch(`/repos/${owner}/${repo}/git/blobs`, {
      token,
      method: 'POST',
      body: { content, encoding: 'utf-8' },
    });
    return { path, mode: '100644', type: 'blob', sha: blob.sha };
  }));

  // 2. Build the new tree from scratch (no base_tree). New blobs + daily
  //    carry-forwards. We deliberately drop any other paths that may have
  //    been on the branch — the data branch only contains these three
  //    file families.
  const treeEntries = [
    ...newBlobEntries,
    ...dailyEntries.map(e => ({
      path: e.path,
      mode: e.mode || '100644',
      type: 'blob',
      sha: e.sha,
    })),
  ];

  const tree = await ghFetch(`/repos/${owner}/${repo}/git/trees`, {
    token,
    method: 'POST',
    body: { tree: treeEntries },
  });

  // 3. Parentless commit. The ref will point at this and orphan all prior
  //    commits, which Git GCs eventually. Branch stays at one commit.
  const commit = await ghFetch(`/repos/${owner}/${repo}/git/commits`, {
    token,
    method: 'POST',
    body: { message, tree: tree.sha, parents: [] },
  });

  // 4. Force-update the ref. If the branch doesn't exist (first run), create
  //    it via POST /git/refs instead.
  let ref;
  try {
    ref = await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      token,
      method: 'PATCH',
      body: { sha: commit.sha, force: true },
    });
  } catch (err) {
    if (err.status === 404 || err.status === 422) {
      ref = await ghFetch(`/repos/${owner}/${repo}/git/refs`, {
        token,
        method: 'POST',
        body: { ref: 'refs/heads/' + branch, sha: commit.sha },
      });
    } else {
      throw err;
    }
  }

  return { commitSha: commit.sha, refSha: ref.object ? ref.object.sha : commit.sha };
}
