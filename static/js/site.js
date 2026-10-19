// Site-wide behavior for every Quarto page. Loaded from include-after-body in _quarto.yml.
document.addEventListener('DOMContentLoaded', function () {
  // Skip link. It is added here rather than in the page source so it stays out of the search index and RSS content, and it goes first in the tab order.
  var skip = document.createElement('a');
  skip.className = 'skip-link';
  skip.href = '#quarto-document-content';
  skip.textContent = 'Skip to content';
  document.body.insertBefore(skip, document.body.firstChild);

  // Quarto's scripted smooth scrolling ignores CSS, so turn it off for visitors who ask for reduced motion.
  if (window.zenscroll && window.matchMedia('(prefers-reduced-motion: reduce)').matches) window.zenscroll.setup(0);

  // Articles only: reading progress and the rail offset. Both are written as CSS custom properties, so nothing here moves content.
  var head = document.querySelector('.article-head');
  var main = document.getElementById('quarto-document-content');
  if (head && main) {
    var root = document.documentElement;
    var bar = document.createElement('div');
    bar.className = 'read-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    // Choosing a section on a phone closes the contents list so the text is in view
    var disclosure = document.querySelector('.article-toc-mobile details');
    if (disclosure) disclosure.addEventListener('click', function (e) {
      if (e.target.closest('a')) disclosure.open = false;
    });

    var ticking = false;
    var update = function () {
      ticking = false;
      var top = main.getBoundingClientRect().top + window.scrollY;
      var span = main.offsetHeight - window.innerHeight;
      var progress = span > 0 ? (window.scrollY - top) / span : 0;
      root.style.setProperty('--read-progress', Math.min(1, Math.max(0, progress)).toFixed(4));
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });

    // The rail starts level with the first line of the body: its offset is the title block height plus the gap below it.
    var offset = function () {
      var first = head.nextElementSibling;
      while (first && !first.getClientRects().length) first = first.nextElementSibling;
      var grid = document.getElementById('quarto-content');
      var gap = first && grid ? first.getBoundingClientRect().top - grid.getBoundingClientRect().top : 0;
      root.style.setProperty('--rail-offset', Math.max(0, Math.round(gap)) + 'px');
      update();
    };
    offset();
    if (window.ResizeObserver) new ResizeObserver(offset).observe(head);
    window.addEventListener('resize', offset);
  }
});
