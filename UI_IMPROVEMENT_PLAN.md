# UI Improvement Plan

This document outlines all proposed UI changes for the personal website. Each change can be implemented, reviewed, and committed independently.

---

## Overview

### Current Issues
- Multiple conflicting CSS sources (`styles.css` vs unused `css/main.css`)
- Inconsistent page widths across different pages
- Missing typography scale and spacing system
- Blog posts missing code block, table, and blockquote styling
- Inconsistent card styling between blog list and publications
- Some legacy/template content still present

### Design Direction
- **Font Family**: IBM Plex Sans (body) + IBM Plex Serif (headings)
- **Color Palette**: Warm sand backgrounds, ocean blue links, coral accents
- **Style**: Clean, modern, professional with subtle shadows and rounded corners

---

## Phase 1: Foundation & Cleanup

### 1.1 Fix Content Issues (Non-CSS)
**Priority**: High  
**Effort**: Low  
**Files**: `bio.qmd`, `resume.qmd`

**Problem**: These files contain template/placeholder content from another person.

**Changes**:
- [ ] `bio.qmd`: Replace "Desh" content with your own speaker bio, or remove page
- [ ] `resume.qmd`: Update PDF link from `desh2608.github.io` to your own resume

---

### 1.2 Add Design Token System
**Priority**: High  
**Effort**: Medium  
**Files**: `styles.css`

**Problem**: No consistent spacing, typography, or color variables.

**Changes**:
Add comprehensive CSS variables to `:root`:

```css
:root {
  /* === TYPOGRAPHY === */
  --font-sans: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-serif: 'IBM Plex Serif', Georgia, 'Times New Roman', serif;
  --font-mono: 'IBM Plex Mono', 'JetBrains Mono', 'Monaco', 'Consolas', monospace;
  
  /* Font Sizes */
  --text-xs: 0.75rem;     /* 12px */
  --text-sm: 0.875rem;    /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg: 1.125rem;    /* 18px */
  --text-xl: 1.25rem;     /* 20px */
  --text-2xl: 1.5rem;     /* 24px */
  --text-3xl: 1.875rem;   /* 30px */
  --text-4xl: 2.25rem;    /* 36px */
  --text-5xl: 3rem;       /* 48px */
  
  /* Line Heights */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.7;
  
  /* === SPACING === */
  --space-1: 0.25rem;     /* 4px */
  --space-2: 0.5rem;      /* 8px */
  --space-3: 0.75rem;     /* 12px */
  --space-4: 1rem;        /* 16px */
  --space-5: 1.25rem;     /* 20px */
  --space-6: 1.5rem;      /* 24px */
  --space-8: 2rem;        /* 32px */
  --space-10: 2.5rem;     /* 40px */
  --space-12: 3rem;       /* 48px */
  --space-16: 4rem;       /* 64px */
  
  /* === LAYOUT === */
  --content-width: 750px;   /* For article content */
  --page-width: 1000px;     /* For wider pages */
  --max-width: 1200px;      /* Maximum container width */
  
  /* === COLORS (already defined, keeping for reference) === */
  --ink-900: #111827;
  --ink-700: #1f2937;
  --ink-500: #4b5563;
  --ink-400: #6b7280;
  --ink-300: #9ca3af;
  --sand-50: #faf7f2;
  --sand-100: #f3ede4;
  --sand-200: #efe5d6;
  --accent-600: #e76f51;
  --accent-700: #d75f41;
  --ocean-600: #3b82a0;
  --ocean-700: #2a6f97;
  --ocean-800: #22577a;
  
  /* === SHADOWS === */
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.05);
  --shadow-md: 0 4px 6px rgba(15, 23, 42, 0.07);
  --shadow-lg: 0 10px 15px rgba(15, 23, 42, 0.1);
  --shadow-soft: 0 20px 60px rgba(15, 23, 42, 0.12);
  --shadow-card: 0 12px 30px rgba(15, 23, 42, 0.08);
  
  /* === BORDERS === */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 20px;
  --radius-full: 9999px;
}
```

---

### 1.3 Standardize Container Widths
**Priority**: High  
**Effort**: Medium  
**Files**: `styles.css`

**Problem**: Different pages have different content widths, causing visual inconsistency.

**Changes**:
Add global container constraints:

```css
/* Consistent content container */
.content,
.quarto-container {
  max-width: var(--max-width);
  margin-left: auto;
  margin-right: auto;
}

/* Article content width (for readability) */
.column-body,
.column-page .content > *:not(.hero):not(.section-card):not(.timeline) {
  max-width: var(--content-width);
  margin-left: auto;
  margin-right: auto;
}

/* Full-width sections */
.hero,
.section-card,
.column-page {
  max-width: var(--page-width);
  margin-left: auto;
  margin-right: auto;
}
```

---

## Phase 2: Typography & Base Styles

### 2.1 Define Typography Scale
**Priority**: High  
**Effort**: Medium  
**Files**: `styles.css`

**Problem**: Heading sizes are inconsistent across pages.

