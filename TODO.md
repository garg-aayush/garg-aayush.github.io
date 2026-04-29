# TODO

Deferred work that is not blocking but worth picking up if the relevant area is touched again.

## India Weather

### Bring back WAQI dominant-pollutant in the popup
Each city's marker popup used to show "Dominant: PM2.5 · 5 stations". The Cloudflare Worker dropped the per-city WAQI feed call (one extra subrequest per city, 20 total) to fit the free-tier 50-subrequest cap. The popup currently has no Dominant line.

Two ways to reinstate:
- Upgrade to Workers Paid ($5/mo, 1000-subrequest cap). Simplest; also unlocks headroom for adding more cities.
- Cache dominant pollutant in Cloudflare KV with a ~24h TTL — pollutants change slowly (PM2.5 dominates Indian cities most of the year, ozone in summer), so polling once a day is plenty. KV reads/writes cost subrequests too, but only one batched read per run instead of 20.

### Interpolate 1-2 missed-run gaps in the 24h WAQI series
The Cloudflare Worker fires reliably every 15 min, but a single failed run leaves a `null` slot in the rolling 24h history. The chart already handles nulls (line breaks), but linearly interpolating a single missed slot would look smoother and is honest at 15-min cadence (AQI doesn't move that fast).

Implementation sketch: a `fillShortGapsByTime(points, key, maxGapMs)` pass before `pointsToLine()` in `static/india-weather/india-weather.js`, with a 30-minute threshold. Anything longer stays a break.
