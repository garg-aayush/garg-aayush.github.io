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

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CITIES_PATH = pathResolve(__dirname, '..', 'static', 'india-weather', 'cities.json');
const OUT_PATH = pathResolve(process.cwd(), process.argv[2] || './weather.json');

const WAQI_TOKEN = process.env.WAQI_TOKEN || '';

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
    // Multi-coord requests return an array; single returns an object.
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
      // WAQI's spelling is "dominentpol".
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
