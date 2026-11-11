# HTTP cache between visits

Chromium with a persistent profile, two visits to /search/, a server sending Cache-Control: max-age=600 and an ETag. Requests the server saw for the three meaning files after the first focus of the box:

- Visit 1: 200 /search-vectors.json, 200 /static/search/potion-base-8M.int8.bin, 200 /static/search/potion-base-8M.vocab.txt
- Visit 2: none, all three served from the browser cache
