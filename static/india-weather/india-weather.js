// India Weather: client-side renderer.
// Data is fetched from a JSON file refreshed every ~15 minutes by a GitHub Actions cron.
(function () {
  'use strict';

  const SAMPLE_URL = '/static/india-weather/weather.sample.json';
  const REMOTE_URL = 'https://raw.githubusercontent.com/garg-aayush/garg-aayush.github.io/data/weather.json';
  const HISTORY_REMOTE_BASE = 'https://raw.githubusercontent.com/garg-aayush/garg-aayush.github.io/data/';

  const params = new URLSearchParams(location.search);
  const useLocal = params.has('local');
  const DATA_URLS = useLocal ? [SAMPLE_URL] : [REMOTE_URL, SAMPLE_URL];

  // Build the placeholder string by concatenation so the publish-time sed
  // (which targets the literal __MAPBOX_TOKEN__) only rewrites RAW_TOKEN below.
  const TOKEN_PLACEHOLDER = '__' + 'MAPBOX_TOKEN' + '__';
  const RAW_TOKEN = '__MAPBOX_TOKEN__';
  const MAPBOX_TOKEN = (() => {
    try {
      const stored = localStorage.getItem('iwMapboxToken');
      if (stored && stored.length > 0) return stored;
    } catch (e) { /* ignore */ }
    return RAW_TOKEN === TOKEN_PLACEHOLDER ? null : RAW_TOKEN;
  })();

  const elStatus = document.getElementById('iw-status');
  const elUpdated = document.getElementById('iw-updated');
  const elRefresh = document.getElementById('iw-refresh');
  const elList = document.getElementById('iw-leaderboard-list');
  const elTabs = document.querySelectorAll('.iw-tab');
  const elHistoryCity = document.getElementById('iw-history-city');
  const elHistoryStatus = document.getElementById('iw-history-status');
  const elRangeBtns = document.querySelectorAll('.iw-range-btn');

  let map = null;
  let lastData = null;
  const cityState = new Map();
  let activeTab = 'hottest';

  let activeRange = '24h';
  let activeHistoryCity = null;
  const historyCache = new Map(); // cityId -> { points_24h, points_7d, points_30d, generated_at }
  const inflightHistory = new Map(); // cityId -> Promise
  const charts = { aqi: null, temp: null, humidity: null };

  function setStatus(msg, isError) {
    if (!elStatus) return;
    if (msg == null) {
      elStatus.classList.add('iw-hidden');
      elStatus.textContent = '';
      elStatus.classList.remove('iw-error');
      return;
    }
    elStatus.classList.remove('iw-hidden');
    elStatus.classList.toggle('iw-error', !!isError);
    elStatus.textContent = msg;
  }

  function aqiBandClass(band) {
    if (!band) return 'iw-aqi-unknown';
    const map = {
      'Good': 'iw-aqi-good',
      'Satisfactory': 'iw-aqi-satisfactory',
      'Moderate': 'iw-aqi-moderate',
      'Poor': 'iw-aqi-poor',
      'Very Poor': 'iw-aqi-very-poor',
      'Severe': 'iw-aqi-severe',
    };
    return map[band] || 'iw-aqi-unknown';
  }

  function fmtNum(n, digits) {
    if (n == null || !Number.isFinite(n)) return 'n/a';
    return digits === 0 ? Math.round(n).toString() : n.toFixed(digits);
  }

  function relTime(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const diffSec = Math.round((Date.now() - t) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return Math.round(diffSec / 60) + 'm ago';
    if (diffSec < 86400) return Math.round(diffSec / 3600) + 'h ago';
    return Math.round(diffSec / 86400) + 'd ago';
  }

  function formatPollutant(p) {
    if (!p) return '';
    const m = { 'pm25': 'PM2.5', 'pm10': 'PM10', 'o3': 'O3', 'no2': 'NO2', 'so2': 'SO2', 'co': 'CO' };
    return m[p.toLowerCase()] || p.toUpperCase();
  }

  function popupHtml(city) {
    const w = city.weather || {};
    const a = city.aqi || {};
    const aqiClass = aqiBandClass(a.band);
    const aqiVal = a.value == null ? 'n/a' : a.value;
    const dom = formatPollutant(a.dominant_pollutant);
    return [
      '<div class="iw-popup-name">' + city.name + '</div>',
      '<dl class="iw-popup-grid">',
      '<dt>Temp</dt><dd>' + fmtNum(w.temperature_c, 1) + '°C</dd>',
      '<dt>Feels like</dt><dd>' + fmtNum(w.apparent_c, 1) + '°C</dd>',
      '<dt>Humidity</dt><dd>' + fmtNum(w.humidity_pct, 0) + '%</dd>',
      '<dt>UV index</dt><dd>' + fmtNum(w.uv_index, 1) + '</dd>',
      '<dt>AQI</dt><dd><span class="iw-popup-aqi ' + aqiClass + '">' + aqiVal + '</span>'
        + (a.band ? '<span class="iw-popup-aqi-label">' + a.band + '</span>' : '') + '</dd>',
      (dom ? '<dt>Dominant</dt><dd>' + dom + (a.station_count ? ' · ' + a.station_count + ' stations' : '') + '</dd>' : ''),
      '</dl>',
    ].join('');
  }

  function markerHtml(city) {
    const t = city.weather && city.weather.temperature_c != null
      ? Math.round(city.weather.temperature_c) + '°'
      : '—';
    return '<span class="iw-marker-name">' + city.name + '</span>'
      + '<span class="iw-marker-temp">' + t + '</span>';
  }

  function leaderboardSorters() {
    return {
      'hottest': {
        filter: c => c.weather && c.weather.temperature_c != null,
        cmp: (a, b) => b.weather.temperature_c - a.weather.temperature_c,
        primary: c => fmtNum(c.weather.temperature_c, 1) + '°C',
        secondary: c => 'feels ' + fmtNum(c.weather.apparent_c, 0) + '°',
      },
      'worst-air': {
        filter: c => c.aqi && c.aqi.value != null,
        cmp: (a, b) => b.aqi.value - a.aqi.value,
        primary: c => String(c.aqi.value),
        secondary: c => c.aqi.band || '',
      },
      'humid': {
        filter: c => c.weather && c.weather.humidity_pct != null,
        cmp: (a, b) => b.weather.humidity_pct - a.weather.humidity_pct,
        primary: c => fmtNum(c.weather.humidity_pct, 0) + '%',
        secondary: c => fmtNum(c.weather.temperature_c, 0) + '°C',
      },
    };
  }

  function renderLeaderboard(cities) {
    if (!elList) return;
    const cfg = leaderboardSorters()[activeTab];
    const list = cities.filter(cfg.filter).sort(cfg.cmp);
    elList.innerHTML = list.map((c, i) => (
      '<li data-city-id="' + c.id + '">'
        + '<div>'
        +   '<div class="iw-row-name">' + (i + 1) + '. ' + c.name + '</div>'
        +   '<div class="iw-row-sub">' + cfg.secondary(c) + '</div>'
        + '</div>'
        + '<div>'
        +   '<div class="iw-row-value">' + cfg.primary(c) + '</div>'
        +   (activeTab === 'worst-air' && c.aqi && c.aqi.dominant_pollutant
              ? '<div class="iw-row-value-sub">' + formatPollutant(c.aqi.dominant_pollutant) + '</div>'
              : '')
        + '</div>'
        + '</li>'
    )).join('');
    elList.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => focusCity(li.dataset.cityId));
    });
  }

  function focusCity(id) {
    const entry = cityState.get(id);
    if (!entry || !lastData || !map) return;
    const city = lastData.cities.find(c => c.id === id);
    if (!city) return;
    map.flyTo({ center: [city.lon, city.lat], zoom: 8.5, speed: 1.2 });
    if (entry.popup && !entry.popup.isOpen()) {
      entry.marker.togglePopup();
    }
    selectHistoryCity(id);
  }

  function ensureMarkers(data) {
    const wasEmpty = cityState.size === 0;
    for (const city of data.cities) {
      let entry = cityState.get(city.id);
      if (!entry) {
        const el = document.createElement('div');
        el.className = 'iw-marker';
        el.innerHTML = markerHtml(city);
        const popup = new mapboxgl.Popup({ offset: 18, closeButton: true, maxWidth: '300px' })
          .setHTML(popupHtml(city));
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([city.lon, city.lat])
          .setPopup(popup)
          .addTo(map);
        entry = { marker, popup, el };
        cityState.set(city.id, entry);
      } else {
        entry.el.innerHTML = markerHtml(city);
        entry.popup.setHTML(popupHtml(city));
      }
    }
    if (wasEmpty && data.cities.length > 0) {
      const bounds = data.cities.reduce(
        (b, c) => b.extend([c.lon, c.lat]),
        new mapboxgl.LngLatBounds()
      );
      map.fitBounds(bounds, { padding: 50, maxZoom: 6, duration: 0 });
    }
  }

  function renderUpdated(data) {
    if (!elUpdated) return;
    if (data && data.generated_at) {
      elUpdated.textContent = 'Updated ' + relTime(data.generated_at);
      elUpdated.title = new Date(data.generated_at).toLocaleString();
    } else {
      elUpdated.textContent = '';
    }
  }

  function render(data) {
    lastData = data;
    if (map) ensureMarkers(data);
    renderLeaderboard(data.cities);
    renderUpdated(data);
    populateHistoryCityPicker(data.cities);
  }

  // History ------------------------------------------------------------------

  function setHistoryStatus(msg, isError) {
    if (!elHistoryStatus) return;
    elHistoryStatus.textContent = msg || '';
    elHistoryStatus.classList.toggle('iw-error', !!isError);
  }

  function populateHistoryCityPicker(cities) {
    if (!elHistoryCity) return;
    if (elHistoryCity.options.length === cities.length) return; // built once
    const sorted = cities.slice().sort((a, b) => a.name.localeCompare(b.name));
    elHistoryCity.innerHTML = sorted
      .map(c => '<option value="' + c.id + '">' + c.name + '</option>')
      .join('');
    if (!activeHistoryCity) {
      activeHistoryCity = sorted[0].id;
      elHistoryCity.value = activeHistoryCity;
      loadAndRenderHistory(activeHistoryCity);
    }
  }

  function selectHistoryCity(id) {
    if (!id || id === activeHistoryCity) return;
    activeHistoryCity = id;
    if (elHistoryCity) elHistoryCity.value = id;
    loadAndRenderHistory(id);
  }

  async function loadAndRenderHistory(cityId, forceFresh) {
    if (!cityId) return;
    if (!forceFresh && historyCache.has(cityId)) {
      renderCharts(historyCache.get(cityId));
      return;
    }
    setHistoryStatus('Loading history…');
    try {
      const data = await fetchCityHistory(cityId, forceFresh);
      historyCache.set(cityId, data);
      if (cityId === activeHistoryCity) {
        renderCharts(data);
        setHistoryStatus('');
      }
    } catch (err) {
      console.warn('History load failed for', cityId, err);
      if (cityId === activeHistoryCity) {
        setHistoryStatus('Could not load history for this city.', true);
        clearCharts();
      }
    }
  }

  async function fetchCityHistory(cityId, forceFresh) {
    if (inflightHistory.has(cityId) && !forceFresh) return inflightHistory.get(cityId);
    const file = 'history-' + cityId + '.json';
    const candidates = useLocal
      ? ['/static/india-weather/' + file]
      : [HISTORY_REMOTE_BASE + file, '/static/india-weather/' + file];
    const promise = (async () => {
      let lastErr = null;
      for (const base of candidates) {
        const url = forceFresh ? base + '?t=' + Date.now() : base;
        try {
          const r = await fetch(url, forceFresh ? { cache: 'no-store' } : {});
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return await r.json();
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error('no sources');
    })();
    inflightHistory.set(cityId, promise);
    try {
      return await promise;
    } finally {
      inflightHistory.delete(cityId);
    }
  }

  function pickSeries(history, range) {
    if (range === '7d')  return history.points_7d  || [];
    if (range === '30d') return history.points_30d || [];
    return history.points_24h || [];
  }

  function toUplotData(points, key) {
    const xs = [];
    const ys = [];
    for (const p of points) {
      const ms = new Date(p.t).getTime();
      if (!Number.isFinite(ms)) continue;
      const v = p[key];
      xs.push(Math.floor(ms / 1000));
      ys.push(v == null || !Number.isFinite(v) ? null : v);
    }
    return [xs, ys];
  }

  function chartContainer(id) {
    return document.getElementById(id);
  }

  function chartSize(el) {
    const rect = el.getBoundingClientRect();
    return { width: Math.max(280, Math.floor(rect.width)), height: 180 };
  }

  function buildChartOptions(title, color, valueFmt, size) {
    const css = getComputedStyle(document.documentElement);
    const text = (css.getPropertyValue('--text-muted') || '#9aa0a6').trim();
    const grid = (css.getPropertyValue('--border-color') || '#2e2e33').trim();
    return {
      width: size.width,
      height: size.height,
      cursor: { drag: { x: false, y: false } },
      legend: { show: false },
      scales: { x: { time: true } },
      axes: [
        {
          stroke: text,
          grid: { stroke: grid, width: 0.5 },
          ticks: { stroke: grid, width: 0.5 },
        },
        {
          stroke: text,
          grid: { stroke: grid, width: 0.5 },
          ticks: { stroke: grid, width: 0.5 },
          values: (u, splits) => splits.map(v => valueFmt(v)),
        },
      ],
      series: [
        {},
        {
          label: title,
          stroke: color,
          width: 1.6,
          points: { show: false },
          spanGaps: false,
          value: (u, v) => (v == null ? '—' : valueFmt(v)),
        },
      ],
    };
  }

  function ensureChart(slot, containerId, title, color, valueFmt) {
    const el = chartContainer(containerId);
    if (!el) return null;
    const size = chartSize(el);
    if (charts[slot]) {
      charts[slot].setSize(size);
      return charts[slot];
    }
    const opts = buildChartOptions(title, color, valueFmt, size);
    charts[slot] = new uPlot(opts, [[], []], el);
    return charts[slot];
  }

  function clearCharts() {
    for (const k of Object.keys(charts)) {
      if (charts[k]) charts[k].setData([[], []]);
    }
  }

  function renderCharts(history) {
    if (typeof uPlot === 'undefined') return;
    const points = pickSeries(history, activeRange);
    const aqi = ensureChart('aqi', 'iw-chart-aqi', 'AQI', '#75A8D9', v => Math.round(v));
    const temp = ensureChart('temp', 'iw-chart-temp', 'Temp', '#E8A87C', v => v.toFixed(1) + '°');
    const hum = ensureChart('humidity', 'iw-chart-humidity', 'Humidity', '#7CC4A1', v => Math.round(v) + '%');
    if (aqi)  aqi.setData(toUplotData(points, 'aqi'));
    if (temp) temp.setData(toUplotData(points, 'temp'));
    if (hum)  hum.setData(toUplotData(points, 'humidity'));
  }

  function resizeCharts() {
    for (const slot of Object.keys(charts)) {
      const c = charts[slot];
      if (!c) continue;
      const id = 'iw-chart-' + slot;
      const el = chartContainer(id);
      if (el) c.setSize(chartSize(el));
    }
  }

  async function loadData(forceFresh) {
    if (elRefresh) elRefresh.disabled = true;
    let lastErr = null;
    for (const base of DATA_URLS) {
      const url = forceFresh ? base + '?t=' + Date.now() : base;
      try {
        const r = await fetch(url, forceFresh ? { cache: 'no-store' } : {});
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        render(data);
        if (map) setStatus(null);
        if (elRefresh) elRefresh.disabled = false;
        return;
      } catch (err) {
        lastErr = err;
        console.warn('Data fetch failed for', base, err);
      }
    }
    console.error('All data sources failed', lastErr);
    setStatus('Could not load weather data. Try refreshing.', true);
    if (elRefresh) elRefresh.disabled = false;
  }

  function initMap() {
    if (typeof mapboxgl === 'undefined') {
      setStatus('Mapbox failed to load.', true);
      return;
    }
    if (!MAPBOX_TOKEN) {
      setStatus('Map unavailable: MAPBOX_TOKEN secret is not set in this deploy. ' +
        '(Local dev: run localStorage.setItem("iwMapboxToken", "pk....") in this console, then reload.)', true);
      return;
    }
    mapboxgl.accessToken = MAPBOX_TOKEN;
    try {
      map = new mapboxgl.Map({
        container: 'iw-map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [80.0, 22.5],
        zoom: 3.8,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => {
        setStatus(null);
        if (lastData) ensureMarkers(lastData);
      });
      map.on('error', (e) => {
        const msg = (e && e.error && e.error.message) || 'Unknown error';
        if (msg.toLowerCase().includes('access token')) {
          setStatus('Map error: invalid Mapbox token.', true);
        }
      });
    } catch (err) {
      console.error('Mapbox init failed', err);
      setStatus('Map failed to initialise.', true);
    }
  }

  function bindUI() {
    elTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        elTabs.forEach(b => b.classList.toggle('iw-active', b === btn));
        activeTab = btn.dataset.tab;
        if (lastData) renderLeaderboard(lastData.cities);
      });
    });
    if (elRefresh) {
      elRefresh.addEventListener('click', () => {
        loadData(true);
        if (activeHistoryCity) loadAndRenderHistory(activeHistoryCity, true);
      });
    }
    if (elHistoryCity) {
      elHistoryCity.addEventListener('change', () => {
        selectHistoryCity(elHistoryCity.value);
      });
    }
    elRangeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        elRangeBtns.forEach(b => b.classList.toggle('iw-active', b === btn));
        activeRange = btn.dataset.range;
        if (activeHistoryCity && historyCache.has(activeHistoryCity)) {
          renderCharts(historyCache.get(activeHistoryCity));
        }
      });
    });
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resizeCharts, 150);
    });
    setInterval(() => {
      if (lastData) renderUpdated(lastData);
    }, 60000);
  }

  function start() {
    bindUI();
    setStatus('Loading map...');
    initMap();
    loadData(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
