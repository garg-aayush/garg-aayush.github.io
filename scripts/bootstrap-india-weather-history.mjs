#!/usr/bin/env node
// One-shot bootstrap: build per-city history files (history-<id>.json) covering
// the last 30 days of weather (Open-Meteo) and AQI (Open-Meteo Air Quality).
//
// Run via the india-weather-bootstrap GitHub workflow. The output directory
// receives one file per city; the workflow then force-pushes those to the
// `data` branch alongside the existing weather.json.
//
// Each output file has three pre-downsampled views:
//   points_24h  — 15-min cadence, last 24h        (bootstrap fills this hourly;
//                                                   cron densifies over time)
//   points_7d   — hourly cadence, last 7d
//   points_30d  — 6-hourly cadence, last 30d
//
// Each point: { t: ISO8601 UTC, temp: °C, humidity: %, aqi: US-AQI }
//
// Pure ESM, no deps.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CITIES_PATH = pathResolve(__dirname, '..', 'static', 'india-weather', 'cities.json');
const OUT_DIR = pathResolve(process.cwd(), process.argv[2] || './history');

const HOURS_24 = 24;
const HOURS_7D = 7 * 24;
const HOURS_30D = 30 * 24;

async function safeFetch(url, { retries = 2, timeoutMs = 15000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return await r.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

// Open-Meteo Forecast API with past_days returns hourly history through "now"
// from a single endpoint, which the dedicated archive endpoint cannot.
async function fetchWeatherHistory(city) {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + city.lat
    + '&longitude=' + city.lon
    + '&hourly=temperature_2m,relative_humidity_2m'
    + '&past_days=30'
    + '&forecast_days=1'
    + '&timezone=GMT';
  const data = await safeFetch(url);
  const h = data && data.hourly;
  if (!h || !Array.isArray(h.time)) throw new Error('weather: missing hourly block');
  const now = Date.now();
  const out = [];
  for (let i = 0; i < h.time.length; i++) {
    // Open-Meteo emits "YYYY-MM-DDTHH:MM"; tag UTC and normalize to full ISO
    const tMs = new Date(h.time[i] + 'Z').getTime();
    if (Number.isNaN(tMs) || tMs > now) continue;
    out.push({
      t: new Date(tMs).toISOString(),
      temp: numOrNull(h.temperature_2m && h.temperature_2m[i]),
      humidity: numOrNull(h.relative_humidity_2m && h.relative_humidity_2m[i]),
    });
  }
  return out;
}

async function fetchAqiHistory(city) {
  const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
    + '?latitude=' + city.lat
    + '&longitude=' + city.lon
    + '&hourly=us_aqi'
    + '&past_days=30'
    + '&forecast_days=1'
    + '&timezone=GMT';
  const data = await safeFetch(url);
  const h = data && data.hourly;
  if (!h || !Array.isArray(h.time)) {
    console.warn('aqi: missing hourly block for', city.id);
    return [];
  }
  const now = Date.now();
  const out = [];
  for (let i = 0; i < h.time.length; i++) {
    const tMs = new Date(h.time[i] + 'Z').getTime();
    if (Number.isNaN(tMs) || tMs > now) continue;
    out.push({ t: new Date(tMs).toISOString(), aqi: numOrNull(h.us_aqi && h.us_aqi[i]) });
  }
  return out;
}

function numOrNull(v) {
  return v == null || !Number.isFinite(v) ? null : v;
}

function mergeByTime(weatherPts, aqiPts) {
  const aqiMap = new Map();
  for (const p of aqiPts) aqiMap.set(p.t, p.aqi);
  return weatherPts.map(w => ({
    t: w.t,
    temp: w.temp,
    humidity: w.humidity,
    aqi: aqiMap.has(w.t) ? aqiMap.get(w.t) : null,
  }));
}

function takeLastHours(points, hours) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  return points.filter(p => new Date(p.t).getTime() >= cutoff);
}

// Average a series of hourly points into N-hour buckets aligned to UTC midnight.
// Buckets without data are skipped (rather than emitting null points).
function downsample(points, bucketHours) {
  if (bucketHours <= 1) return points.slice();
  const buckets = new Map();
  for (const p of points) {
    const ms = new Date(p.t).getTime();
    if (Number.isNaN(ms)) continue;
    const bucketMs = Math.floor(ms / (bucketHours * 3600 * 1000)) * bucketHours * 3600 * 1000;
    if (!buckets.has(bucketMs)) buckets.set(bucketMs, []);
    buckets.get(bucketMs).push(p);
  }
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  return keys.map(k => {
    const group = buckets.get(k);
    return {
      t: new Date(k).toISOString(),
      temp: avg(group.map(p => p.temp)),
      humidity: avg(group.map(p => p.humidity)),
      aqi: avg(group.map(p => p.aqi)),
    };
  });
}

function avg(arr) {
  const xs = arr.filter(v => v != null && Number.isFinite(v));
  if (xs.length === 0) return null;
  return Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10;
}

async function processCity(city) {
  console.log('Fetching', city.id, '...');
  const [weather, aqi] = await Promise.all([
    fetchWeatherHistory(city),
    fetchAqiHistory(city).catch(err => {
      console.warn('AQI fetch failed for', city.id, ':', err.message);
      return [];
    }),
  ]);
  const merged = mergeByTime(weather, aqi);

  const points_30d_raw = takeLastHours(merged, HOURS_30D);
  const points_7d_raw = takeLastHours(merged, HOURS_7D);
  const points_24h_raw = takeLastHours(merged, HOURS_24);

  return {
    city: city.id,
    name: city.name,
    generated_at: new Date().toISOString(),
    source: { weather: 'open-meteo', aqi: 'open-meteo-air-quality' },
    points_24h: points_24h_raw,                 // hourly (densifies once cron runs)
    points_7d:  points_7d_raw,                  // already hourly
    points_30d: downsample(points_30d_raw, 6),  // 6-hourly
  };
}

async function main() {
  let cities;
  try {
    cities = JSON.parse(readFileSync(CITIES_PATH, 'utf8'));
  } catch (err) {
    console.error('Failed to read cities.json:', err.message);
    process.exit(1);
  }
  if (!Array.isArray(cities) || cities.length === 0) {
    console.error('cities.json must be a non-empty array');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  for (const city of cities) {
    try {
      const file = await processCity(city);
      const outPath = join(OUT_DIR, 'history-' + city.id + '.json');
      writeFileSync(outPath, JSON.stringify(file) + '\n');
      console.log('Wrote', outPath,
        '(24h:', file.points_24h.length,
        '7d:', file.points_7d.length,
        '30d:', file.points_30d.length, 'pts)');
    } catch (err) {
      console.error('Failed to bootstrap', city.id, ':', err.message);
    }
    await new Promise(r => setTimeout(r, 250)); // gentle pace, avoid rate limiting
  }
  console.log('Bootstrap complete:', OUT_DIR);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
