# Stage 2 costs

Measured on 2026-11-11 on one laptop: Apple M5 Pro, 15 cores, 24 GB, macOS (arm64), Node v24.22.0 with Transformers.js 4.3.2 and its onnxruntime-node (CPU). Not measured: a browser, a phone, a real network. Other work was running on the machine at times (other agents), so the timings are indicative. Each timing is one run unless a median is given; passages are embedded in batches of 8 in index order, with the page title, section heading and prose of each of the 459 passages.

## Download per model (bytes actually fetched from huggingface.co by Transformers.js in Node)

Sizes are the files the library saved to its cache, so they are what a browser would also request for the same dtype (the browser adds the runtime below). The int8 table rows for potion are the table written as one int8 array after the int8 step (and the PCA step), then compressed here with gzip level 9 and brotli quality 11; they are not files a model repository publishes, and the rows have to be shipped with the tokenizer.

| Model | Files | Total |
|---|---|---|
| all-MiniLM-L6-v2, q8 | config.json 650; onnx/model_quantized.onnx 22,972,370; tokenizer.json 711,661; tokenizer_config.json 366 | 23,685,047 bytes (23.7 MB) |
| mdbr-leaf-ir, q8 | config.json 829; onnx/model_quantized.onnx 220,597; onnx/model_quantized.onnx_data 22,954,752; tokenizer.json 711,661; tokenizer_config.json 1,529 | 23,889,368 bytes (23.9 MB) |
| arctic-embed-m-v1.5, q8 | config.json 772; onnx/model_quantized.onnx 110,145,162; tokenizer.json 711,649; tokenizer_config.json 1,381 | 110,858,964 bytes (110.9 MB) |
| EmbeddingGemma 2 text, q4 | config.json 5,031; onnx/model_q4.onnx 490,742; onnx/model_q4.onnx_data 174,028,800; tokenizer.json 32,170,510; tokenizer_config.json 1,599 | 206,696,682 bytes (206.7 MB) |
| potion-base-8M, fp32 table | config.json 202; model.safetensors 30,236,760; tokenizer.json 683,666; tokenizer_config.json 1,431 | 30,922,059 bytes (30.9 MB) |
| potion-retrieval-32M, fp32 table | config.json 202; model.safetensors 129,210,456; tokenizer.json 1,493,150; tokenizer_config.json 1,431 | 130,705,239 bytes (130.7 MB) |

Shipped static tables (int8, one byte per value) with the potion-base-8M tokenizer.json:

| Table | Raw bytes | Gzip level 9 | Brotli | With tokenizer.json, raw | With tokenizer.json, brotli |
|---|---|---|---|---|---|
| potion-base-8M, int8, 256 dims | 7,559,168 (7.6 MB) | 5,573,413 | 5,490,560 | 8,242,834 (8.2 MB) | 5,642,563 (5.6 MB) |
| potion-base-8M, int8, PCA 128 dims | 3,779,584 (3.8 MB) | 2,960,514 | 2,941,424 | 4,463,250 (4.5 MB) | 3,093,427 (3.1 MB) |
| potion-retrieval-32M, int8, PCA 128 dims | 8,075,648 (8.1 MB) | 6,137,426 | 6,077,682 | 9,568,798 (9.6 MB) | 6,420,113 (6.4 MB) |

## Runtime in the browser (from the research file, not measured here)

- Transformers.js `transformers.web.min.js`: 0.46 MB (108 KB with brotli from jsDelivr). The WebAssembly binary it loads by default, `ort-wasm-simd-threaded.asyncify.wasm`: 26.9 MB (4.70 MB with brotli). The three transformer rows (MiniLM, leaf-ir, arctic) need both; EmbeddingGemma 2 needs them too if run on WebAssembly.
- A static table needs no ONNX runtime: a tokenizer (Transformers.js `AutoTokenizer`, which still pulls the 0.46 MB library, or a small WordPiece implementation) and one typed array.
- GitHub Pages cannot enable cross-origin isolation, so WebAssembly runs on one thread. The one-thread rows below are the closest this run gets to that.

## Time to embed the passages and one query, in Node on the CPU

