# New post, edit and removal in a scratch copy of the project
Render: quarto 1.10.18, Node v24.22.0. The deploy runs the same `quarto render`; no npm install and no network fetch happens in the post-render steps.
Baseline render: index 759f6c5572dd74aa (47 pages, 506 passages); vectors for index 759f6c5572dd74aa, 506 vectors, table 3ac7c5ca94c4; vectors match index: true
check:site search guard on the baseline: passed (47 pages, 506 passages)

## 1. A new post is added and the site rendered
After adding the post: index b0367171c8ce5622 (48 pages, 508 passages); vectors for index b0367171c8ce5622, 508 vectors, table 3ac7c5ca94c4; vectors match index: true
The post is in search-index.json: yes, posts/2026-11-12-quokka-garden/index.html, 1 passage(s). Index hash changed: true. Passage count went from 506 to 508.
check:site search guard after adding: passed (48 pages, 508 passages)
Keyword query "quokkaberry": row 1 of 10; status "Keyword and meaning search".
Meaning-only query "how to stop my indoor greenery from dying when I am on vacation" (it shares no content word with the post): hybrid row 5 of 16; keyword search alone, with the vectors blocked: not listed (15 rows).

## 2. The post text is edited and the site rendered again
After the edit: index a5ed69ef4d4f3d45 (48 pages, 508 passages); vectors for index a5ed69ef4d4f3d45, 508 vectors, table 3ac7c5ca94c4; vectors match index: true
Index hash changed: true (b0367171c8ce5622 to a5ed69ef4d4f3d45). Vectors now belong to index a5ed69ef4d4f3d45; vectors file changed: true.
check:site search guard after the edit: passed (48 pages, 508 passages)
Old keyword "quokkaberry", keyword search alone: not listed (0 rows).
Old keyword "quokkaberry" with meaning on: row 1 of 10, because the post's title still says Quokka and meaning matches word pieces; the text shown is "A short test post about watering plants....", which is the page description; the old body text is gone from the page.
Old meaning query "how to stop my indoor greenery from dying when I am on vacation": not listed (16 rows); text shown none.
New keyword "pangolinesque": row 1 of 10. New meaning query "keeping track of what the family spends each month": row 5 of 13.

## 3. The post is removed and the site rendered again (an ordinary render, not --clean)
After the removal: index 759f6c5572dd74aa (47 pages, 506 passages); vectors for index 759f6c5572dd74aa, 506 vectors, table 3ac7c5ca94c4; vectors match index: true
The post is in search-index.json: no. Index hash back to the baseline: true. Vectors back to the baseline: true.
check:site search guard after the removal: passed (47 pages, 506 passages)
Keyword "pangolinesque": not listed (10 rows).

## 4. A page that is not a post
Page rendered but not added to the list in search/index.qmd: in the index: false. This is the one hand step.
After adding the entry to the list: index 2a59253da27d7f97 (48 pages, 508 passages); vectors for index 2a59253da27d7f97, 508 vectors, table 3ac7c5ca94c4; vectors match index: true
The page is in search-index.json: true.
check:site search guard after adding the entry: passed (48 pages, 508 passages)
Keyword "flibbertigibbet": row 1 of 10.
Entry listed but the page deleted: the render failed as it should: Error: Search index: listed pages are missing from the render: pages/e2e-page.html
