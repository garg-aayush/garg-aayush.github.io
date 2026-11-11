// The models of the stage 2 comparison. Ids, dtypes, prefixes and limits follow _devlog/local-search/research/2026-11-11-embedding-models.md.
export const MODELS = {
  minilm: {
    label: 'all-MiniLM-L6-v2, 8-bit', id: 'Xenova/all-MiniLM-L6-v2', dtype: 'q8', kind: 'pooled', pooling: 'mean', maxLength: 256, queryPrefix: '',
    expectedDim: 384,
  },
  leaf: {
    label: 'mdbr-leaf-ir, 8-bit', id: 'MongoDB/mdbr-leaf-ir', dtype: 'q8', kind: 'sentence_embedding', maxLength: 512, queryPrefix: 'Represent this sentence for searching relevant passages: ',
    expectedDim: 768, truncate: [256],
    // The card's own example (fp32): rows are queries, columns are documents
    card: { queries: ['What is machine learning?', 'How does neural network training work?'], docs: ['Machine learning is a subset of artificial intelligence that focuses on algorithms that can learn from data.', 'Neural networks are trained through backpropagation, adjusting weights to minimize prediction errors.'], expected: [[0.6857, 0.4598], [0.4238, 0.5723]] },
  },
  gemma2: {
    label: 'EmbeddingGemma 2 text, 4-bit', id: 'onnx-community/embeddinggemma-2-ONNX', dtype: 'q4', kind: 'sentence_embedding', textOnly: true, maxLength: 8192, queryPrefix: 'task: search result | query: ', docFormat: 'gemma',
    expectedDim: 768, truncate: [512, 256, 128],
    // The card's own example, whose scores it lists for q4 as 0.854 (Mars), 0.783 (Saturn), 0.752 (Jupiter), 0.684 (Venus)
    card: { queries: ['Which planet is known as the Red Planet?'], docs: ['Venus is often called Earth\'s twin because of its similar size and proximity.', 'Mars, known for its reddish appearance, is often referred to as the Red Planet.', 'Jupiter, the largest planet in our solar system, has a prominent red spot.', 'Saturn, famous for its rings, is sometimes mistaken for the Red Planet.'], expected: [[0.684, 0.854, 0.752, 0.783]] },
  },
  arctic: {
    label: 'snowflake-arctic-embed-m-v1.5, 8-bit', id: 'Snowflake/snowflake-arctic-embed-m-v1.5', dtype: 'q8', kind: 'sentence_embedding', maxLength: 512, queryPrefix: 'Represent this sentence for searching relevant passages: ',
    expectedDim: 768, truncate: [256],
  },
  potion8: { label: 'potion-base-8M', id: 'minishlab/potion-base-8M', kind: 'static', queryPrefix: '', expectedDim: 256 },
  potion32r: { label: 'potion-retrieval-32M', id: 'minishlab/potion-retrieval-32M', kind: 'static', queryPrefix: '', expectedDim: 512 },
};

// Sentence pairs for the sanity check: a query, a related text, an unrelated text. The related one must score higher.
export const SANITY = [
  ['how do I bake a loaf of bread', 'Mix flour, water, yeast and salt, let the dough rise, then bake it in a hot oven for forty minutes.', 'The central bank raised interest rates by a quarter of a point on Wednesday.'],
  ['why is my gpu out of memory', 'The CUDA out of memory error means the model and its activations need more VRAM than the card has.', 'The museum opens at nine and closes at five on weekdays.'],
  ['what is the capital of france', 'Paris is the capital and largest city of France.', 'Photosynthesis converts light into chemical energy in plants.'],
];
