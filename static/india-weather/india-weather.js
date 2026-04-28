// India Weather: client-side renderer.
// Live tile data is fetched from weather.json (refreshed every 15 minutes).
// 24h history comes from history-<id>.json (15-min cadence).
// 7d / 30d history comes from daily-<id>.json (one entry per IST day with
// min/max/mean for temp, humidity, and US AQI).
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
  const elList = document.getElementById('iw-leaderboard-list');
  const elTabs = document.querySelectorAll('.iw-tab');
  const elHistoryCity = document.getElementById('iw-history-city');
  const elHistoryStatus = document.getElementById('iw-history-status');
  const elRangeBtns = document.querySelectorAll('.iw-range-btn');

  // Default camera, also used by the reset-view control to fly back home.
  const HOME_VIEW = { center: [80.0, 22.5], zoom: 3.8 };

  let map = null;
  let lastData = null;
  const cityState = new Map();
  let activeTab = 'hottest';

  let activeRange = '24h';
  let activeHistoryCity = null;
  // Hourly history (24h view) and daily aggregates (7d / 30d) are fetched
  // and cached independently so switching ranges doesn't refetch.
  const hourlyCache = new Map();   // cityId -> { points_24h, ... }
  const dailyCache = new Map();    // cityId -> { days: [...] }
  const inflightHourly = new Map();
  const inflightDaily = new Map();
  const charts = { aqi: null, temp: null, humidity: null };

  // US AQI category breakpoints (Open-Meteo Air Quality is on the US AQI
  // scale, not CPCB; the live tile uses CPCB and is shown separately).
  const US_AQI_CATEGORIES = [
    { max: 50,  name: 'Good',                         fill: '#00E400', text: '#111' },
    { max: 100, name: 'Moderate',                     fill: '#FFFF00', text: '#111' },
    { max: 150, name: 'Unhealthy for sensitive grps', fill: '#FF7E00', text: '#111' },
    { max: 200, name: 'Unhealthy',                    fill: '#FF0000', text: '#fff' },
    { max: 300, name: 'Very unhealthy',               fill: '#8F3F97', text: '#fff' },
    { max: Infinity, name: 'Hazardous',               fill: '#7E0023', text: '#fff' },
  ];

  function aqiCategory(value) {
    if (value == null || !Number.isFinite(value)) {
      return { name: 'No data', fill: 'rgba(255,255,255,0.18)', text: '#9aa0a6' };
    }
    for (const c of US_AQI_CATEGORIES) {
      if (value <= c.max) return c;
    }
    return US_AQI_CATEGORIES[US_AQI_CATEGORIES.length - 1];
  }

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
      '<dt>AQI</dt><dd><span class="iw-popup-aqi ' + aqiClass + '">' + aqiVal + '</span>'
        + (a.band ? '<span class="iw-popup-aqi-label">' + a.band + '</span>' : '') + '</dd>',
      (dom ? '<dt>Dominant</dt><dd>' + dom + (a.station_count ? ' · ' + a.station_count + ' stations' : '') + '</dd>' : ''),
      '</dl>',
    ].join('');
  }

  // -- Marker layout --------------------------------------------------------
  //
  // Each marker is a 0x0 wrapper anchored at the city's lng/lat. Inside we
  // render three layers:
  //   - a small dot at the wrapper origin (the actual geo pin),
  //   - an SVG leader from the dot to a chosen anchor point,
  //   - a label pill (name + temp) translated to that anchor point.
  //
  // ANCHOR_OFFSETS maps a compass anchor to the pill's offset (x, y) from the
  // dot, plus the percentage shift (tx, ty) that aligns the pill's anchored
  // edge with that point. CITY_ANCHORS hand-curates a preferred anchor order
  // for cities in the cluttered NCR cluster; everything else falls back to a
  // generic order. relayoutMarkers() walks cities in priority order and picks
  // the first anchor whose pill bbox doesn't collide with already-placed
  // pills; pills with no free anchor are hidden (the dot still shows).
  const ANCHOR_OFFSETS = {
    ne: { x:  14, y: -10, tx: '0',     ty: '-100%' },
    nw: { x: -14, y: -10, tx: '-100%', ty: '-100%' },
    se: { x:  14, y:  10, tx: '0',     ty: '0' },
    sw: { x: -14, y:  10, tx: '-100%', ty: '0' },
    e:  { x:  16, y:   0, tx: '0',     ty: '-50%' },
    w:  { x: -16, y:   0, tx: '-100%', ty: '-50%' },
    n:  { x:   0, y: -16, tx: '-50%',  ty: '-100%' },
    s:  { x:   0, y:  16, tx: '-50%',  ty: '0' },
  };

  const CITY_ANCHORS = {
    delhi:     ['ne', 'n', 'nw'],
    gurugram:  ['sw', 's', 'w'],
    ghaziabad: ['e', 'se', 'ne'],
    noida:     ['se', 's', 'e'],
  };
  const DEFAULT_ANCHORS = ['ne', 'e', 'se', 'sw', 'w', 'nw', 'n', 's'];

  function pillContents(city) {
    const t = city.weather && city.weather.temperature_c != null
      ? Math.round(city.weather.temperature_c) + '°'
      : '—';
    return '<span class="iw-marker-name">' + city.name + '</span>'
      + '<span class="iw-marker-temp">' + t + '</span>';
  }

  function buildMarkerElement(city) {
    const root = document.createElement('div');
    root.className = 'iw-marker';
    root.title = city.name;

    const leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    leader.setAttribute('class', 'iw-marker-leader');
    leader.setAttribute('width', '1');
    leader.setAttribute('height', '1');
    leader.setAttribute('overflow', 'visible');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', '0');
    line.setAttribute('x2', '0');
    line.setAttribute('y2', '0');
    leader.appendChild(line);

    const pill = document.createElement('div');
    pill.className = 'iw-marker-pill';
    pill.innerHTML = pillContents(city);

    const dot = document.createElement('span');
    dot.className = 'iw-marker-dot';

    root.appendChild(leader);
    root.appendChild(pill);
    root.appendChild(dot);

    return { root, leader, line, pill, dot };
  }

  function applyAnchor(entry, anchor) {
    const off = ANCHOR_OFFSETS[anchor];
    if (!off) return;
    entry.pill.style.transform =
      'translate(' + off.x + 'px, ' + off.y + 'px) translate(' + off.tx + ', ' + off.ty + ')';
    entry.line.setAttribute('x2', String(off.x));
    entry.line.setAttribute('y2', String(off.y));
    entry.currentAnchor = anchor;
  }

  function rectsOverlap(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  function padRect(r, pad) {
    return { left: r.left - pad, right: r.right + pad, top: r.top - pad, bottom: r.bottom + pad };
  }

  // Re-runs after every map move/zoom (rAF-coalesced) and after data updates.
  // Cities are sorted hottest-first so the highest-priority labels claim
  // their preferred anchor; cooler cities yield. Pills with no clear slot
  // hide their pill+leader -- the dot stays visible so the city is still
  // findable via hover or click.
  function relayoutMarkers() {
    if (!lastData || cityState.size === 0) return;
    const sorted = lastData.cities.slice().sort((a, b) => {
      const ta = (a.weather && a.weather.temperature_c != null) ? a.weather.temperature_c : -Infinity;
      const tb = (b.weather && b.weather.temperature_c != null) ? b.weather.temperature_c : -Infinity;
      return tb - ta;
    });

    const placed = [];
    for (const city of sorted) {
      const entry = cityState.get(city.id);
      if (!entry) continue;
      const anchors = CITY_ANCHORS[city.id] || DEFAULT_ANCHORS;

      entry.pill.classList.remove('iw-hidden');
      entry.leader.classList.remove('iw-hidden');

      let chosen = null;
      let chosenRect = null;
      for (const a of anchors) {
        applyAnchor(entry, a);
        const rect = entry.pill.getBoundingClientRect();
        const padded = padRect(rect, 3);
        if (placed.every(r => !rectsOverlap(padded, r))) {
          chosen = a;
          chosenRect = padded;
          break;
        }
      }

      if (chosen == null) {
        entry.pill.classList.add('iw-hidden');
        entry.leader.classList.add('iw-hidden');
      } else {
        placed.push(chosenRect);
      }
    }
  }

  let relayoutScheduled = false;
  function scheduleRelayout() {
    if (relayoutScheduled) return;
    relayoutScheduled = true;
    requestAnimationFrame(() => {
      relayoutScheduled = false;
      relayoutMarkers();
    });
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
        const parts = buildMarkerElement(city);
        const popup = new mapboxgl.Popup({ offset: 18, closeButton: true, maxWidth: '300px' })
          .setHTML(popupHtml(city));
        const marker = new mapboxgl.Marker({ element: parts.root, anchor: 'center' })
          .setLngLat([city.lon, city.lat])
          .setPopup(popup)
          .addTo(map);
        entry = Object.assign({ marker, popup, el: parts.root }, parts);
        cityState.set(city.id, entry);
      } else {
        entry.pill.innerHTML = pillContents(city);
        entry.popup.setHTML(popupHtml(city));
      }
    }
    if (wasEmpty && data.cities.length > 0) {
      const bounds = data.cities.reduce(
        (b, c) => b.extend([c.lon, c.lat]),
        new mapboxgl.LngLatBounds()
      );
      map.fitBounds(bounds, { padding: 50, maxZoom: 5.5, duration: 0 });
    }
    scheduleRelayout();
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

  // Fetch the right file for the active range. 24h uses hourly history;
  // 7d / 30d both share the same daily-aggregate file (just different slices).
  function fetchForRange(cityId, range, forceFresh) {
    if (range === '24h') {
      return fetchCachedJson({
        cityId, forceFresh,
        cache: hourlyCache,
        inflight: inflightHourly,
        remoteFile: 'history-' + cityId + '.json',
        sampleFile: 'history-' + cityId + '.sample.json',
      });
    }
    return fetchCachedJson({
      cityId, forceFresh,
      cache: dailyCache,
      inflight: inflightDaily,
      remoteFile: 'daily-' + cityId + '.json',
      sampleFile: 'daily-' + cityId + '.sample.json',
    });
  }

  function fetchCachedJson({ cityId, forceFresh, cache, inflight, remoteFile, sampleFile }) {
    if (!forceFresh && cache.has(cityId)) return Promise.resolve(cache.get(cityId));
    if (!forceFresh && inflight.has(cityId)) return inflight.get(cityId);
    const candidates = useLocal
      ? ['/static/india-weather/' + sampleFile]
      : [HISTORY_REMOTE_BASE + remoteFile, '/static/india-weather/' + sampleFile];
    const promise = (async () => {
      let lastErr = null;
      for (const base of candidates) {
        const url = forceFresh ? base + '?t=' + Date.now() : base;
        try {
          const r = await fetch(url, forceFresh ? { cache: 'no-store' } : {});
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const data = await r.json();
          cache.set(cityId, data);
          return data;
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error('no sources');
    })();
    inflight.set(cityId, promise);
    try { return promise; }
    finally { /* cleanup happens in then/finally below */ }
  }

  async function loadAndRenderHistory(cityId, forceFresh) {
    if (!cityId) return;
    setHistoryStatus('Loading history…');
    try {
      const data = await fetchForRange(cityId, activeRange, forceFresh);
      if (cityId !== activeHistoryCity) return;
      renderCharts(cityId);
      setHistoryStatus('');
    } catch (err) {
      console.warn('History load failed for', cityId, activeRange, err);
      if (cityId === activeHistoryCity) {
        setHistoryStatus('Could not load history for this city.', true);
        clearCharts();
      }
    } finally {
      // Always free the inflight slot.
      inflightHourly.delete(cityId);
      inflightDaily.delete(cityId);
    }
  }

  // -- Chart helpers ---------------------------------------------------------

  // Floating tooltip plugin. Each chart passes a `format(uplot, idx)` callback
  // that returns the inner HTML for the current data point. The plugin handles
  // positioning, edge clamping, and show/hide.
  function tooltipPlugin(format) {
    let tip = null;
    let over = null;

    return {
      hooks: {
        init: (u) => {
          over = u.over;
          tip = document.createElement('div');
          tip.className = 'iw-chart-tooltip iw-hidden';
          over.appendChild(tip);

          over.addEventListener('mouseleave', () => {
            tip.classList.add('iw-hidden');
          });
        },
        setCursor: (u) => {
          if (!tip) return;
          const { idx, left } = u.cursor;
          if (idx == null || left < 0) {
            tip.classList.add('iw-hidden');
            return;
          }
          const html = format(u, idx);
          if (!html) {
            tip.classList.add('iw-hidden');
            return;
          }
          tip.innerHTML = html;
          tip.classList.remove('iw-hidden');

          // Pin to top of plot and flip to the opposite horizontal half from
          // the cursor, so the tooltip never covers the point being inspected.
          const parentW = u.over.clientWidth;
          const w = tip.offsetWidth;
          const pad = 6;
          const x = (left < parentW / 2)
            ? Math.max(pad, parentW - w - pad)
            : pad;
          const y = pad;
          tip.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        },
        destroy: () => {
          if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
          tip = null;
        },
      },
    };
  }

  function fmtTime24h(unixSec) {
    const d = new Date(unixSec * 1000);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return day + ' · ' + hh + ':' + mm;
  }

  function fmtDateDay(unixSec) {
    const d = new Date(unixSec * 1000);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function chartContainer(id) {
    return document.getElementById(id);
  }

  function chartSize(el) {
    const rect = el.getBoundingClientRect();
    return { width: Math.max(280, Math.floor(rect.width)), height: 200 };
  }

  function destroyChart(slot) {
    if (charts[slot]) {
      try { charts[slot].destroy(); } catch (e) { /* ignore */ }
      charts[slot] = null;
    }
  }

  function clearCharts() {
    for (const slot of Object.keys(charts)) destroyChart(slot);
  }

  function themeColors() {
    const css = getComputedStyle(document.documentElement);
    return {
      text: (css.getPropertyValue('--text-muted') || '#9aa0a6').trim(),
      grid: (css.getPropertyValue('--border-color') || '#2e2e33').trim(),
    };
  }

  // -- 24h: simple line charts (existing behavior) --------------------------

  function pointsToLine(points, key) {
    const xs = [];
    const ys = [];
    for (const p of points || []) {
      const ms = new Date(p.t).getTime();
      if (!Number.isFinite(ms)) continue;
      const v = p[key];
      xs.push(Math.floor(ms / 1000));
      ys.push(v == null || !Number.isFinite(v) ? null : v);
    }
    return [xs, ys];
  }

  function buildLineOpts(title, color, valueFmt, size) {
    const t = themeColors();
    const tip = tooltipPlugin((u, idx) => {
      const x = u.data[0][idx];
      const y = u.data[1][idx];
      if (x == null) return '';
      const val = (y == null) ? '—' : valueFmt(y);
      return '<div class="iw-tt-time">' + fmtTime24h(x) + '</div>'
        + '<div class="iw-tt-row"><span class="iw-tt-dot" style="background:' + color + '"></span>'
        + '<span class="iw-tt-label">' + title + '</span>'
        + '<span class="iw-tt-val">' + val + '</span></div>';
    });
    return {
      width: size.width,
      height: size.height,
      cursor: { drag: { x: false, y: false }, points: { size: 8 } },
      legend: { show: false },
      scales: { x: { time: true } },
      axes: [
        { stroke: t.text, grid: { stroke: t.grid, width: 0.5 }, ticks: { stroke: t.grid, width: 0.5 } },
        {
          stroke: t.text,
          grid: { stroke: t.grid, width: 0.5 },
          ticks: { stroke: t.grid, width: 0.5 },
          values: (u, splits) => splits.map(v => valueFmt(v)),
        },
      ],
      series: [
        {},
        { label: title, stroke: color, width: 1.6, points: { show: false }, spanGaps: false,
          value: (u, v) => (v == null ? '—' : valueFmt(v)) },
      ],
      plugins: [tip],
    };
  }

  function renderLineChart(slot, containerId, title, color, valueFmt, points, key) {
    const el = chartContainer(containerId);
    if (!el) return;
    destroyChart(slot);
    const opts = buildLineOpts(title, color, valueFmt, chartSize(el));
    charts[slot] = new uPlot(opts, pointsToLine(points, key), el);
  }

  // -- 7d / 30d: band charts (temp, humidity) and category bars (AQI) -------

  function daySliceForRange(daily, range) {
    const days = (daily && Array.isArray(daily.days)) ? daily.days : [];
    if (range === '7d') return days.slice(-7);
    if (range === '30d') return days.slice(-30);
    return days;
  }

  // Convert "YYYY-MM-DD" (IST date) to a unix timestamp (seconds) at IST noon.
  // Noon centers daily x-positions on the day so bar charts and labels align
  // visually under the date.
  function istDateToTs(date) {
    // 12:00 IST = 06:30 UTC
    const ms = Date.parse(date + 'T06:30:00Z');
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }

  function daysToBandData(days, keyMin, keyMax, keyMean) {
    const xs = [], mins = [], maxs = [], means = [];
    for (const d of days) {
      const ts = istDateToTs(d.date);
      if (ts == null) continue;
      xs.push(ts);
      mins.push(d[keyMin] == null || !Number.isFinite(d[keyMin]) ? null : d[keyMin]);
      maxs.push(d[keyMax] == null || !Number.isFinite(d[keyMax]) ? null : d[keyMax]);
      means.push(d[keyMean] == null || !Number.isFinite(d[keyMean]) ? null : d[keyMean]);
    }
    return [xs, mins, maxs, means];
  }

  // Day-level x-axis for 7d / 30d charts. Bars are centered at noon IST
  // (= 06:30 UTC) for each IST day; uPlot's default tick generator places
  // splits at midnight UTC, which sits ~6.5h to the left of every bar and
  // produces the visible misalignment. Override `splits` to return our
  // actual per-bar timestamps instead, and stride them down for 30d so the
  // labels don't run into each other.
  function dayAxisConfig(t, days) {
    const dayTs = (days || [])
      .map(d => istDateToTs(d.date))
      .filter(ts => ts != null);
    // Aim for ~6 labels regardless of range. 7d -> stride 1, 30d -> stride 5.
    const stride = dayTs.length > 14 ? 5 : 1;
    const ticks = dayTs.filter((_, i) => i % stride === 0);
    return {
      stroke: t.text,
      grid: { stroke: t.grid, width: 0.5 },
      ticks: { stroke: t.grid, width: 0.5 },
      space: 50,
      splits: () => ticks,
      values: (u, sp) => sp.map(s => {
        const d = new Date(s * 1000);
        return (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
      }),
    };
  }

  // Half-day padding on each side so the leftmost / rightmost daily marker
  // (and bar) aren't clipped at the chart edge.
  const X_PAD = 12 * 3600;
  function paddedXRange() {
    return (u, dataMin, dataMax) => [dataMin - X_PAD, dataMax + X_PAD];
  }

  function buildBandOpts(title, color, bandColor, valueFmt, size, days) {
    const t = themeColors();
    const tip = tooltipPlugin((u, idx) => {
      const x = u.data[0][idx];
      const lo = u.data[1][idx];
      const hi = u.data[2][idx];
      const mid = u.data[3][idx];
      if (x == null) return '';
      const fmt = v => (v == null ? '—' : valueFmt(v));
      return '<div class="iw-tt-time">' + fmtDateDay(x) + '</div>'
        + '<div class="iw-tt-row"><span class="iw-tt-dot" style="background:' + color + '"></span>'
        + '<span class="iw-tt-label">' + title + ' avg</span>'
        + '<span class="iw-tt-val">' + fmt(mid) + '</span></div>'
        + '<div class="iw-tt-row iw-tt-sub"><span class="iw-tt-label">min</span>'
        + '<span class="iw-tt-val">' + fmt(lo) + '</span></div>'
        + '<div class="iw-tt-row iw-tt-sub"><span class="iw-tt-label">max</span>'
        + '<span class="iw-tt-val">' + fmt(hi) + '</span></div>';
    });
    return {
      width: size.width,
      height: size.height,
      cursor: { drag: { x: false, y: false }, points: { size: 8 } },
      legend: { show: false },
      scales: { x: { time: true, range: paddedXRange() } },
      axes: [
        dayAxisConfig(t, days),
        {
          stroke: t.text,
          grid: { stroke: t.grid, width: 0.5 },
          ticks: { stroke: t.grid, width: 0.5 },
          values: (u, splits) => splits.map(v => valueFmt(v)),
        },
      ],
      series: [
        {},
        // min and max are invisible lines — they only exist so the band fill
        // has something to reference. They show in the cursor tooltip though.
        { label: 'min', stroke: 'transparent', fill: undefined, width: 0,
          points: { show: false }, value: (u, v) => (v == null ? '—' : valueFmt(v)) },
        { label: 'max', stroke: 'transparent', fill: undefined, width: 0,
          points: { show: false }, value: (u, v) => (v == null ? '—' : valueFmt(v)) },
        { label: title, stroke: color, width: 1.8,
          points: { show: false }, spanGaps: false,
          value: (u, v) => (v == null ? '—' : valueFmt(v)) },
      ],
      bands: [
        { series: [2, 1], fill: bandColor },
      ],
      plugins: [tip],
    };
  }

  function renderBandChart(slot, containerId, title, color, bandColor, valueFmt, days, keyMin, keyMax, keyMean) {
    const el = chartContainer(containerId);
    if (!el) return;
    destroyChart(slot);
    const opts = buildBandOpts(title, color, bandColor, valueFmt, chartSize(el), days);
    charts[slot] = new uPlot(opts, daysToBandData(days, keyMin, keyMax, keyMean), el);
  }

  function renderAqiBarChart(containerId, days) {
    const el = chartContainer(containerId);
    if (!el) return;
    destroyChart('aqi');

    const xs = [], means = [], fills = [];
    for (const d of days) {
      const ts = istDateToTs(d.date);
      if (ts == null) continue;
      xs.push(ts);
      const v = (d.aqi_mean != null && Number.isFinite(d.aqi_mean)) ? d.aqi_mean : null;
      means.push(v);
      fills.push(aqiCategory(v).fill);
    }

    const t = themeColors();
    // Pick a bar size that scales with point density: ~70% of slot width.
    const barFactor = days.length > 14 ? 0.55 : 0.65;

    const tip = tooltipPlugin((u, idx) => {
      const d = days[idx] || {};
      const v = u.data[1][idx];
      if (d.date == null) return '';
      const cat = aqiCategory(v);
      const fill = cat.fill;
      const valStr = (v == null) ? '—' : Math.round(v);
      return '<div class="iw-tt-time">' + fmtDateDay(u.data[0][idx]) + '</div>'
        + '<div class="iw-tt-row"><span class="iw-tt-dot" style="background:' + fill + '"></span>'
        + '<span class="iw-tt-label">AQI avg</span>'
        + '<span class="iw-tt-val">' + valStr + '</span></div>'
        + '<div class="iw-tt-row iw-tt-sub"><span class="iw-tt-label">min</span>'
        + '<span class="iw-tt-val">' + (d.aqi_min ?? '—') + '</span></div>'
        + '<div class="iw-tt-row iw-tt-sub"><span class="iw-tt-label">max</span>'
        + '<span class="iw-tt-val">' + (d.aqi_max ?? '—') + '</span></div>'
        + '<div class="iw-tt-cat">' + cat.name + '</div>';
    });

    const opts = {
      width: chartSize(el).width,
      height: chartSize(el).height,
      cursor: { drag: { x: false, y: false }, points: { size: 0 } },
      legend: { show: false },
      scales: {
        x: { time: true, range: paddedXRange() },
        y: { range: (u, lo, hi) => [0, Math.max(50, hi)] },
      },
      axes: [
        dayAxisConfig(t, days),
        {
          stroke: t.text,
          grid: { stroke: t.grid, width: 0.5 },
          ticks: { stroke: t.grid, width: 0.5 },
          values: (u, splits) => splits.map(v => Math.round(v)),
        },
      ],
      series: [
        {},
        {
          label: 'AQI',
          stroke: 'transparent',
          width: 0,
          points: { show: false },
          paths: uPlot.paths.bars({
            size: [barFactor, 60, 1],
            align: 0,
            disp: {
              fill: { unit: 3, values: () => fills },
              stroke: { unit: 3, values: () => fills },
            },
          }),
          value: (u, v, sIdx, pIdx) => {
            if (v == null) return '—';
            const d = days[pIdx] || {};
            const cat = aqiCategory(v).name;
            return Math.round(v) + '  (min ' + (d.aqi_min ?? '—') + ' / max ' + (d.aqi_max ?? '—') + ') · ' + cat;
          },
        },
      ],
      plugins: [tip],
    };

    charts.aqi = new uPlot(opts, [xs, means], el);
  }

  function renderCharts(cityId) {
    if (typeof uPlot === 'undefined') return;

    if (activeRange === '24h') {
      const hourly = hourlyCache.get(cityId);
      const points = (hourly && Array.isArray(hourly.points_24h)) ? hourly.points_24h : [];
      renderLineChart('aqi',  'iw-chart-aqi',      'AQI',      '#75A8D9',
        v => Math.round(v),                points, 'aqi');
      renderLineChart('temp', 'iw-chart-temp',     'Temp',     '#E8A87C',
        v => v.toFixed(1) + '°',           points, 'temp');
      renderLineChart('humidity', 'iw-chart-humidity', 'Humidity', '#7CC4A1',
        v => Math.round(v) + '%',          points, 'humidity');
      return;
    }

    const daily = dailyCache.get(cityId);
    const days = daySliceForRange(daily, activeRange);

    renderAqiBarChart('iw-chart-aqi', days);

    renderBandChart('temp', 'iw-chart-temp', 'Temp °C',
      '#E8A87C', 'rgba(232, 168, 124, 0.32)',
      v => v.toFixed(1) + '°',
      days, 'temp_min', 'temp_max', 'temp_mean');

    renderBandChart('humidity', 'iw-chart-humidity', 'Humidity %',
      '#7CC4A1', 'rgba(124, 196, 161, 0.32)',
      v => Math.round(v) + '%',
      days, 'humidity_min', 'humidity_max', 'humidity_mean');
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
    let lastErr = null;
    for (const base of DATA_URLS) {
      const url = forceFresh ? base + '?t=' + Date.now() : base;
      try {
        const r = await fetch(url, forceFresh ? { cache: 'no-store' } : {});
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        render(data);
        if (map) setStatus(null);
        return;
      } catch (err) {
        lastErr = err;
        console.warn('Data fetch failed for', base, err);
      }
    }
    console.error('All data sources failed', lastErr);
    setStatus('Could not load weather data. Try reloading the page.', true);
  }

  // Custom Mapbox control: a single button that flies the camera back to
  // HOME_VIEW. Sits in the top-right stack just below the +/- zoom controls.
  class ResetViewControl {
    constructor(view) { this._view = view; }
    onAdd(map) {
      this._map = map;
      this._container = document.createElement('div');
      this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group iw-reset-ctrl';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'iw-reset-btn';
      btn.title = 'Reset view';
      btn.setAttribute('aria-label', 'Reset map view');
      btn.innerHTML =
        '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">'
        + '<circle cx="10" cy="10" r="2.2" fill="currentColor"/>'
        + '<path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" '
        +   'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
        + '<circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="1.4" fill="none"/>'
        + '</svg>';
      btn.addEventListener('click', () => {
        // Close any open marker popups so the overview isn't obscured.
        cityState.forEach(entry => {
          if (entry.popup && entry.popup.isOpen()) entry.popup.remove();
        });
        map.flyTo({ center: this._view.center, zoom: this._view.zoom, speed: 1.4 });
      });
      this._container.appendChild(btn);
      return this._container;
    }
    onRemove() {
      if (this._container && this._container.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }
      this._map = null;
    }
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
      // Camera is pinned to India. maxBounds tracks the country's actual
      // bbox (~68-97.5 E, ~6-37.5 N) with a tiny pad so coastlines aren't
      // clipped, and minZoom matches the initial zoom so the user can never
      // scroll out to see neighbouring countries or the open ocean.
      map = new mapboxgl.Map({
        container: 'iw-map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: HOME_VIEW.center,
        zoom: HOME_VIEW.zoom,
        minZoom: HOME_VIEW.zoom,
        maxBounds: [[67, 5.5], [98, 37.5]],
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new ResetViewControl(HOME_VIEW), 'top-right');
      map.on('load', () => {
        setStatus(null);
        if (lastData) ensureMarkers(lastData);
      });
      map.on('move', scheduleRelayout);
      map.on('zoom', scheduleRelayout);
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
    if (elHistoryCity) {
      elHistoryCity.addEventListener('change', () => {
        selectHistoryCity(elHistoryCity.value);
      });
    }
    elRangeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        elRangeBtns.forEach(b => b.classList.toggle('iw-active', b === btn));
        activeRange = btn.dataset.range;
        if (activeHistoryCity) loadAndRenderHistory(activeHistoryCity);
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
