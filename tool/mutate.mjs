/**
 * Mutation harness. A passing test suite is not evidence until you have watched
 * it fail on a deliberately broken input.
 *
 * Each entry breaks exactly one real line and names the test that MUST catch it.
 * If the suite still passes, that test is decorative and the harness says so.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const ENGINE = 'src/engine/engine.ts';
const RNG = 'src/engine/rng.ts';

const MUTATIONS = [
  {
    name: 'swap the two ifs in checkWin',
    file: ENGINE,
    from: `  if (infiltratorsAlive(s) === 0) return 'civilians';\n  if (civiliansAlive(s) <= 1) return 'infiltrators';`,
    to: `  if (civiliansAlive(s) <= 1) return 'infiltrators';\n  if (infiltratorsAlive(s) === 0) return 'civilians';`,
    mustFail: 'W4',
  },
  {
    name: 'bias Fisher-Yates (i + 1 -> i)',
    file: RNG,
    from: 'const j = randInt(rng, i + 1);',
    to: 'const j = randInt(rng, i);',
    mustFail: 'D6',
  },
  {
    name: 'let Mr White speak first',
    file: ENGINE,
    from: `      s.settings.mrWhiteNeverFirst && living.some((p) => p.role !== 'mrwhite')`,
    to: `      false && living.some((p) => p.role !== 'mrwhite')`,
    mustFail: 'O2',
  },
  {
    name: 'give a removed Mr White a guess',
    file: ENGINE,
    from: `  if (victim && victim.role === 'mrwhite' && victim.eliminationCause === 'vote') {`,
    to: `  if (victim && victim.role === 'mrwhite') {`,
    mustFail: 'M4',
  },
  {
    name: 'drop the empty-tally transition (softlock)',
    file: ENGINE,
    from: `      if (top.length === 0) {
        const streak = s.noEliminationStreak + 1;
        return beginRound({
          ...s,
          round: s.round + 1,
          noEliminationStreak: streak,
        });
      }`,
    to: `      if (top.length === 0) {
        return s;
      }`,
    mustFail: 'T7',
  },
  {
    name: 'rebuild speaking order on removal instead of splicing',
    file: ENGINE,
    from: `        next = {
          ...next,
          speakingOrder: order,
          turnIndex: idx < next.turnIndex ? next.turnIndex - 1 : next.turnIndex,
        };`,
    to: `        next = {
          ...next,
          speakingOrder: order,
        };`,
    mustFail: 'O4',
  },
  {
    name: 'set the winner on override without writing the verdict back',
    file: ENGINE,
    from: `      const next = withPlayer(s, s.pendingEliminationId, {
        guess: { text: victim.guess.text, correct: action.correct },
      });`,
    to: `      const next = s;`,
    mustFail: 'M8',
  },
  {
    name: 'assert I10 globally instead of scoping it to resumed play',
    file: ENGINE,
    from: `  if (RESUMED_PLAY_PHASES.includes(s.phase)) {`,
    to: `  if (true) {`,
    mustFail: 'G2',
  },
  {
    name: 'award points when a player walks out',
    file: ENGINE,
    from: `      if (winner) return { ...next, phase: 'gameOver', winner };`,
    to: `      if (winner) return toGameOver(next, winner);`,
    mustFail: 'O5',
  },
  {
    name: 'drop the phase guard',
    file: ENGINE,
    from: `  if (action.type !== 'START' && !ACTION_PHASES[action.type].includes(s.phase)) return s;`,
    to: ``,
    mustFail: 'A1',
  },
  {
    name: 'drop the phase guard (the wide fuzz must see it too)',
    file: ENGINE,
    from: `  if (action.type !== 'START' && !ACTION_PHASES[action.type].includes(s.phase)) return s;`,
    to: ``,
    mustFail: 'G3',
  },
  {
    name: 'accept a vote for a player who is out',
    file: ENGINE,
    from: `  if (!p || !isAlive(p)) return false;`,
    to: `  if (!p) return false;`,
    mustFail: 'A2',
  },
  {
    name: 'let a revote pick anyone',
    file: ENGINE,
    from: `  return s.tiedCandidateIds.length === 0 || s.tiedCandidateIds.includes(id);`,
    to: `  return true;`,
    mustFail: 'A3',
  },
  {
    name: 'leave the turn pointing past the end after a walkout',
    file: ENGINE,
    from: `      if (next.phase === 'description' && next.turnIndex >= next.speakingOrder.length) {`,
    to: `      if (false) {`,
    mustFail: 'O6',
  },
  {
    name: 'leave the turn pointing past the end (the wide fuzz must see it too)',
    file: ENGINE,
    from: `      if (next.phase === 'description' && next.turnIndex >= next.speakingOrder.length) {`,
    to: `      if (false) {`,
    mustFail: 'G3',
  },
  {
    name: "keep a leaver's ballots",
    file: ENGINE,
    from: `            ([voter, candidate]) => voter !== action.playerId && candidate !== action.playerId,`,
    to: `            () => true,`,
    mustFail: 'O7',
  },
  {
    name: "keep a leaver's ballots (a departed Mr White gets a guess)",
    file: ENGINE,
    from: `            ([voter, candidate]) => voter !== action.playerId && candidate !== action.playerId,`,
    to: `            () => true,`,
    mustFail: 'M10',
  },
  {
    name: "keep a leaver's ballots (the wide fuzz must see it too)",
    file: ENGINE,
    from: `            ([voter, candidate]) => voter !== action.playerId && candidate !== action.playerId,`,
    to: `            () => true,`,
    mustFail: 'G3',
  },
];

const originals = new Map();
for (const f of new Set(MUTATIONS.map((m) => m.file))) {
  originals.set(f, readFileSync(f, 'utf8'));
}
const restore = () => {
  for (const [f, src] of originals) writeFileSync(f, src);
};

process.on('exit', restore);
process.on('SIGINT', () => process.exit(1));

let survived = 0;
console.log('Mutation testing — each row must make the named test go RED.\n');

for (const m of MUTATIONS) {
  const src = originals.get(m.file);
  if (!src.includes(m.from)) {
    console.log(`  ?? ${m.name}\n     PATTERN NOT FOUND in ${m.file} — mutation is stale`);
    survived++;
    continue;
  }
  writeFileSync(m.file, src.replace(m.from, m.to));

  let failedTests = '';
  let passed = true;
  try {
    execSync('npx vitest run src/engine --reporter=json --outputFile=/tmp/mut.json', {
      stdio: 'pipe',
    });
  } catch {
    passed = false;
    try {
      const report = JSON.parse(readFileSync('/tmp/mut.json', 'utf8'));
      failedTests = report.testResults
        .flatMap((f) => f.assertionResults ?? [])
        .filter((t) => t.status === 'failed')
        .map((t) => t.title)
        .join(' | ');
    } catch {
      failedTests = '(could not parse report)';
    }
  }
  restore();

  const caughtByRightTest = !passed && failedTests.includes(m.mustFail);
  if (caughtByRightTest) {
    console.log(`  ok  ${m.name}\n      -> caught by ${m.mustFail}`);
  } else if (!passed) {
    console.log(`  ~   ${m.name}\n      -> suite failed, but NOT via ${m.mustFail}: ${failedTests}`);
  } else {
    console.log(`  XX  ${m.name}\n      -> SURVIVED. ${m.mustFail} does not actually test this.`);
    survived++;
  }
}

console.log(
  survived === 0
    ? `\nAll ${MUTATIONS.length} mutations killed. The suite can fail.`
    : `\n${survived} mutation(s) survived — those tests prove nothing.`,
);
process.exit(survived === 0 ? 0 : 1);
