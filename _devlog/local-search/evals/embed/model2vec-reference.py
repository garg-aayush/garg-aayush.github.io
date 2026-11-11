# Reference output of Model2Vec itself for the cross-check of static/js/search-embed.js: the token ids and the embedding of each text in a JSON list.
# Usage: python -I model2vec-reference.py <model folder with config.json, model.safetensors, tokenizer.json> <texts.json> <out.json>
# Needs `pip install model2vec`, in a virtual environment outside the repo.
import json
import sys
from importlib.metadata import version

from model2vec import StaticModel

model_dir, texts_path, out_path = sys.argv[1:4]
texts = json.load(open(texts_path, encoding="utf8"))
model = StaticModel.from_pretrained(model_dir)
ids = model.tokenize(texts)
vectors = model.encode(texts, show_progress_bar=False)
json.dump(
    {
        "model2vec": version("model2vec"),
        "numpy": version("numpy"),
        "tokenizers": version("tokenizers"),
        "normalize": model.normalize,
        "maxLength": model.max_length,
        "medianTokenLength": model.median_token_length,
        "ids": ids,
        "vectors": [[float(x) for x in row] for row in vectors],
    },
    open(out_path, "w", encoding="utf8"),
)
print(f"{len(texts)} texts, dim {vectors.shape[1]}, model2vec {version('model2vec')}")