**Changes**:
Replace current heading styles with a consistent scale:

```css
/* Base typography */
body {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--leading-relaxed);
  color: var(--ink-700);
}

/* Heading hierarchy */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-serif);
  color: var(--ink-900);
  line-height: var(--leading-tight);
  margin-top: var(--space-8);
  margin-bottom: var(--space-4);
}

h1 {
  font-size: var(--text-4xl);
  font-weight: 700;
}

h2 {
  font-size: var(--text-3xl);
  font-weight: 600;
}

h3 {
  font-size: var(--text-2xl);
  font-weight: 600;
}

h4 {
  font-size: var(--text-xl);
  font-weight: 600;
}

h5 {
  font-size: var(--text-lg);
  font-weight: 600;
}

h6 {
  font-size: var(--text-base);
  font-weight: 600;
}

/* Paragraphs */
p {
  margin-bottom: var(--space-4);
  line-height: var(--leading-relaxed);
}
```

---

### 2.2 Style Links Consistently
**Priority**: Medium  
**Effort**: Low  
**Files**: `styles.css`

**Problem**: Link styles vary across pages.

**Changes**:
```css
a {
  color: var(--ocean-700);
  text-decoration: none;
  transition: color 0.2s ease;
}

a:hover {
  color: var(--accent-600);
}

/* Links within prose content */
.content p a,
.content li a {
  text-decoration: underline;
  text-decoration-color: var(--ocean-600);
  text-underline-offset: 2px;
}

.content p a:hover,
.content li a:hover {
  text-decoration-color: var(--accent-600);
}
```

---

## Phase 3: Component Styling

### 3.1 Add Code Block Styling
**Priority**: High  
**Effort**: Medium  
**Files**: `styles.css`

**Problem**: Blog posts have unstyled code blocks.

**Changes**:
Port and adapt code block styling:

```css
/* Code blocks */
pre {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: 1.6;
  background: var(--sand-50);
  border: 1px solid var(--sand-200);
  border-left: 4px solid var(--ocean-700);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  margin: var(--space-6) 0;
  overflow-x: auto;
  box-shadow: var(--shadow-sm);
}

/* Inline code */
code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: var(--sand-100);
  padding: 0.15em 0.4em;
  border-radius: var(--radius-sm);
  color: var(--accent-700);
}

pre code {
  background: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
}
```

---

### 3.2 Add Table Styling
**Priority**: Medium  
**Effort**: Medium  
**Files**: `styles.css`

**Problem**: Tables in blog posts lack styling.

**Changes**:
```css
table {
  width: 100%;
  margin: var(--space-6) 0;
  border-collapse: collapse;
  font-size: var(--text-sm);
  box-shadow: var(--shadow-sm);
  border-radius: var(--radius-md);
  overflow: hidden;
}

th, td {
  padding: var(--space-3) var(--space-4);
  text-align: left;
  border-bottom: 1px solid var(--sand-200);
}

th {
  background: var(--ocean-700);
  color: white;
  font-weight: 600;
  text-transform: uppercase;
  font-size: var(--text-xs);
  letter-spacing: 0.05em;
}

tr:nth-child(even) {
  background: var(--sand-50);
}

tr:hover {
  background: var(--sand-100);
}
```

---

### 3.3 Add Blockquote Styling
**Priority**: Medium  
**Effort**: Low  
**Files**: `styles.css`

**Problem**: Blockquotes are unstyled in blog posts.

**Changes**:
```css
blockquote {
  margin: var(--space-6) 0;
  padding: var(--space-4) var(--space-6);
  border-left: 4px solid var(--accent-600);
  background: var(--sand-50);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  font-style: normal;
  color: var(--ink-700);
}

blockquote p {
  margin-bottom: 0;
}

blockquote p + p {
  margin-top: var(--space-4);
}
```

---

### 3.4 Unify Card Component Styling
**Priority**: High  
**Effort**: Medium  
**Files**: `styles.css`

**Problem**: Blog list cards and publication cards have slightly different styling.

**Changes**:
Create a unified `.card` component:

```css
/* Base card */
.card,
.blog-item,
.publication-item,
.section-card {
  background: #ffffff;
  border: 1px solid var(--sand-200);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  margin-bottom: var(--space-6);
  box-shadow: var(--shadow-card);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card:hover,
.blog-item:hover,
.publication-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-soft);
}

/* Card titles */
.blog-title a,
.pub-title {
  font-family: var(--font-serif);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--ink-900);
  line-height: var(--leading-tight);
  margin-bottom: var(--space-2);
  display: block;
}

/* Card meta (dates, authors) */
.blog-meta,
.pub-authors {
  font-size: var(--text-sm);
  color: var(--ink-500);
  margin-bottom: var(--space-2);
}

/* Card descriptions */
.blog-summary,
.pub-venue {
  font-size: var(--text-base);
  color: var(--ink-700);
  line-height: var(--leading-relaxed);
}
```

---

### 3.5 Style Tags/Categories
**Priority**: Low  
**Effort**: Low  
**Files**: `styles.css`

