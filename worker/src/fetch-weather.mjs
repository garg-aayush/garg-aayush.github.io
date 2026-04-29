// Pure fetch + transform pipeline for the live India weather feed. Mirrors
// scripts/fetch-india-weather.mjs but with no filesystem dependency: prior
// history comes in as an object, new history goes out as an object, and the
// caller (worker/src/index.mjs) decides where they live.
//
// Functions in this file do not throw on per-source failures: a city missing
// AQI keeps its weather, a global Open-Meteo outage leaves AQI intact. The
// only way buildWeatherUpdate() rejects is if Promise.all() itself blows up,
// which the inner fetchers should prevent by catching their own errors.

const HOURS_24 = 24;

const HISTORY_SOURCE = {
  weather: 'open-meteo',
  aqi: 'open-meteo-air-quality',
  aqi_waqi: 'waqi-cpcb',
};

async function safeFetch(url, { retries = 2, timeoutMs = 8000, headers } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers });
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return await r.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
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
    console.error('Open-Meteo failed:', err && err.message ? err.message : err);
    return cities.map(() => null);
  }
}

// Single Open-Meteo Air Quality call returning the most recent hourly US AQI
// per city. Used only for the 24h chart fallback series (`aqi`); the chart
// prefers the WAQI/CPCB series (`aqi_waqi`) once enough have accumulated.
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
      for (let k = h.us_aqi.length - 1; k >= 0; k--) {
        const v = h.us_aqi[k];
        if (v != null && Number.isFinite(v)) return v;
      }
      return null;
    });
  } catch (err) {
    console.error('Open-Meteo Air Quality failed:', err && err.message ? err.message : err);
    return cities.map(() => null);
  }
}

async function fetchWaqiCity(city, token) {
  if (!token) {
    return { value: null, band: null, dominant_pollutant: null, station_count: 0 };
  }
  const [s, w, n, e] = city.bbox;
  const boundsUrl = 'https://api.waqi.info/map/bounds/'
    + '?latlng=' + [s, w, n, e].join(',')
    + '&token=' + encodeURIComponent(token);

  let stations = [];
  try {
    const resp = await safeFetch(boundsUrl);
    if (resp && resp.status === 'ok' && Array.isArray(resp.data)) {
      stations = resp.data
        .map(s => ({ uid: s.uid, aqi: Number(s.aqi) }))
        .filter(s => Number.isFinite(s.aqi));
    }
  } catch (err) {
    console.error('WAQI bounds failed for', city.id, ':', err && err.message ? err.message : err);
  }

  if (stations.length === 0) {
    return { value: null, band: null, dominant_pollutant: null, station_count: 0 };
  }

  const avg = Math.round(stations.reduce((sum, s) => sum + s.aqi, 0) / stations.length);

  // Dominant-pollutant lookup is intentionally omitted here. It would cost one
  // extra WAQI call per city (20 cities = 20 subrequests) and Cloudflare's
  // free tier caps Workers at 50 subrequests per invocation. The popup's
  // "Dominant" line just stays blank under the Worker; revisit if we ever go
  // to Workers Paid ($5/mo, 1000-subrequest cap).
  return {
    value: avg,
    band: cpcbBand(avg),
    dominant_pollutant: null,
    station_count: stations.length,
  };
}

function emptyHistory(city) {
  return {
    city: city.id,
    name: city.name,
    generated_at: new Date().toISOString(),
    source: { ...HISTORY_SOURCE },
    points_24h: [],
  };
}

function normalizeHistory(city, parsed) {
  if (!parsed) return emptyHistory(city);
  return {
    city: city.id,
    name: city.name,
    generated_at: parsed.generated_at || new Date().toISOString(),
    source: { ...HISTORY_SOURCE, ...(parsed.source || {}) },
    points_24h: Array.isArray(parsed.points_24h) ? parsed.points_24h : [],
  };
}

function trimByCutoff(points, cutoffMs) {
  return points.filter(p => {
    const ms = new Date(p.t).getTime();
    return Number.isFinite(ms) && ms >= cutoffMs;
  });
}

function appendPoint(history, point, nowMs) {
  const cutoff24 = nowMs - HOURS_24 * 3600 * 1000;
  const points_24h = trimByCutoff(history.points_24h, cutoff24).concat([point]);
  return {
    ...history,
    generated_at: new Date(nowMs).toISOString(),
    points_24h,
  };
}

// Top-level entry point. Does all the network fetching, returns the new
// weather.json payload and an updated history map. Pure with respect to the
// outside world: no disk, no GitHub. The caller is responsible for persisting.
//
//   cities         - parsed cities.json array
//   waqiToken      - WAQI API token (env.WAQI_TOKEN); null disables WAQI
//   priorHistory   - { [cityId]: parsedHistoryJson | null }
//
// Returns { weather, history }. `weather` is the weather.json object; `history`
// is { [cityId]: historyObject } to be written as history-<cityId>.json files.
export async function buildWeatherUpdate(cities, waqiToken, priorHistory) {
  const nowMs = Date.now();

  // Open-Meteo: two batched calls in parallel. Each is one HTTP round-trip
  // for all 20 cities.
  const [weatherList, omAqiList] = await Promise.all([
    fetchOpenMeteo(cities),
    fetchOpenMeteoAqi(cities),
  ]);

  // WAQI has no multi-coord endpoint, so it's per-city. Run all 20 in parallel
  // (~40 outbound requests during the Promise.all) — well within Workers' fan-
  // out limits and keeps the whole sweep under ~5s wall clock.
  const aqiList = await Promise.all(
    cities.map(c => fetchWaqiCity(c, waqiToken))
  );

  const cityResults = cities.map((city, i) => ({
    id: city.id,
    name: city.name,
    lat: city.lat,
    lon: city.lon,
    weather: weatherList[i],
    aqi: aqiList[i],
  }));

  const weather = {
    generated_at: new Date(nowMs).toISOString(),
    source: { weather: 'open-meteo', aqi: 'waqi-cpcb' },
    cities: cityResults,
  };

  const history = {};
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const w = weatherList[i];
    const point = {
      t: new Date(nowMs).toISOString(),
      temp: w && w.temperature_c != null ? w.temperature_c : null,
      humidity: w && w.humidity_pct != null ? w.humidity_pct : null,
      aqi: omAqiList[i],
      aqi_waqi: aqiList[i] && aqiList[i].value != null ? aqiList[i].value : null,
    };
    const prior = normalizeHistory(city, priorHistory[city.id]);
    history[city.id] = appendPoint(prior, point, nowMs);
  }

  return { weather, history };
}
