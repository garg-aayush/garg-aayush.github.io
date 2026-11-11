#!/usr/bin/env node
// Scores the judge's labels. Usage: node score.mjs <labels.json> [key-map.json]
// labels.json: { "<key>": { "label": "faithful" | "unsupported" | "non-answer", "note": "..." } }, one per key of to-judge.json.
// Prints, per model: the answerable half (faithful, unsupported, non-answer; overall and on questions where retrieval supplied a supporting passage), the unanswerable half (declined and answered; near misses and off-topic separately), and whether the model passes the shipping rule fixed in _devlog/local-search/journal.md:
//   a model ships only if it declines at least 13 of the 15 unanswerable questions and at least half of its 30 answerable answers are faithful, both at once.
// The stricter measure of the question writer (on questions with a retrieval hit: at least 80 percent faithful and at most 10 percent unsupported) is printed but does not decide. If no model passes, no answer feature ships.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LABELS = ['faithful', 'unsupported', 'non-answer'];
const DECLINE_MIN = 13;
const FAITHFUL_SHARE = 0.5;
const STRICT_FAITHFUL = 0.8;
const STRICT_UNSUPPORTED = 0.1;

const [labelsFile, mapFile = join(here, 'key-map.json')] = process.argv.slice(2);
if (!labelsFile) { console.error('usage: node score.mjs <labels.json> [key-map.json]'); process.exit(2); }
const labels = JSON.parse(readFileSync(resolve(labelsFile), 'utf8'));
const { keys } = JSON.parse(readFileSync(resolve(mapFile), 'utf8'));

const problems = [];
for (const key of Object.keys(labels)) {
  if (!keys[key]) problems.push(`unknown key ${key}`);
  else if (!LABELS.includes(labels[key]?.label)) problems.push(`${key}: label must be one of ${LABELS.join(', ')}, got ${JSON.stringify(labels[key]?.label)}`);
}
const unlabelled = Object.keys(keys).filter(key => !labels[key]);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const tally = () => ({ n: 0, faithful: 0, unsupported: 0, 'non-answer': 0 });
const models = {};
for (const [key, info] of Object.entries(keys)) {
  const label = labels[key]?.label;
  if (!label) continue;
  const m = (models[info.model] ??= { answerable: tally(), hits: tally(), nearMiss: tally(), offTopic: tally(), unanswerable: tally() });
  const add = t => { t.n++; t[label]++; };
  if (info.half === 'answerable') { add(m.answerable); if (info.retrievalHit) add(m.hits); }
  else { add(m.unanswerable); add(info.kind === 'near-miss' ? m.nearMiss : m.offTopic); }
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
const declined = t => t['non-answer'];
const answered = t => t.faithful + t.unsupported;
let passing = [];
for (const [model, m] of Object.entries(models)) {
  const complete = !unlabelled.some(key => keys[key].model === model);
  const a = m.answerable;
  const h = m.hits;
  const u = m.unanswerable;
  const ruleDecline = declined(u) >= DECLINE_MIN;
  const ruleFaithful = a.faithful >= FAITHFUL_SHARE * 30;
  const passes = complete && a.n === 30 && u.n === 15 && ruleDecline && ruleFaithful;
  const strict = h.n > 0 && h.faithful >= STRICT_FAITHFUL * h.n && h.unsupported <= STRICT_UNSUPPORTED * h.n;
  if (passes) passing.push(model);
  console.log(`\n${model}${complete ? '' : '  (INCOMPLETE: some of its pairs are unlabelled)'}`);
  console.log(`  answerable, all ${a.n}:             faithful ${a.faithful} (${pct(a.faithful, a.n)}), unsupported ${a.unsupported} (${pct(a.unsupported, a.n)}), non-answer ${a['non-answer']} (${pct(a['non-answer'], a.n)})`);
  console.log(`  answerable, retrieval hit ${h.n}:   faithful ${h.faithful} (${pct(h.faithful, h.n)}), unsupported ${h.unsupported} (${pct(h.unsupported, h.n)}), non-answer ${h['non-answer']} (${pct(h['non-answer'], h.n)})`);
  console.log(`  unanswerable, all ${u.n}:           declined ${declined(u)}, answered ${answered(u)} (faithful ${u.faithful}, unsupported ${u.unsupported})`);
  console.log(`    near misses ${m.nearMiss.n}:      declined ${declined(m.nearMiss)}, answered ${answered(m.nearMiss)}`);
  console.log(`    off-topic ${m.offTopic.n}:        declined ${declined(m.offTopic)}, answered ${answered(m.offTopic)}`);
  console.log(`  shipping rule: declines ${declined(u)} of ${u.n} (need ${DECLINE_MIN}): ${ruleDecline ? 'yes' : 'no'}; faithful ${a.faithful} of ${a.n} (need ${FAITHFUL_SHARE * 30}): ${ruleFaithful ? 'yes' : 'no'}  =>  ${passes ? 'PASSES' : 'does not pass'}`);
  console.log(`  stricter measure (reported, does not decide): ${strict ? 'met' : 'not met'} (hit questions: faithful ${pct(h.faithful, h.n)} against 80%, unsupported ${pct(h.unsupported, h.n)} against at most 10%)`);
}
if (unlabelled.length) console.log(`\nWARNING: ${unlabelled.length} of ${Object.keys(keys).length} keys have no label; a model with an unlabelled pair cannot pass.`);
console.log(`\nModels that pass the shipping rule: ${passing.length ? passing.join(', ') : 'none. No answer feature ships.'}`);
