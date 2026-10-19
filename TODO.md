# TODO

Deferred work that is not blocking but worth picking up if the relevant area is touched again.

## Browser tools

### Snapshot the SVG export format before asynchronous rendering

The SVG viewer captures the encoding MIME type before rendering but reads the selected format again when naming the file inside the asynchronous `canvas.toBlob` callback. Changing the format while an export is pending can give encoded bytes a different extension. Capture the format and filename together before rendering, and cover delayed image loading and blob callbacks in a focused test. The shared download helper preserves the caller's filename and does not manage export state.

### Fix the phone overflow in the JSON formatter and Markdown viewer

Both tools overflow horizontally on a 390 px phone: the JSON formatter by 55 px and the Markdown viewer by 135 px. The same overflow is present on master. In each file the stacked layout at 768 px and below sets `.split-pane { grid-template-columns: 1fr; }`, and `1fr` means `minmax(auto, 1fr)`, so the track grows to the widest min-content of its panel instead of shrinking to the viewport. Changing that rule to `minmax(0, 1fr)` brings the JSON formatter back to 390 px (checked in the browser); the Markdown viewer has the same rule and should be checked after the change. This was left alone because standalone tools are out of scope for the redesign.

### Make the image converter quality slider track visible

`.quality-slider` in `tools/common.css` draws its 6 px track in `--bg-inset`, and the controls now sit on the lighter `--bg-card` surface, so the track is nearly invisible and only the thumb shows. Give the track a border or a lighter fill from the tokens. The resizer and cropper load the same stylesheet, so check them after the change.

### Raise the contrast of the JSON formatter search placeholder

The placeholder of the search box in `tools/json-formatter.html` is the Dim color, which is low contrast on the input background. Use the Muted color for it, since Dim is meant for decoration and metadata only.

## India Weather

### Bring back WAQI dominant-pollutant in the popup
Each city's marker popup used to show "Dominant: PM2.5 · 5 stations". The Cloudflare Worker dropped the per-city WAQI feed call (one extra subrequest per city, 20 total) to fit the free-tier 50-subrequest cap. The popup currently has no Dominant line.

Two ways to reinstate:
- Upgrade to Workers Paid ($5/mo, 1000-subrequest cap). Simplest; also unlocks headroom for adding more cities.
- Cache dominant pollutant in Cloudflare KV with a ~24h TTL — pollutants change slowly (PM2.5 dominates Indian cities most of the year, ozone in summer), so polling once a day is plenty. KV reads/writes cost subrequests too, but only one batched read per run instead of 20.

### Interpolate 1-2 missed-run gaps in the 24h WAQI series
The Cloudflare Worker fires reliably every 15 min, but a single failed run leaves a `null` slot in the rolling 24h history. The chart already handles nulls (line breaks), but linearly interpolating a single missed slot would look smoother and is honest at 15-min cadence (AQI doesn't move that fast).

Implementation sketch: a `fillShortGapsByTime(points, key, maxGapMs)` pass before `pointsToLine()` in `static/india-weather/india-weather.js`, with a 30-minute threshold. Anything longer stays a break.

## Site design

### Move the "All writing" end link below the footnotes

In posts with footnotes, the "All writing" end link renders before the footnotes, because `_filters/article.lua` appends it to the end of the body and Quarto adds the footnotes after the body. No published post has footnotes yet, so this only shows up once one is added. The link should come after the footnotes.
