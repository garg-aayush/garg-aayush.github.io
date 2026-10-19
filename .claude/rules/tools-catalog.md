---
paths:
  - "tools/**"
---

# Tools Catalog

Inventory of all browser-based tools. Check here before building a new tool to reuse existing CDN libraries and avoid duplicating functionality.

## Shared browser assets

All tools load `../static/design-tokens.css` for the common palette. The image converter, resizer, and cropper also load `common.css` before their specialized local styles. Other tools keep their existing layouts and controls. Syntax colors, search highlights, and diff colors remain local to their tools. `analytics.js` is shared by every tool. Quarto copies the static directory, standalone HTML files, `common.css`, and `analytics.js` explicitly through `_quarto.yml`; add any new shared asset there before relying on it in a standalone tool.

## Image Tools

| Tool | File | Description | Dependencies |
|------|------|-------------|--------------|
| Image Format Converter | `image-converter.html` | Convert between PNG, JPEG, and WebP with transparency handling | None |
| Image Resizer | `image-resizer.html` | Resize images by dimensions, aspect ratio, and percentage | None |
| Image Cropper | `image-cropper.html` | Interactive crop with draggable selection and aspect ratio presets | None |
| Binary Mask Creator | `image-mask-creator.html` | Paint binary black and white masks for AI inpainting and fill models | None |
| Image Adjust & Transform | `image-operations.html` | Flip, rotate, invert, grayscale, brightness, and contrast adjustments | None |
| SVG Viewer & Converter | `svg-viewer.html` | Preview SVGs, inspect metadata, export to raster formats | None |

## Viewer Tools

| Tool | File | Description | Dependencies |
|------|------|-------------|--------------|
| HTML Viewer | `html-viewer.html` | Paste HTML and see it rendered in a sandboxed frame | None |
| Markdown Viewer | `markdown-viewer.html` | Live markdown preview with syntax highlighting and latex math support | marked.js, highlight.js, KaTeX + auto-render |
| JSON Formatter & Viewer | `json-formatter.html` | Format, validate, collapsible tree view, and search | None |
| Diff Viewer | `diff-viewer.html` | Side-by-side and unified diff with word-level highlighting | jsdiff |
| LaTeX Math Preview | `latex-preview.html` | Live math latex rendering with a symbol palette and saved snippets | KaTeX |

## Data Tools

| Tool | File | Description | Dependencies |
|------|------|-------------|--------------|
| YAML ↔ JSON Converter | `yaml-json-converter.html` | Bidirectional conversion with validation and configurable indentation | js-yaml |
| Base64 Encoder/Decoder | `base64.html` | Encode/decode images and text with image preview | None |
| URL Encoder/Decoder | `url-encoder.html` | Percent encode and decode useful for API calls and debugging | None |

## CDN Libraries in Use

| Library | CDN URL | Used By |
|---------|---------|---------|
| marked.js | `cdn.jsdelivr.net/npm/marked@18.1.1/lib/marked.umd.min.js` | Markdown Viewer |
| highlight.js | `cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.12.0/highlight.min.js` | Markdown Viewer |
| KaTeX | `cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.js` | Markdown Viewer, LaTeX Math Preview |
| KaTeX auto-render | `cdn.jsdelivr.net/npm/katex@0.16.47/dist/contrib/auto-render.min.js` | Markdown Viewer |
| jsdiff | `cdn.jsdelivr.net/npm/diff@9.0.0/dist/diff.min.js` | Diff Viewer |
| js-yaml | `cdn.jsdelivr.net/npm/js-yaml@4.3.2/dist/js-yaml.min.js` | YAML ↔ JSON Converter |
