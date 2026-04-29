// Cloudflare Worker: India Weather live fetcher.
//
// Replaces .github/workflows/india-weather-data.yml. Cron Triggers fire on
// schedule (within seconds), so a real */15 cadence here gives us ~96 history
// points per 24h instead of the ~36 we get from Actions' drifted scheduler.
//
// Daily aggregates (daily-*.json) are still owned by
// .github/workflows/india-weather-daily.yml — that runs once a day, where
// Actions cron drift is harmless, and migrating it would be churn for no gain.

export default {
  // Cron Trigger entry point. event.scheduledTime is the wall-clock UTC ms
  // the Worker was *scheduled* to run (not when it actually started).
  async scheduled(event, env, ctx) {
    const startedAt = Date.now();
    const tickIso = new Date(event.scheduledTime).toISOString();

    try {
      // Fetch + commit pipeline lands in the next commit.
      console.log(JSON.stringify({ msg: 'tick', tick: tickIso, status: 'skeleton' }));
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.error(JSON.stringify({ msg: 'tick_failed', tick: tickIso, error: message }));
      throw err; // surface to Cloudflare so failed runs are visible in dashboard
    } finally {
      console.log(JSON.stringify({ msg: 'tick_done', tick: tickIso, ms: Date.now() - startedAt }));
    }
  },
};
