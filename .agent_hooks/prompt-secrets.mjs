import { scanText } from '../scripts/check-secrets.mjs';
import { block, nothing, readEvent } from './lib.mjs';

// UserPromptSubmit: refuse a prompt that carries a credential. Names the kinds only, never the value.
export function checkPrompt(prompt, env = process.env) {
  const kinds = [...new Set(scanText(prompt, env).map(hit => hit.kind))];
  if (!kinds.length) return null;
  return `Prompt blocked because it contains credential shaped content (${kinds.join(', ')}). Remove the value and rotate it if it is real.`;
}

async function main() {
  try {
    const event = await readEvent();
    if (typeof event.prompt !== 'string') throw new Error('hook input does not contain a prompt');
    const reason = checkPrompt(event.prompt);
    if (reason) block(reason);
    else nothing();
  } catch (error) {
    // Fail closed: a prompt that cannot be scanned is not let through.
    block(`Prompt secret scan could not complete: ${error.message}`);
  }
}

if (import.meta.main) await main();
