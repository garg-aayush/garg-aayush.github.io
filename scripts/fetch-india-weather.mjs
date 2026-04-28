#!/usr/bin/env node
// Fetch current weather (Open-Meteo) and AQI (WAQI / CPCB stations) for the
// cities listed in static/india-weather/cities.json and emit a single JSON
// document at the path given as argv[2] (default ./weather.json).
//
// Pure ESM, no external dependencies. Uses the global fetch and AbortController
// available since Node 18.
//
// Per-source failures degrade gracefully: a city missing AQI keeps its weather,
// a global Open-Meteo failure leaves AQI intact. The script exits non-zero only
// when its own inputs are malformed.
//
// History maintenance: when --history-in <dir> and --history-out <dir> are
// provided, the script reads the existing per-city history-<id>.json files,
// appends a new point to points_24h, and (on hourly / 6-hourly boundaries)
// extends points_7d / points_30d. The chart-friendly AQI value is pulled from
// Open-Meteo Air Quality so the historical series has a single, backfillable
// source. WAQI continues to feed the live tile only.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CITIES_PATH = pathResolve(__dirname, '..', 'static', 'india-weather', 'cities.json');

const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = parseFlags(process.argv.slice(2));
const OUT_PATH = pathResolve(process.cwd(), positional[0] || './weather.json');
const HISTORY_IN = flags['history-in'] ? pathResolve(process.cwd(), flags['history-in']) : null;
const HISTORY_OUT = flags['history-out'] ? pathResolve(process.cwd(), flags['history-out']) : null;

const WAQI_TOKEN = process.env.WAQI_TOKEN || '';

const HOURS_24 = 24;
const HOURS_7D = 7 * 24;
const HOURS_30D = 30 * 24;

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