**Changes**:
```css
.blog-tags,
.quarto-categories {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.blog-tags a,
.quarto-category {
  font-size: var(--text-xs);
  font-weight: 500;
  padding: var(--space-1) var(--space-3);
  background: var(--sand-100);
  color: var(--ink-700);
  border-radius: var(--radius-full);
  text-decoration: none;
  transition: background 0.2s ease;
}

.blog-tags a:hover,
.quarto-category:hover {
  background: var(--sand-200);
  color: var(--ink-900);
}
```

---

## Phase 4: Page-Specific Refinements

### 4.1 Refine Home Page Hero
**Priority**: Medium  
**Effort**: Low  
**Files**: `styles.css`

**Changes**:
Adjust hero section for better proportions:

```css
.hero {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: var(--space-12);
  align-items: start;
  padding: var(--space-8) 0 var(--space-12);
  max-width: var(--page-width);
  margin: 0 auto;
}

@media (max-width: 768px) {
  .hero {
    grid-template-columns: 1fr;
    gap: var(--space-6);
  }
}
```

---

### 4.2 Improve Blog Post Layout
**Priority**: Medium  
**Effort**: Medium  
**Files**: `styles.css`, `posts/_metadata.yml`

**Changes**:
Ensure blog posts have consistent, readable width:

```css
/* Blog post content */
.quarto-post-content,
article.content {
  max-width: var(--content-width);
  margin: 0 auto;
}

/* Blog post title */
.quarto-title h1.title {
  font-size: var(--text-4xl);
  margin-bottom: var(--space-4);
}

/* Blog post meta */
.quarto-title-meta {
  font-size: var(--text-sm);
  color: var(--ink-500);
  margin-bottom: var(--space-8);
  padding-bottom: var(--space-6);
  border-bottom: 1px solid var(--sand-200);
}
```

---

### 4.3 Improve Publications Page
**Priority**: Medium  
**Effort**: Low  
**Files**: `styles.css`

**Changes**:
```css
.publications-container {
  max-width: var(--content-width);
  margin: 0 auto;
}

.pub-year-header {
  font-size: var(--text-2xl);
  color: var(--ink-900);
  border-bottom: 3px solid var(--accent-600);
  padding-bottom: var(--space-2);
  margin: var(--space-12) 0 var(--space-6);
}

.pub-year-header:first-of-type {
  margin-top: var(--space-6);
}
```

---

### 4.4 Improve Timeline Component
**Priority**: Low  
**Effort**: Low  
**Files**: `styles.css`

**Changes**:
Refine timeline styling to match overall design:

```css
.timeline {
  max-width: var(--content-width);
  margin: var(--space-8) auto;
  padding-left: 80px;
  position: relative;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 40px;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--accent-600), var(--ocean-700));
  border-radius: 2px;
}
```

---

## Phase 5: Cleanup

### 5.1 Remove Unused CSS Files
**Priority**: Low  
**Effort**: Low  
**Files**: `css/` directory

**Problem**: Multiple unused CSS files cluttering the repo.

**Changes**:
After consolidating styles, remove:
- [ ] `css/main.css` (if all needed styles are ported)
- [ ] `css/main-minimal.css` (unused)
- [ ] `css/main.css.old` (backup, not needed)

Keep:
- `css/autumn.css` (syntax highlighting - review if needed)
- `css/pygment_highlights.css` (syntax highlighting - review if needed)
- `css/bootstrap*.css` (may be referenced somewhere)

---

### 5.2 Audit and Clean _quarto.yml
**Priority**: Low  
**Effort**: Low  
**Files**: `_quarto.yml`

**Changes**:
- Review if all listed resources are needed
- Consider adding global format options for consistency

---

## Implementation Order

**Recommended sequence:**

1. **Phase 1.1** - Fix content issues (bio, resume) - Quick win
2. **Phase 1.2** - Add design tokens - Foundation for everything else
3. **Phase 1.3** - Standardize container widths - Fixes main complaint
4. **Phase 2.1** - Typography scale - Visual consistency
5. **Phase 3.1** - Code blocks - Essential for blog posts
6. **Phase 3.4** - Unify cards - Visual consistency
7. **Phase 3.2** - Tables - Blog post enhancement
8. **Phase 3.3** - Blockquotes - Blog post enhancement
9. **Phase 2.2** - Link styles - Polish
10. **Phase 4.x** - Page refinements - Polish
11. **Phase 5.x** - Cleanup - Maintenance

---

## Testing Checklist

After each change, verify on these pages:
- [ ] Home page (`/`)
- [ ] Blog listing (`/blog/`)
- [ ] Individual blog post (any post with code, tables, images)
- [ ] Publications page (`/publications.html`)
- [ ] About page (`/about.html`)
- [ ] Mobile responsiveness (test at 375px, 768px, 1024px widths)

---

## Notes

- All changes should be made to `styles.css` only
- Test locally with `quarto preview` before committing
- Each phase can be a separate commit for easy rollback
- Consider creating a branch for UI improvements

---

*Created: December 2024*
*Status: Planning*

