// The four stage 3 candidates. Repositories are pinned to the commit read on 2026-11-12, so a run is repeatable and the browser cache keys do not drift.
// `dtype` is the Transformers.js quantization, which picks onnx/model_<dtype>.onnx. `repetitionPenalty` follows research/2026-11-11-answer-models.md: the similar site found a penalty of 1.15 stops loops but pushes the model away from the passages' words, and turns it off for Qwen3 and LFM2.5. No penalty is the default here for all four; feasibility.md says whether any looped.
export const MODELS = {
  qwen3: {
    label: 'Qwen3-0.6B',
    repo: 'onnx-community/Qwen3-0.6B-ONNX',
    revision: '58ca03a5e7b354b480b1a82b34bde8dc7b854cc0',
    dtype: 'q4f16',
    // Qwen3 chat template: thinking off prefills an empty <think> block
    chatTemplateArgs: { enable_thinking: false },
    repetitionPenalty: 1.0,
    backends: ['webgpu', 'wasm'],
  },
  granite: {
    label: 'Granite 4.0 350M',
    repo: 'onnx-community/granite-4.0-350m-ONNX-web',
    revision: '62fc8f345c8aed0e1a28f856dc7e79b4cdb55cae',
    dtype: 'q4f16',
    chatTemplateArgs: {},
    repetitionPenalty: 1.0,
    backends: ['webgpu', 'wasm'],
  },
  lfm: {
    label: 'LFM2.5-350M',
    repo: 'onnx-community/LFM2.5-350M-ONNX',
    revision: '7dd4999565b0342c381ba90a3d8fc467d6df19c4',
    dtype: 'q4f16',
    chatTemplateArgs: {},
    repetitionPenalty: 1.0,
    // q4f16, q4 and q8 all fail to load on WebAssembly: no CPU kernel for GatherBlockQuantized (the embedding table). Not tried: fp16 (725 MB).
    backends: ['webgpu'],
  },
  qwen35: {
    label: 'Qwen3.5-0.8B (text)',
    repo: 'onnx-community/Qwen3.5-0.8B-Text-ONNX',
    revision: '25cdf33f386b487a25f3d743e86442517bdb77ff',
    dtype: 'q4f16',
    // The template already skips thinking unless enable_thinking is true; say so anyway
    chatTemplateArgs: { enable_thinking: false },
    repetitionPenalty: 1.0,
    // q4f16, q4 and q8 all fail to load on WebAssembly: no CPU kernel for GatherBlockQuantized (the embedding table). Not tried: fp16 (1.5 GB).
    backends: ['webgpu'],
  },
};

export const BACKENDS = ['webgpu', 'wasm'];
