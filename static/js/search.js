// Search page (search/index.qmd only). Everything runs in the browser and nothing the visitor types leaves the page: the only requests are the site's own files, search-index.json at once and, after the first use of the search box, the meaning files. Words and settings are in the page's JSON block; the page data comes from the two listings in search/index.qmd, the text from search-index.json, the keyword ranking from search-rank.js, and the meaning vectors from search-embed.js and the files that scripts/build-search-vectors.mjs and scripts/make-search-table.mjs write.
import { INDEX_VERSION, analyzeQuery, createIndex, matchRanges, pageKey, rankHybrid, rankTerms } from './search-rank.js';
import { VECTORS_VERSION, base64ToBytes, createEmbedder, dequantizeRows, parseVocab } from './search-embed.js';

(function () {
  var app = document.querySelector('.search-app');
  if (!app) return;

  // The markup hides the controls, so with JavaScript off only the note shows
  app.querySelector('.search-live').hidden = false;

  var copy = JSON.parse(app.querySelector('.search-copy').textContent);
  var input = app.querySelector('.search-input');
  var clear = app.querySelector('.search-clear');
  var mode = app.querySelector('.search-mode');
  var filterBox = app.querySelector('.search-filters');
  var topicsBox = app.querySelector('.search-topics');
  var topicList = app.querySelector('.search-topic-list');
  var heading = app.querySelector('.search-heading');
  var countEl = app.querySelector('.search-count');
  var rows = app.querySelector('.search-rows');
  var more = app.querySelector('.search-more');
  var state = { section: copy.all, topic: '', expanded: false };

  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Quarto passes titles and descriptions through Markdown, so they can carry entities.
  function plain(value) {
    return new DOMParser().parseFromString(value || '', 'text/html').body.textContent || '';
  }

  // Page data: the listings give every page's metadata and the index adds its text later.
  var pages = [];
  var byKey = {};
  Array.prototype.forEach.call(document.querySelectorAll('script.search-records'), function (script) {
    JSON.parse(script.textContent).forEach(function (record) {
      var page = {
        order: pages.length,
        title: plain(record.title),
        href: record.href,
        section: record.section,
        date: record.date || '',
        categories: record.categories || [],
        read: record.read || '',
        description: plain(record.description)
      };
      pages.push(page);
      byKey[pageKey(page.href)] = page;
    });
  });
  var posts = pages.filter(function (page) { return page.date; });

  // Until search-index.json arrives, and if it cannot be read, pages are matched on their titles and descriptions
  function titlesOnly() {
    return { v: INDEX_VERSION, pages: pages.map(function (page) { return { h: pageKey(page.href), t: page.title, d: page.description, p: [] }; }) };
  }
  var ranker = createIndex(titlesOnly(), { stopWords: copy.stopWords });
  // Set once the meaning files have loaded and match the index: { embedder, vectors }
  var meaning = null;

  // One row per page, best first. Each row links to the section of its best passage and shows that passage. meaningOnly marks a row with no keyword match, which only the meaning ranking found.
  function rankPages(analysis, query) {
    var items = [];
    var ranked = meaning ? rankHybrid(ranker, meaning.vectors, analysis, meaning.embedder.embed(query)) : rankTerms(ranker, analysis);
    ranked.forEach(function (row) {
      var page = byKey[row.page.key];
      if (!page) return;
      var text = (row.doc.text || page.description).replace(/\s+/g, ' ');
      items.push({
        page: page,
        meaningOnly: Boolean(row.ranks) && row.ranks[0] === undefined,
        href: row.doc.anchor ? page.href.split('#')[0] + '#' + row.doc.anchor : page.href,
        text: text,
        ranges: matchRanges(ranker, analysis, text),
        titleRanges: matchRanges(ranker, analysis, page.title)
      });
    });
    return items;
  }

  // Escapes the text and wraps each matched word in <mark>. Only ranges inside [from, to) are marked.
  function highlight(text, ranges, from, to) {
    var out = '';
    var at = from;
    ranges.forEach(function (range) {
      if (range[0] < from || range[1] > to) return;
      out += esc(text.slice(at, range[0])) + '<mark>' + esc(text.slice(range[0], range[1])) + '</mark>';
      at = range[1];
    });
    return out + esc(text.slice(at, to));
  }

  // About 170 characters of the passage, cut at word edges, starting a little before the first match.
  function snippet(item) {
    var text = item.text;
    var first = item.ranges.length ? item.ranges[0][0] : 0;
    var start = first > 60 ? text.lastIndexOf(' ', first - 60) + 1 : 0;
    var end = start + 170;
    if (end < text.length) {
      var space = text.lastIndexOf(' ', end);
      end = space > start ? space : end;
    } else end = text.length;
    return (start ? '… ' : '') + highlight(text, item.ranges, start, end) + (end < text.length ? ' …' : '');
  }

  // The same markup as _templates/post-rows.ejs. A page that is not a post has its section where the date goes and no reading time.
  function rowHtml(item) {
    var page = item.page;
    var date = page.date ? '<time class="post-date">' + esc(page.date) + '</time>' : '<span class="post-date">' + esc(page.section) + '</span>';
    var category = page.categories.length ? '<span class="post-cat">' + esc(page.categories.join(', ')) + '</span>' : '';
    var read = page.read ? '<span class="post-read">' + esc(page.read) + '</span>' : '';
    var detail = item.detail ? '<p class="post-desc">' + item.detail + '</p>' : '';
    var title = item.titleRanges ? highlight(page.title, item.titleRanges, 0, page.title.length) : esc(page.title);
    return '<li class="post-row' + (page.date ? '' : ' is-page') + '" data-page="' + page.order + '">' + date +
      '<div class="post-main"><h3 class="post-title no-anchor"><a href="' + esc(copy.root + (item.href || page.href)) + '" class="title-link no-arrow no-external">' + title + '</a></h3>' + detail + '</div>' +
      category + read + '</li>';
  }

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (_, key) { return values[key]; });
  }

  function choice(label, onClick) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-choice';
    var name = document.createElement('span');
    name.textContent = label;
    var number = document.createElement('span');
    number.className = 'search-choice-count';
    button.append(name, number);
    button.addEventListener('click', onClick);
    return button;
  }

  function setSection(name) {
    state.section = name;
    state.topic = '';
    state.expanded = false;
    update();
  }

  function setTopic(name) {
    state.topic = state.topic === name ? '' : name;
    state.section = copy.all;
    state.expanded = false;
    input.value = '';
    update();
  }

  // The name and the number are two spans, which a screen reader would run together, so each button gets one spoken name
  function describe(button, name, number, one, many) {
    button.setAttribute('aria-label', fill(number === 1 ? one : many, { name: name, count: number }));
  }

  var filters = [copy.all].concat(copy.sections).map(function (name) {
    var button = choice(name, function () { setSection(name); });
    button.dataset.name = name;
    filterBox.append(button);
    return button;
  });

  var categories = {};
  posts.forEach(function (page) {
    page.categories.forEach(function (name) { categories[name] = (categories[name] || 0) + 1; });
  });
  var topics = Object.keys(categories).sort(function (a, b) { return a.localeCompare(b); }).map(function (name) {
    var button = choice(name, function () { setTopic(name); });
    button.dataset.name = name;
    button.lastChild.textContent = categories[name];
    describe(button, name, categories[name], copy.topicLabelOne, copy.topicLabel);
    topicList.append(button);
    return button;
  });

  function setPressed(button, on) {
    button.setAttribute('aria-pressed', String(on));
    button.classList.toggle('is-active', on);
  }

  function update() {
    var query = input.value;
    var analysis = analyzeQuery(ranker, query);
    var searching = analysis.terms.length > 0;
    var everything = pages.map(function (page) { return { page: page }; });
    var base = searching ? rankPages(analysis, query) : everything;
    // No keyword matched, so the rows are the pages closest by meaning
    var nearest = searching && base.length > 0 && base.every(function (item) { return item.meaningOnly; });

    // Without a query the filters count every page, so any section can be picked from a topic
    var counts = {};
    base.forEach(function (item) { counts[item.page.section] = (counts[item.page.section] || 0) + 1; });
    counts[copy.all] = base.length;
    if (state.section !== copy.all && !counts[state.section]) state.section = copy.all;

    var latest = !searching && !state.topic && state.section === copy.all;
    var shown = state.section === copy.all ? base : base.filter(function (item) { return item.page.section === state.section; });
    if (latest) shown = everything.filter(function (item) { return item.page.date; }).slice(0, copy.latestCount);
    else if (state.topic) shown = shown.filter(function (item) { return item.page.categories.indexOf(state.topic) !== -1; });

    // A search lists its best rows first; the filter counts and the count line below always count every match
    var total = shown.length;
    var limited = searching && !state.expanded && total > copy.bestCount;
    if (limited) shown = shown.slice(0, copy.bestCount);

    filters.forEach(function (button) {
      var name = button.dataset.name;
      var number = counts[name] || 0;
      button.lastChild.textContent = number;
      describe(button, name, number, copy.choiceLabelOne, copy.choiceLabel);
      button.disabled = number === 0;
      setPressed(button, name === state.section);
    });
    topics.forEach(function (button) { setPressed(button, !searching && button.dataset.name === state.topic); });
    topicsBox.hidden = searching && base.length > 0;
    clear.hidden = query === '';

    shown.forEach(function (item) {
      if (searching) item.detail = snippet(item);
      else if (!latest) item.detail = esc(item.page.description);
    });
    drawRows(shown.map(rowHtml).join(''));

    var title = latest ? copy.latest : state.topic || (state.section !== copy.all ? state.section : '');
    setText(heading, searching ? '' : title);
    heading.hidden = searching || !title;
    if (latest) setText(countEl, '');
    else if (!total) setText(countEl, fill(copy.none, { query: query.trim() }));
    else if (nearest) setText(countEl, fill(total === 1 ? copy.nearestOne : copy.nearest, { query: query.trim(), count: total }));
    else if (limited) setText(countEl, fill(copy.countBest, { shown: shown.length, count: total }));
    else setText(countEl, total === 1 ? copy.countOne : fill(copy.count, { count: total }));

    // The control shows only when a search has more rows than the best few
    more.hidden = !(searching && total > copy.bestCount);
    setText(more, state.expanded ? fill(copy.showBest, { shown: copy.bestCount }) : fill(copy.showAll, { count: total }));
    more.setAttribute('aria-expanded', String(state.expanded));
  }

  // Writing the same text again would make a screen reader announce it again
  function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }

  // Rows are only redrawn when they changed, and a visitor who has moved into a result keeps their place: focus goes back to the same page's link if it is still listed.
  var drawn = '';
  function drawRows(html) {
    if (html === drawn) return;
    var row = rows.contains(document.activeElement) ? document.activeElement.closest('li') : null;
    var page = row ? row.getAttribute('data-page') : null;
    rows.innerHTML = html;
    drawn = html;
    var back = page === null ? null : rows.querySelector('li[data-page="' + page + '"] .post-title a');
    if (back) back.focus({ preventScroll: true });
  }

  function resultLinks() {
    return Array.prototype.slice.call(rows.querySelectorAll('.post-title a'));
  }

  function editable(target) {
    return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
  }

  input.addEventListener('input', function () {
    if (input.value !== '') state.topic = '';
    state.expanded = false;
    update();
  });

  more.addEventListener('click', function () {
    state.expanded = !state.expanded;
    update();
  });

  clear.addEventListener('click', function () {
    input.value = '';
    update();
    input.focus();
  });

  // / focuses the field, Escape clears it, Up and Down move through the results, and a key typed on a result goes back to the field.
  document.addEventListener('keydown', function (event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    var target = event.target;
    var links = resultLinks();
    var at = links.indexOf(target);
    if (event.key === '/' && !editable(target)) {
      event.preventDefault();
      input.focus();
    } else if (event.key === 'Escape') {
      if (input.value !== '') {
        input.value = '';
        update();
        input.focus();
      } else if (at !== -1) input.focus();
    } else if (event.key === 'ArrowDown' && (target === input || at !== -1)) {
      event.preventDefault();
      if (links[at + 1]) links[at + 1].focus();
    } else if (event.key === 'ArrowUp' && at !== -1) {
      event.preventDefault();
      if (at > 0) links[at - 1].focus();
      else input.focus();
    } else if (event.key.length === 1 && at !== -1) input.focus();
  });

  // Meaning search. The table, its vocabulary and the passage vectors are fetched in the background on the first keystroke, never before (the box is focused on a desktop, which is not use) and never on another page. Typing is not held up: keyword search answers until they are ready, and if anything fails or does not match the index, the page stays on keyword search with no message. A visitor who asked the browser to save data, or is on a 2g connection, stays on keyword search.
  var indexHash = '';
  var used = false;
  var started = false;

  function get(url, kind) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error(url + ' ' + response.status);
      return kind === 'json' ? response.json() : response.arrayBuffer();
    });
  }

  // The hash of the file as sent, so a stale or damaged copy in the browser cache is not used. crypto.subtle only exists on https and localhost; elsewhere the byte count is the only check.
  function checkHash(buffer, expected) {
    if (buffer.byteLength !== expected.bytes) return Promise.reject(new Error(expected.path + ' has ' + buffer.byteLength + ' bytes'));
    if (!window.crypto || !crypto.subtle) return Promise.resolve();
    return crypto.subtle.digest('SHA-256', buffer).then(function (digest) {
      var hex = Array.prototype.map.call(new Uint8Array(digest), function (byte) { return (byte < 16 ? '0' : '') + byte.toString(16); }).join('');
      if (hex !== expected.sha256) throw new Error(expected.path + ' does not match its hash');
    });
  }

  // The URLs carry the file's hash, so the browser's HTTP cache keeps a copy for as long as the file is unchanged and a changed file is fetched under a new URL.
  function loadMeaning() {
    var vectorsUrl = copy.vectorsUrl + '?v=' + indexHash;
    return get(vectorsUrl, 'json').then(function (file) {
      if (file.v !== VECTORS_VERSION || file.index !== indexHash || file.count !== ranker.docs.length) throw new Error('vectors do not belong to this index');
      var table = file.table;
      var vocab = file.vocab;
      if (table.bytes !== table.rows * file.dimensions) throw new Error('table size');
      return Promise.all([
        get(copy.root + table.path + '?v=' + table.sha256.slice(0, 12)),
        get(copy.root + vocab.path + '?v=' + vocab.sha256.slice(0, 12))
      ]).then(function (parts) {
        return Promise.all([checkHash(parts[0], table), checkHash(parts[1], vocab)]).then(function () {
          var embedder = createEmbedder({ vocab: parseVocab(new TextDecoder().decode(parts[1])), table: new Int8Array(parts[0]), dimensions: file.dimensions });
          var bytes = base64ToBytes(file.vectors);
          if (bytes.length !== file.count * file.dimensions) throw new Error('vector size');
          var rowsOfVectors = dequantizeRows(new Int8Array(bytes.buffer), file.dimensions, file.scale);
          return { embedder: embedder, vectors: { dimensions: file.dimensions, rows: rowsOfVectors } };
        });
      });
    });
  }

  function useMeaning() {
    if (started || !used || !indexHash) return;
    started = true;
    loadMeaning().then(function (loaded) {
      meaning = loaded;
      mode.textContent = copy.modeHybrid;
      update();
    }, function () {});
  }

  function slowConnection() {
    var connection = navigator.connection;
    return Boolean(connection && (connection.saveData || connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g'));
  }

  input.addEventListener('input', function () {
    if (slowConnection()) return;
    used = true;
    useMeaning();
  });

  // Phones keep the keyboard closed until the visitor taps the field, unless they came here with / from another page (static/js/site.js leaves the flag).
  var arrived = false;
  try {
    arrived = sessionStorage.getItem('search-focus') === '1';
    sessionStorage.removeItem('search-focus');
  } catch (error) { /* storage blocked */ }
  if (arrived || window.matchMedia('(min-width: 768px) and (pointer: fine)').matches) input.focus();

  update();
  fetch(copy.indexUrl)
    .then(function (response) {
      if (!response.ok) throw new Error(response.status);
      return response.json();
    })
    .then(function (data) {
      if (data.v !== INDEX_VERSION) throw new Error('index version ' + data.v);
      ranker = createIndex(data, { stopWords: copy.stopWords });
      indexHash = data.hash || '';
    })
    .catch(function () { mode.textContent = copy.modeFallback; })
    .then(function () {
      update();
      useMeaning();
    });
})();
