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
});
