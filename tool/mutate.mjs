/**
 * Mutation harness. A passing test suite is not evidence until you have watched
 * it fail on a deliberately broken input.
 *
 * Each entry breaks exactly one real line and names the test that MUST catch it.
 * If the suite still passes, that test is decorative and the harness says so.
 * Entries marked `runner: 'ui'` break a screen and run the jest suite instead.
 */
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const ENGINE = 'src/engine/engine.ts';
const RNG = 'src/engine/rng.ts';
const GAME_UI = 'src/ui/Game.tsx';
const OUTCOME_UI = 'src/ui/OutcomeScreens.tsx';
const VOTE_UI = 'src/ui/VoteScreen.tsx';
const WORDLIST = 'src/engine/wordlist.ts';
const SETTINGS_UI = 'src/ui/SettingsScreen.tsx';
const APP = 'App.tsx';
const LEADERBOARD = 'src/engine/leaderboard.ts';
const SETUP = 'src/engine/setup.ts';
const LEADERBOARD_UI = 'src/ui/LeaderboardScreen.tsx';
const BALLOT_UI = 'src/ui/BallotScreens.tsx';
const LEAVE_UI = 'src/ui/LeaveSheet.tsx';
const TYPES = 'src/engine/types.ts';

// Both runners write the same report shape: testResults[].assertionResults[].
const REPORT = '/tmp/mut.json';
const RUNNERS = {
  engine: `npx vitest run src/engine --reporter=json --outputFile=${REPORT}`,
  ui: `npx jest --json --outputFile=${REPORT}`,
};

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
        if (s.noEliminationStreak >= 2) return s; //  a third empty round is refused
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
  {
    name: "show an eliminated player's word to the table",
    runner: 'ui',
    file: OUTCOME_UI,
    from: `        was {victim ? ROLE[victim.role] : '?'}`,
    to: `        was {victim ? \`\${ROLE[victim.role]} \${victim.word}\` : '?'}`,
    mustFail: 'GU8',
  },
  {
    name: 'reveal the civilian word after a wrong guess',
    runner: 'ui',
    file: OUTCOME_UI,
    from: `      <Body>That's not the word.</Body>`,
    to: `      <Body>That's not the word. It was {state.civilianWord}.</Body>`,
    mustFail: 'GU5',
  },
  {
    name: 'let a double-tap count the guess',
    runner: 'ui',
    file: OUTCOME_UI,
    from: `    if (Date.now() < armedAt.current) return; //   a double-tap is not a decision`,
    to: ``,
    mustFail: 'GU6',
  },
  {
    name: 'drop the dead zone between screens',
    runner: 'ui',
    file: GAME_UI,
    from: `      if (now - lastAt.current < deadZoneMs) return;`,
    to: ``,
    mustFail: 'GU7',
  },
  {
    name: 'offer players who are out in the vote',
    runner: 'ui',
    file: VOTE_UI,
    from: `  const candidates = alivePlayers(state).filter(`,
    to: `  const candidates = state.players.filter(`,
    mustFail: 'GU3',
  },
  {
    name: 'accept a pair whose two words are the same',
    file: WORDLIST,
    from: `    if (normalizeGuess(a) === normalizeGuess(b)) {`,
    to: `    if (false) {`,
    mustFail: 'L6',
  },
  {
    name: 'stop skipping recently played pairs',
    file: WORDLIST,
    from: `  let pool = pairs.filter((p) => !recent.some((r) => samePair(r, p)));`,
    to: `  let pool: WordPair[] = [...pairs];`,
    mustFail: 'B4',
  },
  {
    name: 'stop skipping recently played pairs (unit)',
    file: WORDLIST,
    from: `  let pool = pairs.filter((p) => !recent.some((r) => samePair(r, p)));`,
    to: `  let pool: WordPair[] = [...pairs];`,
    mustFail: 'L7',
  },
  {
    name: 'count the running total as this game\'s points',
    file: LEADERBOARD,
    from: `    const points = (s.scores[p.id] ?? 0) - (s.scoresAtStart[p.id] ?? 0);`,
    to: `    const points = s.scores[p.id] ?? 0;`,
    mustFail: 'P1',
  },
  {
    name: 'track players by exact spelling instead of by name',
    file: LEADERBOARD,
    from: `    const key = nameKey(r.name);`,
    to: `    const key = r.name;`,
    mustFail: 'P3',
  },
  {
    name: 'allow two players with one name',
    file: SETUP,
    from: `    if (seen.has(key)) return \`Two players are called “\${name}”.\`;`,
    to: ``,
    mustFail: 'N1',
  },
  {
    name: 'allow two players with one name (screen)',
    runner: 'ui',
    file: SETUP,
    from: `    if (seen.has(key)) return \`Two players are called “\${name}”.\`;`,
    to: ``,
    mustFail: 'SN3',
  },
  {
    name: 'report a finished game again on re-render',
    runner: 'ui',
    file: GAME_UI,
    from: `    if (state.phase === 'gameOver' && recorded.current !== state) {`,
    to: `    if (state.phase === 'gameOver') {`,
    mustFail: 'GU11',
  },
  {
    name: 'wipe the leaderboard on a double-tap',
    runner: 'ui',
    file: LEADERBOARD_UI,
    from: `    if (Date.now() < armedAt.current) return; //   a double-tap is not a decision`,
    to: ``,
    mustFail: 'LB3',
  },
  {
    name: 'never save the leaderboard',
    runner: 'ui',
    file: APP,
    from: `    if (board !== loadedBoard.current) saveLeaderboard(board);`,
    to: ``,
    mustFail: 'AP3',
  },
  {
    name: 'deal the default names instead of the typed ones',
    runner: 'ui',
    file: APP,
    from: `    setGame(newGame(counts, names, nextPair(), randomSeed(), settings));`,
    to: `    setGame(newGame(counts, NAMES.slice(0, counts.n), nextPair(), randomSeed(), settings));`,
    mustFail: 'AP2',
  },
  {
    name: 'show a word from the list in settings',
    runner: 'ui',
    file: SETTINGS_UI,
    from: `          {wordList ? wordList.name : 'Built-in words'}`,
    to: `          {wordList ? \`\${wordList.name} (\${wordList.pairs[0].civilianWord})\` : 'Built-in words'}`,
    mustFail: 'ST3',
  },
  {
    name: 'ignore the uploaded list and deal the built-in pair',
    runner: 'ui',
    file: APP,
    from: `  const pairs = wordList?.pairs ?? BUILT_IN_PAIRS;`,
    to: `  const pairs = BUILT_IN_PAIRS;`,
    mustFail: 'AW2',
  },
  {
    name: 'let the table skip the vote forever',
    file: ENGINE,
    from: `      if (!s.settings.allowAbstain || s.noEliminationStreak >= 2) return s;`,
    to: `      if (!s.settings.allowAbstain) return s;`,
    mustFail: 'T8',
  },
  {
    name: 'close an empty vote into a third empty round',
    file: ENGINE,
    from: `        if (s.noEliminationStreak >= 2) return s; //  a third empty round is refused`,
    to: ``,
    mustFail: 'T8',
  },
  {
    name: "leave the last voter's pick on the next ballot",
    runner: 'ui',
    file: BALLOT_UI,
    from: `    setOpen(false);
    setPicked(null);`,
    to: `    setOpen(false);`,
    mustFail: 'BS2',
  },
  {
    name: 'open the next ballot on a double-tap',
    runner: 'ui',
    file: BALLOT_UI,
    from: `            if (Date.now() - shownAt.current >= deadZoneMs) setOpen(true);`,
    to: `            setOpen(true);`,
    mustFail: 'BS6',
  },
  {
    name: 'offer everyone in a revote',
    runner: 'ui',
    file: BALLOT_UI,
    from: `      (state.tiedCandidateIds.length === 0 || state.tiedCandidateIds.includes(p.id)) &&`,
    to: `      true &&`,
    mustFail: 'BS3',
  },
  {
    name: 'keep offering "skip" after two empty rounds',
    runner: 'ui',
    file: BALLOT_UI,
    from: `  const canSkip = state.settings.allowAbstain && state.noEliminationStreak < 2;`,
    to: `  const canSkip = state.settings.allowAbstain;`,
    mustFail: 'BS5',
  },
  {
    name: 'remove a player on the first tap',
    runner: 'ui',
    file: LEAVE_UI,
    from: `      <CandidateList candidates={living} picked={picked} onPick={setPicked} testIDPrefix="leave" />`,
    to: `      <CandidateList candidates={living} picked={picked} onPick={(id) => id && onLeave(id)} testIDPrefix="leave" />`,
    mustFail: 'LS1',
  },
  {
    name: 'hide why a walkout game paid nobody',
    runner: 'ui',
    file: OUTCOME_UI,
    from: `  const walkout = lastOut?.eliminationCause === 'removed';`,
    to: `  const walkout = false;`,
    mustFail: 'LS3',
  },
  {
    name: 'ignore the voting choice from Settings',
    runner: 'ui',
    file: APP,
    from: `    setGame(newGame(counts, names, nextPair(), randomSeed(), settings));`,
    to: `    setGame(newGame(counts, names, nextPair(), randomSeed()));`,
    mustFail: 'AP6',
  },
  {
    name: 'let players vote for themselves by default',
    file: TYPES,
    from: `  allowSelfVote: false,`,
    to: `  allowSelfVote: true,`,
    mustFail: 'T6b',
  },
  {
    name: "list the voter on their own ballot",
    runner: 'ui',
    file: BALLOT_UI,
    from: `      (state.settings.allowSelfVote || p.id !== current.id),`,
    to: `      true,`,
    mustFail: 'BS7',
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
  rmSync(REPORT, { force: true }); // never read the previous mutation's report
  try {
    execSync(RUNNERS[m.runner ?? 'engine'], { stdio: 'pipe' });
  } catch {
    passed = false;
    try {
      const report = JSON.parse(readFileSync(REPORT, 'utf8'));
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
