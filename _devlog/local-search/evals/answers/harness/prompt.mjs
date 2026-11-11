// The one prompt every model gets. Review and change it here only; run-answers.mjs records it in each output file.

// What the model says when the passages do not contain the answer. Written for a personal site, in the site's third person like the sentence on the similar site ("The blog does not seem to cover this.").
export const REFUSAL = 'This site does not seem to cover that.';

export const SYSTEM_PROMPT = `You answer questions about a personal website using only the numbered passages from it that the user gives you. Answer in at most two sentences, in plain words, using only facts stated in the passages. Do not add anything from your own knowledge. If the passages do not contain the answer, reply with exactly this sentence and nothing else: ${REFUSAL}`;

// The user turn: the passages first, then the question
export function userMessage(question, passages) {
  const blocks = passages.map((p, i) => `[${i + 1}] ${p.title}\n${p.text}`);
  return `Passages:\n\n${blocks.join('\n\n')}\n\nQuestion: ${question}`;
}

export function buildMessages(question, passages) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage(question, passages) },
  ];
}

// Decoding settings shared by all models. Greedy, so a run is repeatable.
export const GENERATION = {
  doSample: false,
  maxNewTokens: 100,
  // Stop as soon as the answer has this many complete sentences (the similar site does the same)
  maxSentences: 2,
};
