---
paths:
  - "_quarto.yml"
  - "*.qmd"
  - "blog/index.qmd"
  - "posts/_metadata.yml"
  - "styles.css"
  - "theme-dark.scss"
  - "static/design-tokens.css"
  - "static/css/**"
  - "static/fonts/**"
  - "static/js/**"
  - "_templates/**"
  - "_filters/**"
  - "_partials/**"
  - "scripts/place-article-end.mjs"
  - "scripts/preserve-feed-guids.mjs"
  - "scripts/legacy-feed-guids.json"
---

# Site styles, templates, filters and feeds

How the Quarto pages are put together. Standalone tools follow `tools-design.md` instead.

## Styles

- Quarto pages load, in this order from `_quarto.yml`: `static/fonts/fonts.css`, `static/design-tokens.css`, `styles.css`, `static/css/home.css`, `static/css/article.css`, `static/css/pages.css`. Every stylesheet loads on every page, so page rules are scoped by the page's `body-classes`:

  | body class | pages | stylesheet |
  |---|---|---|
  | `home`, `writing` | homepage, Writing index | `home.css` |
  | `article-page` | every post, set once in `posts/_metadata.yml` | `article.css` |
  | `pg` | Work, About, Publications, Tools catalog, weather page | `pages.css` |

- `styles.css` is the global base: type, links, navbar, footer, focus, search, code, and the shared `.ui-label`, `.sec-head`, `.btn-solid`, `.link-arrow`, `.title-link`, `.live-dot`, `.work-rows`, `.timeline` and `.contact` classes. The `.timeline` markup is shared: its type is in `styles.css`, the homepage Path lays it out as dotted columns in `home.css`, and the About experience as a compact list in `pages.css`.
- `static/design-tokens.css` is the single source for colors (code syntax colors included), font stacks, the type, spacing and radius scales, and component sizes. Add or change a value there and use it through `var()`; the site stylesheets hold no literal colors.
- `theme-dark.scss` is the Bootstrap compile-time theme. Sass color functions need literal values, so mirror a changed palette value or font stack in its `$tok-` block and derive any other Sass from that block; nothing syncs them automatically. It also turns off the Google Fonts import that the cosmo theme would add.
- Headings use `ui-serif` (Apple's New York in Safari) with the self-hosted Source Serif 4 as the fallback: a Latin subset variable WOFF2 with a weight axis from `@fontsource-variable/source-serif-4` 5.3.1, its `@font-face` rule in `static/fonts/fonts.css` and the license in `OFL.txt`. `_quarto.yml` preloads only that file. Body text uses the system sans stack and code the system mono stack, with no web font for either.
- Keep selectors at class level and avoid IDs. Use `!important` only where Quarto or Bootstrap leave no other way, with a comment naming what it overrides.

## Markup, templates and filters

- Navigation, the footer and the social links are defined once in `_quarto.yml`.
- `_templates/*.ejs` turn front matter lists and the post listings into markup and hold no copy. Quarto's EJS is lodash templating, where `<%=` prints raw text. Quarto does not render underscore files or folders.
- `_contact.qmd` is the Contact section that `index.qmd` and `about.qmd` include.
- `_filters/build-month.lua`, loaded from `index.qmd`, fills the empty `[]{.build-month}` span with the build month and year in UTC.
- Posts get their header from `_partials/title-block.html` and run `_filters/article.lua`, both wired in `posts/_metadata.yml`. The filter computes the reading time with Quarto's listing formula so the header matches the post rows, counts the sections, adds the phone contents list and appends the "All writing" link.
- Quarto adds references and footnotes after every filter has run, so the post-render step `scripts/place-article-end.mjs` moves the "All writing" link after them (`node --test scripts/place-article-end.test.mjs`). It does not run under `quarto preview`.
- `static/js/site.js` is the only site-wide script, loaded through `include-after-body`: it adds the skip link and honors reduced motion for Quarto's smooth scrolling. `static/js/tools-catalog.js` adds the catalog's filter box and Details buttons; without it every description stays visible.

## Feeds

- `index.qmd` and `blog/index.qmd` both generate RSS, and `aayushgarg.dev` is the canonical host for metadata, feed links and feed images.
- The post-render step `scripts/preserve-feed-guids.mjs` keeps the exact published GUIDs of existing articles, marked `isPermaLink="false"`, so subscribers did not see old posts as new after the hostname change. `scripts/legacy-feed-guids.json` holds the IDs verified in both live feeds before that change, plus older entries verified in the feeds published at commit `6122c37`. The list stays fixed; new posts get Quarto's canonical GUIDs. The script leaves links and content alone, honors Quarto's output directory and allows absent feeds in partial renders (`node --test scripts/preserve-feed-guids.test.mjs`).
- Post `permalink` values are historical and do not set rendered paths. Compare rendered links and feed items with `master` before changing the domain, routes or `site-url`.
