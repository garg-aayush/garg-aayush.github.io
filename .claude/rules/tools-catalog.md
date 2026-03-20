---
paths:
  - "tools/**"
---

# Tools Catalog

Inventory of all browser-based tools. Check here before building a new tool to reuse existing CDN libraries and avoid duplicating functionality.

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
| marked.js | `cdn.jsdelivr.net/npm/marked` | Markdown Viewer |
| highlight.js | `cdn.jsdelivr.net/npm/highlight.js@11` | Markdown Viewer |
| KaTeX | `cdn.jsdelivr.net/npm/katex@0.16` | Markdown Viewer, LaTeX Math Preview |
| KaTeX auto-render | `cdn.jsdelivr.net/npm/katex@0.16/dist/contrib/auto-render.min.js` | Markdown Viewer |
| jsdiff | `cdn.jsdelivr.net/npm/diff` | Diff Viewer |
| js-yaml | `cdn.jsdelivr.net/npm/js-yaml@4` | YAML ↔ JSON Converter |
