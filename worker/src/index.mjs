// Cloudflare Worker: India Weather live fetcher.
//
// Replaces .github/workflows/india-weather-data.yml. Cron Triggers fire on
// schedule (within seconds), so a real */15 cadence here gives us ~96 history
// points per 24h instead of the ~36 we get from Actions' drifted scheduler.
//
// Daily aggregates (daily-*.json) are still owned by
// .github/workflows/india-weather-daily.yml — that runs once a day, where
// Actions cron drift is harmless. The Worker carries those files forward
// untouched so the daily cron can keep owning them.

import cities from '../../static/india-weather/cities.json';
import { buildWeatherUpdate } from './fetch-weather.mjs';
import { readDataBranch, commitDataBranch } from './github.mjs';

function requireEnv(env, key) {
  const v = env[key];
  if (!v || typeof v !== 'string') {
    throw new Error('Missing required env/secret: ' + key);
  }
  return v;
}

async function runOnce(env) {
  const githubToken = requireEnv(env, 'GITHUB_TOKEN');
  const owner = requireEnv(env, 'GITHUB_OWNER');
  const repo = requireEnv(env, 'GITHUB_REPO');
  const branch = requireEnv(env, 'DATA_BRANCH');
  const waqiToken = env.WAQI_TOKEN || ''; // optional; missing means AQI null

  // Read prior state from the data branch first so we have history to append
  // to. Done before the upstream fetches because if GitHub is down we want
  // to fail fast rather than waste WAQI quota.
  const prior = await readDataBranch({ token: githubToken, owner, repo, branch });

  // Fetch upstream + merge. Pure function; no side effects.
  const { weather, history } = await buildWeatherUpdate(
    cities,
    waqiToken,
    prior.historyByCity
  );

  // Single commit replacing the branch (parentless), carrying daily files
  // forward by SHA so the daily Actions cron is not stomped on.
  const commitMessage = 'chore(data): update weather.json '
    + new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const result = await commitDataBranch({
    token: githubToken,
    owner, repo, branch,
    weather,
    history,
    dailyEntries: prior.dailyEntries,
    message: commitMessage,
  });

  return {
    cities: cities.length,
    daily_carried: prior.dailyEntries.length,
    commit: result.commitSha,
    branch_existed: prior.exists,
  };
}

export default {
  // Cron Trigger entry point. Cloudflare passes scheduledTime in ms.
  async scheduled(event, env, ctx) {
    const startedAt = Date.now();
    const tickIso = new Date(event.scheduledTime).toISOString();
    try {
      const result = await runOnce(env);
      console.log(JSON.stringify({
        msg: 'tick_ok',
        tick: tickIso,
        ms: Date.now() - startedAt,
        ...result,
      }));
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.error(JSON.stringify({
        msg: 'tick_failed',
        tick: tickIso,
        ms: Date.now() - startedAt,
        error: message,
      }));
      // Surface failures to the Cloudflare dashboard. Next tick will retry.
      throw err;
    }
  },

  // Manual trigger for local dev (`wrangler dev`) and on-demand re-runs.
  // Production cron does not call this path.
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/__trigger') {
      const expected = env.TRIGGER_SECRET;
      const provided = url.searchParams.get('key') || '';
      if (expected && provided !== expected) {
        return new Response('forbidden\n', { status: 403 });
      }
      try {
        const result = await runOnce(env);
        return Response.json({ ok: true, ...result });
      } catch (err) {
        return Response.json({ ok: false, error: err && err.message ? err.message : String(err) }, { status: 500 });
      }
    }
    return new Response('india-weather worker. Cron-driven. POST /__trigger?key=… for manual run.\n');
  },
};