async function safeFetch(url, { retries = 2, timeoutMs = 8000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

function cpcbBand(a) {
  if (a == null || !Number.isFinite(a)) return null;
  if (a <= 50)  return 'Good';
  if (a <= 100) return 'Satisfactory';
  if (a <= 200) return 'Moderate';
  if (a <= 300) return 'Poor';
  if (a <= 400) return 'Very Poor';
  return 'Severe';
}

async function fetchOpenMeteo(cities) {
  const lats = cities.map(c => c.lat).join(',');
  const lons = cities.map(c => c.lon).join(',');
  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + lats
    + '&longitude=' + lons
    + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,uv_index'
    + '&timezone=Asia%2FKolkata';
  try {
    const data = await safeFetch(url);
    const arr = Array.isArray(data) ? data : [data];
    return cities.map((_, i) => {
      const d = arr[i];
      const c = d && d.current;
      if (!c) return null;
      return {
        temperature_c: c.temperature_2m ?? null,
        apparent_c: c.apparent_temperature ?? null,
        humidity_pct: c.relative_humidity_2m ?? null,
        uv_index: c.uv_index ?? null,
      };
    });
  } catch (err) {
    console.error('Open-Meteo failed:', err.message);
    return cities.map(() => null);
  }
}

// Single Open-Meteo Air Quality call (multi-coord) returning the most recent
// hourly US AQI value per city. Used only for the chart history series.
async function fetchOpenMeteoAqi(cities) {
  const lats = cities.map(c => c.lat).join(',');
  const lons = cities.map(c => c.lon).join(',');
  const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
    + '?latitude=' + lats
    + '&longitude=' + lons
    + '&hourly=us_aqi'
    + '&past_hours=2'
    + '&forecast_hours=0'
    + '&timezone=GMT';
  try {
    const data = await safeFetch(url);
    const arr = Array.isArray(data) ? data : [data];
    return cities.map((_, i) => {
      const d = arr[i];
      const h = d && d.hourly;
      if (!h || !Array.isArray(h.us_aqi)) return null;
      // Last non-null value in the window
      for (let k = h.us_aqi.length - 1; k >= 0; k--) {
        const v = h.us_aqi[k];
        if (v != null && Number.isFinite(v)) return v;
      }
      return null;
    });
  } catch (err) {
    console.error('Open-Meteo Air Quality failed:', err.message);
    return cities.map(() => null);
  }
}

async function fetchWaqiCity(city) {
  if (!WAQI_TOKEN) {
    return { value: null, band: null, dominant_pollutant: null, station_count: 0 };
  }
  const [s, w, n, e] = city.bbox;
  const boundsUrl = 'https://api.waqi.info/map/bounds/'
    + '?latlng=' + [s, w, n, e].join(',')
    + '&token=' + encodeURIComponent(WAQI_TOKEN);

  let stations = [];
  try {
    const resp = await safeFetch(boundsUrl);
    if (resp && resp.status === 'ok' && Array.isArray(resp.data)) {
      stations = resp.data
        .map(s => ({ uid: s.uid, aqi: Number(s.aqi) }))
        .filter(s => Number.isFinite(s.aqi));
    }
  } catch (err) {
    console.error('WAQI bounds failed for', city.id, ':', err.message);
  }

  if (stations.length === 0) {
    return { value: null, band: null, dominant_pollutant: null, station_count: 0 };
  }

  const avg = Math.round(stations.reduce((sum, s) => sum + s.aqi, 0) / stations.length);

  let dominant = null;
  const worst = stations.reduce((a, b) => (a.aqi >= b.aqi ? a : b));
  try {
    const feedUrl = 'https://api.waqi.info/feed/@' + worst.uid + '/'
      + '?token=' + encodeURIComponent(WAQI_TOKEN);
    const feed = await safeFetch(feedUrl);
    if (feed && feed.status === 'ok' && feed.data) {
      dominant = feed.data.dominentpol || null;
    }
  } catch (err) {
    console.error('WAQI feed failed for', city.id, ':', err.message);
  }

  return {
    value: avg,
    band: cpcbBand(avg),
    dominant_pollutant: dominant,
    station_count: stations.length,
  };
}

// History helpers ------------------------------------------------------------

function emptyHistory(city) {
  return {
    city: city.id,
    name: city.name,
    generated_at: new Date().toISOString(),
    source: { weather: 'open-meteo', aqi: 'open-meteo-air-quality' },
    points_24h: [],
    points_7d: [],
    points_30d: [],
  };
}

function readHistory(dir, city) {
  if (!dir) return emptyHistory(city);
  const path = join(dir, 'history-' + city.id + '.json');
  if (!existsSync(path)) return emptyHistory(city);
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return {
      city: city.id,
      name: city.name,
      generated_at: parsed.generated_at || new Date().toISOString(),
      source: parsed.source || { weather: 'open-meteo', aqi: 'open-meteo-air-quality' },
      points_24h: Array.isArray(parsed.points_24h) ? parsed.points_24h : [],
      points_7d:  Array.isArray(parsed.points_7d)  ? parsed.points_7d  : [],
      points_30d: Array.isArray(parsed.points_30d) ? parsed.points_30d : [],
    };
  } catch (err) {
    console.warn('Failed to read existing history for', city.id, ':', err.message, '— starting empty.');
    return emptyHistory(city);
  }
}

function trimByCutoff(points, cutoffMs) {
  return points.filter(p => {
    const ms = new Date(p.t).getTime();
    return Number.isFinite(ms) && ms >= cutoffMs;
  });
}

function avg(arr) {
  const xs = arr.filter(v => v != null && Number.isFinite(v));
  if (xs.length === 0) return null;
  return Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10;
}

// Append a new point to the rolling 24h list, then maybe extend the 7d / 30d
// series if enough wall-clock time has elapsed since their last entry.
function updateHistory(history, point, nowMs) {
  const cutoff24 = nowMs - HOURS_24  * 3600 * 1000;
  const cutoff7  = nowMs - HOURS_7D  * 3600 * 1000;
  const cutoff30 = nowMs - HOURS_30D * 3600 * 1000;

  const points_24h = trimByCutoff(history.points_24h, cutoff24).concat([point]);

  let points_7d = trimByCutoff(history.points_7d, cutoff7);
  const last7 = points_7d[points_7d.length - 1];
  const last7Ms = last7 ? new Date(last7.t).getTime() : -Infinity;
  if (nowMs - last7Ms >= 60 * 60 * 1000 - 60 * 1000) { // ~1h elapsed (60s slack)
    // Average over the most recent hour of 24h points (post-append).
    const hourCutoff = nowMs - 60 * 60 * 1000;
    const recentHour = points_24h.filter(p => new Date(p.t).getTime() >= hourCutoff);
    points_7d = points_7d.concat([{
      t: new Date(nowMs).toISOString(),
      temp:     avg(recentHour.map(p => p.temp)),
      humidity: avg(recentHour.map(p => p.humidity)),
      aqi:      avg(recentHour.map(p => p.aqi)),
    }]);
  }

  let points_30d = trimByCutoff(history.points_30d, cutoff30);
  const last30 = points_30d[points_30d.length - 1];
  const last30Ms = last30 ? new Date(last30.t).getTime() : -Infinity;
  if (nowMs - last30Ms >= 6 * 60 * 60 * 1000 - 60 * 1000) { // ~6h elapsed
    const sixHourCutoff = nowMs - 6 * 60 * 60 * 1000;
    const recent6h = points_24h.filter(p => new Date(p.t).getTime() >= sixHourCutoff);
    points_30d = points_30d.concat([{
      t: new Date(nowMs).toISOString(),
      temp:     avg(recent6h.map(p => p.temp)),
      humidity: avg(recent6h.map(p => p.humidity)),
      aqi:      avg(recent6h.map(p => p.aqi)),
    }]);
  }

  return {
    ...history,
    generated_at: new Date(nowMs).toISOString(),
    points_24h,
    points_7d,
    points_30d,
  };
}

// --------------------------------------------------------------------------

async function main() {
  let cities;
  try {
    cities = JSON.parse(readFileSync(CITIES_PATH, 'utf8'));
  } catch (err) {
    console.error('Failed to read cities.json at', CITIES_PATH, ':', err.message);
    process.exit(1);
  }
  if (!Array.isArray(cities) || cities.length === 0) {
    console.error('cities.json must be a non-empty array');
    process.exit(1);
  }

  if (!WAQI_TOKEN) {
    console.warn('WAQI_TOKEN not set; AQI fields will be null');
  }

  const weatherList = await fetchOpenMeteo(cities);
  const omAqiList = HISTORY_OUT ? await fetchOpenMeteoAqi(cities) : cities.map(() => null);

  const results = [];
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const weather = weatherList[i];
    const aqi = await fetchWaqiCity(city);
    results.push({
      id: city.id,
      name: city.name,
      lat: city.lat,
      lon: city.lon,
      weather,
      aqi,
    });
  }

  const out = {
    generated_at: new Date().toISOString(),
    source: { weather: 'open-meteo', aqi: 'waqi-cpcb' },
    cities: results,
  };

  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log('Wrote', OUT_PATH);

  if (HISTORY_OUT) {
    mkdirSync(HISTORY_OUT, { recursive: true });
    const nowMs = Date.now();
    for (let i = 0; i < cities.length; i++) {
      const city = cities[i];
      const w = weatherList[i];
      const point = {
        t: new Date(nowMs).toISOString(),
        temp: w && w.temperature_c != null ? w.temperature_c : null,
        humidity: w && w.humidity_pct != null ? w.humidity_pct : null,
        aqi: omAqiList[i],
      };
      const prior = readHistory(HISTORY_IN, city);
      const next = updateHistory(prior, point, nowMs);
      const path = join(HISTORY_OUT, 'history-' + city.id + '.json');
      writeFileSync(path, JSON.stringify(next) + '\n');
    }
    console.log('Updated history files in', HISTORY_OUT);
  }

  const summary = results.map(c => {
    const t = c.weather && c.weather.temperature_c != null ? c.weather.temperature_c.toFixed(1) + '°' : 'n/a';
    const a = c.aqi && c.aqi.value != null ? c.aqi.value : 'n/a';
    return c.name + ': ' + t + ', AQI ' + a + ' (' + (c.aqi.station_count || 0) + ' stations)';
  });
  console.log(summary.join('\n'));
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
