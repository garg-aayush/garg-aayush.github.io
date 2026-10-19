// Tools catalog behavior (tools/index.qmd only). Adds the filter box and a details toggle on each tool row. Without this script every description stays visible and the filter is absent.
document.addEventListener('DOMContentLoaded', function () {
  var items = Array.prototype.slice.call(document.querySelectorAll('.tool-item'));
  var noResults = document.getElementById('tools-no-results');

  items.forEach(function (item, index) {
    var desc = item.querySelector('.tool-desc');
    var head = item.querySelector('p');
    var link = item.querySelector('.tool-link');
    if (!desc || !head) return;

    desc.id = 'tool-desc-' + index;
    desc.hidden = true;

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tool-toggle';
    toggle.textContent = 'Details';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', desc.id);
    if (link) toggle.setAttribute('aria-label', 'Details: ' + link.textContent);
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      desc.hidden = open;
    });
    head.appendChild(toggle);
  });

  var slot = document.getElementById('tools-filter-slot');
  if (!slot) return;

  var input = document.createElement('input');
  input.type = 'search';
  input.className = 'tools-filter-input';
  input.autocomplete = 'off';
  input.placeholder = slot.getAttribute('data-placeholder') || '';
  input.setAttribute('aria-label', input.placeholder);
  slot.appendChild(input);

  // Name, tagline and description are searchable; the Details button label is not.
  function textOf(item) {
    return Array.prototype.map.call(item.querySelectorAll('.tool-link, .tool-tagline, .tool-desc'), function (el) {
      return el.textContent;
    }).join(' ').toLowerCase();
  }

  input.addEventListener('input', function () {
    var query = input.value.toLowerCase().trim();
    var total = 0;

    document.querySelectorAll('.tools-list').forEach(function (list) {
      var visible = 0;
      list.querySelectorAll('.tool-item').forEach(function (item) {
        var match = !query || textOf(item).indexOf(query) !== -1;
        item.hidden = !match;
        if (match) visible++;
      });
      list.hidden = visible === 0;
      var heading = list.previousElementSibling;
      if (heading && heading.tagName === 'H2') heading.hidden = visible === 0;
      total += visible;
    });

    if (noResults) noResults.hidden = !(total === 0 && query);
  });
});
