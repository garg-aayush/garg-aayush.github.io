#!/usr/bin/env node
// Build per-city daily aggregate files (daily-<id>.json) covering the last 30
// complete IST days. Each run rewrites the files from scratch using
// Open-Meteo's Forecast API (past_days=30) for temperature + humidity and the
// Air Quality API (past_days=30) for US AQI.
//
// Run by .github/workflows/india-weather-daily.yml once per day at 02:00 IST.
// Because each run rebuilds the full 30-day window, missed cron runs heal
// automatically and no separate bootstrap is needed.
//
// Output schema (per city):
//   {
//     city, name, generated_at, tz: "Asia/Kolkata",
//     source: { weather, aqi },
//     days: [
//       { date: "YYYY-MM-DD",
//         temp_min, temp_max, temp_mean,
//         humidity_min, humidity_max, humidity_mean,
//         aqi_min, aqi_max, aqi_mean },
//       ...
//     ]
//   }
//
// Pure ESM, no deps.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CITIES_PATH = pathResolve(__dirname, '..', 'static', 'india-weather', 'cities.json');
const OUT_DIR = pathResolve(process.cwd(), process.argv[2] || './daily');

const TZ = 'Asia/Kolkata';
const DAYS = 30;
const MIN_HOURS_PER_DAY = 18; // require 18+ of 24 hours to count a day

async function safeFetch(url, { retries = 2, timeoutMs = 20000 } = {}) {
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

function numOrNull(v) {
  return v == null || !Number.isFinite(v) ? null : v;
}

// Multi-coord weather: hourly temperature_2m + relative_humidity_2m, IST time.
async function fetchWeather(cities) {
  const lats = cities.map(c => c.lat).join(',');
  const lons = cities.map(c => c.lon).join(',');
  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + lats
    + '&longitude=' + lons
    + '&hourly=temperature_2m,relative_humidity_2m'
    + '&past_days=' + DAYS
    + '&forecast_days=1'
    + '&timezone=' + encodeURIComponent(TZ);
  const data = await safeFetch(url);
  const arr = Array.isArray(data) ? data : [data];
  return cities.map((_, i) => {
    const h = arr[i] && arr[i].hourly;
    if (!h || !Array.isArray(h.time)) return null;
    return h;
  });
}

// Multi-coord AQI: hourly US AQI, IST time.
async function fetchAqi(cities) {
  const lats = cities.map(c => c.lat).join(',');
  const lons = cities.map(c => c.lon).join(',');
  const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
    + '?latitude=' + lats
    + '&longitude=' + lons
    + '&hourly=us_aqi'
    + '&past_days=' + DAYS
    + '&forecast_days=1'
    + '&timezone=' + encodeURIComponent(TZ);
  const data = await safeFetch(url);
  const arr = Array.isArray(data) ? data : [data];
  return cities.map((_, i) => {
    const h = arr[i] && arr[i].hourly;
    if (!h || !Array.isArray(h.time)) return null;
    return h;
  });
}

// Group hourly arrays by IST date ("YYYY-MM-DD" prefix of "YYYY-MM-DDTHH:MM").
// Returns Map<dateStr, { temp:[], humidity:[], aqi:[] }>.
function groupByDate(weatherHourly, aqiHourly) {
  const buckets = new Map();
  const ensure = (date) => {
    if (!buckets.has(date)) buckets.set(date, { temp: [], humidity: [], aqi: [] });
    return buckets.get(date);
  };

  if (weatherHourly && Array.isArray(weatherHourly.time)) {
    const t = weatherHourly.time;
    const temps = weatherHourly.temperature_2m || [];
    const hums  = weatherHourly.relative_humidity_2m || [];
    for (let i = 0; i < t.length; i++) {
      const date = (t[i] || '').slice(0, 10);
      if (date.length !== 10) continue;
      const b = ensure(date);
      const tv = numOrNull(temps[i]);
      const hv = numOrNull(hums[i]);
      if (tv != null) b.temp.push(tv);
      if (hv != null) b.humidity.push(hv);
    }
  }

  if (aqiHourly && Array.isArray(aqiHourly.time)) {
    const t = aqiHourly.time;
    const aqis = aqiHourly.us_aqi || [];
    for (let i = 0; i < t.length; i++) {
      const date = (t[i] || '').slice(0, 10);
      if (date.length !== 10) continue;
      const b = ensure(date);
      const v = numOrNull(aqis[i]);
      if (v != null) b.aqi.push(v);
    }
  }

  return buckets;
}

function round1(n) { return Math.round(n * 10) / 10; }

function aggregate(values) {
  if (!values || values.length === 0) {
    return { min: null, max: null, mean: null };
  }
  let mn = Infinity, mx = -Infinity, sum = 0;
  for (const v of values) {
    if (v < mn) mn = v;
    if (v > mx) mx = v;
    sum += v;
  }
  return { min: round1(mn), max: round1(mx), mean: round1(sum / values.length) };
}

// Today's IST date string ("YYYY-MM-DD"), used to drop the in-progress day.
function todayIst() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date());
}

function buildCityFile(city, weatherHourly, aqiHourly) {
  const buckets = groupByDate(weatherHourly, aqiHourly);
  const today = todayIst();

  const dates = [...buckets.keys()]
    .filter(d => d < today) // exclude in-progress IST day
    .sort(); // ascending

  const days = [];
  for (const date of dates) {
    const b = buckets.get(date);
    // Require at least MIN_HOURS_PER_DAY hourly temperature samples to count
    // the day (guards against partial archive returns near the window edge).
    if (!b.temp || b.temp.length < MIN_HOURS_PER_DAY) continue;
    const t = aggregate(b.temp);
    const h = aggregate(b.humidity);
    const a = aggregate(b.aqi);
    days.push({
      date,
      temp_min: t.min, temp_max: t.max, temp_mean: t.mean,
      humidity_min: h.min, humidity_max: h.max, humidity_mean: h.mean,
      aqi_min: a.min, aqi_max: a.max, aqi_mean: a.mean,
    });
  }

  // Keep the most recent DAYS days only.
  const trimmed = days.slice(-DAYS);

  return {
    city: city.id,
    name: city.name,
    generated_at: new Date().toISOString(),
    tz: TZ,
    source: { weather: 'open-meteo-forecast-past_days', aqi: 'open-meteo-air-quality-past_days' },
    days: trimmed,
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

  console.log('Fetching weather for', cities.length, 'cities (past_days=' + DAYS + ', tz=' + TZ + ')');
  const [weatherList, aqiList] = await Promise.all([
    fetchWeather(cities).catch(err => {
      console.error('Weather fetch failed:', err.message);
      return cities.map(() => null);
    }),
    fetchAqi(cities).catch(err => {
      console.error('AQI fetch failed:', err.message);
      return cities.map(() => null);
    }),
  ]);

  let wrote = 0;
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    try {
      const file = buildCityFile(city, weatherList[i], aqiList[i]);
      if (file.days.length === 0) {
        console.warn('No usable days for', city.id, '— skipping write.');
        continue;
      }
      const outPath = join(OUT_DIR, 'daily-' + city.id + '.json');
      writeFileSync(outPath, JSON.stringify(file) + '\n');
      console.log('Wrote', outPath, '(' + file.days.length + ' days)');
      wrote++;
    } catch (err) {
      console.error('Failed to build', city.id, ':', err.message);
    }
  }

  if (wrote === 0) {
    console.error('No daily files written — failing the run so the cron does not blow away existing data.');
    process.exit(1);
  }
  console.log('Daily aggregate build complete:', OUT_DIR);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