All 459 passages (the deploy would pay this), then one query at a time (a visitor's search), median over the 40 queries after a warm-up call. The first column uses the library's default thread count; the one-thread columns pin the ONNX runtime to a single thread, which is closer to the browser but is still Node, not WebAssembly. Query times of a millisecond or less on a laptop are not a prediction for a phone.

| Model | Load model | Passages, default threads | Passages, one thread | Query, default threads (median / worst) | Query, one thread (median / worst) |
|---|---|---|---|---|---|
| all-MiniLM-L6-v2, q8 | 60.5 ms | 3950 ms | 8087 ms | 0.804 / 1.49 ms | 0.693 / 1.48 ms |
| mdbr-leaf-ir, q8 | 74.5 ms | 3131 ms | 7543 ms | 0.754 / 1.30 ms | 1.09 / 1.68 ms |
| arctic-embed-m-v1.5, q8 | 135 ms | 13385 ms | 33971 ms | 2.75 / 4.43 ms | 5.01 / 8.10 ms |
| EmbeddingGemma 2 text, q4 | 20821 ms | 93498 ms | 305911 ms | 16.0 / 22.1 ms | 59.0 / 83.6 ms |
| potion-base-8M (any variant) | 27.6 ms | 74.4 ms | single threaded already | 0.009 / 0.022 ms | single threaded already |
| potion-retrieval-32M | 56.1 ms | 101 ms | single threaded already | 0.015 / 0.044 ms | single threaded already |

Passage lengths in word pieces (page title, heading and prose, as embedded):

| Model | Median | Longest | Input limit used | Passages over the limit (cut at the end) |
|---|---|---|---|---|
| minilm | 159 | 344 | 256 | 25 of 459 |
| leaf | 159 | 344 | 512 | 0 of 459 |
| arctic | 159 | 344 | 512 | 0 of 459 |
| gemma2 | 163 | 511 | 8192 | 0 of 459 |

## Size of the passage vectors

459 passages (506 if the 47 page descriptions are embedded too). float32 is 4 bytes a value, int8 is 1 byte plus one scale for the whole matrix. Arithmetic, not a measured download; the files embed.mjs wrote for the native dimension have these sizes exactly.

| Model | Dimensions | float32 | int8 | float32 with descriptions | int8 with descriptions |
|---|---|---|---|---|---|
| potion-base-8M | 256 | 470,016 (470 KB) | 117,504 (118 KB) | 518,144 | 129,536 |
| potion-base-8M | 128 | 235,008 (235 KB) | 58,752 (59 KB) | 259,072 | 64,768 |
| all-MiniLM-L6-v2 | 384 | 705,024 (705 KB) | 176,256 (176 KB) | 777,216 | 194,304 |
| mdbr-leaf-ir | 768 | 1,410,048 (1410 KB) | 352,512 (353 KB) | 1,554,432 | 388,608 |
| mdbr-leaf-ir | 256 | 470,016 (470 KB) | 117,504 (118 KB) | 518,144 | 129,536 |
| EmbeddingGemma 2 text | 768 | 1,410,048 (1410 KB) | 352,512 (353 KB) | 1,554,432 | 388,608 |
| EmbeddingGemma 2 text | 512 | 940,032 (940 KB) | 235,008 (235 KB) | 1,036,288 | 259,072 |
| EmbeddingGemma 2 text | 256 | 470,016 (470 KB) | 117,504 (118 KB) | 518,144 | 129,536 |
| EmbeddingGemma 2 text | 128 | 235,008 (235 KB) | 58,752 (59 KB) | 259,072 | 64,768 |
| arctic-embed-m-v1.5 (asymmetric passages) | 768 | 1,410,048 (1410 KB) | 352,512 (353 KB) | 1,554,432 | 388,608 |
| arctic-embed-m-v1.5 (asymmetric passages) | 256 | 470,016 (470 KB) | 117,504 (118 KB) | 518,144 | 129,536 |
| potion-retrieval-32M | 512 | 940,032 (940 KB) | 235,008 (235 KB) | 1,036,288 | 259,072 |
| potion-retrieval-32M | 128 | 235,008 (235 KB) | 58,752 (59 KB) | 259,072 | 64,768 |

For scale: the BM25 index is 346,530 bytes raw and 117,508 bytes gzipped (stage 1).

