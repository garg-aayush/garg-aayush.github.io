---
paths:
  - "tools/**"
---

# Tools Catalog

Inventory of all browser-based tools. Check here before building a new tool to reuse existing CDN libraries and avoid duplicating functionality.

## Image Tools

| Tool | File | Description | Dependencies |
|------|------|-------------|--------------|
| Image Format Converter | `image-converter.html` | Convert between PNG, JPEG, WebP with quality controls | None |
| Image Resizer | `image-resizer.html` | Resize by dimensions, percentage, or fit-within bounds | None |
| Image Cropper | `image-cropper.html` | Interactive crop with aspect ratio presets | None |
| Binary Mask Creator | `image-mask-creator.html` | Paint black-and-white masks for AI inpainting | None |
| Image Adjust & Transform | `image-operations.html` | Flip, rotate, invert, grayscale, brightness, contrast | None |
| SVG Viewer & Converter | `svg-viewer.html` | Preview SVGs, inspect metadata, export to raster formats | None |

## Viewer Tools

| Tool | File | Description | Dependencies |
|------|------|-------------|--------------|
| HTML Viewer | `html-viewer.html` | Paste HTML, see it rendered in a sandboxed iframe | None |
| Markdown Viewer | `markdown-viewer.html` | Live GFM preview with syntax highlighting and LaTeX math | marked.js, highlight.js, KaTeX + auto-render |
| JSON Formatter & Viewer | `json-formatter.html` | Format, validate, collapsible tree, search, copy | None |
| Diff Viewer | `diff-viewer.html` | Side-by-side and unified diff with word-level highlighting | jsdiff |
| LaTeX Math Preview | `latex-preview.html` | Live KaTeX rendering, symbol palette, saved snippets | KaTeX |

## Data Tools

| Tool | File | Description | Dependencies |
|------|------|-------------|--------------|
| YAML ↔ JSON Converter | `yaml-json-converter.html` | Bidirectional YAML/JSON conversion with validation | js-yaml |
| Base64 Encoder/Decoder | `base64.html` | Text encode/decode, file-to-base64 (drag-drop), base64-to-file with image preview | None |
| URL Encoder/Decoder | `url-encoder.html` | Percent-encode/decode with encodeURIComponent or encodeURI toggle | None |

## CDN Libraries in Use

| Library | CDN URL | Used By |
|---------|---------|---------|
| marked.js | `cdn.jsdelivr.net/npm/marked` | Markdown Viewer |
| highlight.js | `cdn.jsdelivr.net/npm/highlight.js@11` | Markdown Viewer |
| KaTeX | `cdn.jsdelivr.net/npm/katex@0.16` | Markdown Viewer, LaTeX Math Preview |
| KaTeX auto-render | `cdn.jsdelivr.net/npm/katex@0.16/dist/contrib/auto-render.min.js` | Markdown Viewer |
| jsdiff | `cdn.jsdelivr.net/npm/diff` | Diff Viewer |
| js-yaml | `cdn.jsdelivr.net/npm/js-yaml@4` | YAML ↔ JSON Converter |
