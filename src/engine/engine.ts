/**
 * The rules engine. Pure: (state, action) -> state. No React, no storage, no
 * network. Every game-deciding rule lives here so it can be tested by the
 * thousand without a simulator.
 */

import {
  DEFAULT_SETTINGS,
  RESUMED_PLAY_PHASES,
  factionOf,
  isAlive,
  type EliminationCause,
  type GameAction,
  type GameState,
  type Phase,
  type Player,
  type Role,
  type Settings,
  type SetupCounts,
  type TieRule,
  type Winner,
  type WordPair,
} from './types';
import { makeRng, pick, shuffle, type Rng } from './rng';
import { isValidSetup } from './setup';

// ---------------------------------------------------------------- counting

export const alivePlayers = (s: GameState): Player[] => s.players.filter(isAlive);

export const civiliansAlive = (s: GameState): number =>
  s.players.filter((p) => isAlive(p) && p.role === 'civilian').length;

export const infiltratorsAlive = (s: GameState): number =>
  s.players.filter((p) => isAlive(p) && p.role !== 'civilian').length;

// ---------------------------------------------------------------- win check

/**
 * ORDER IS LOAD-BEARING, not style.
 *
 * The state `civiliansAlive === 1 && infiltratorsAlive === 0` satisfies BOTH
 * written conditions. It happens whenever the elimination that removes the last
 * infiltrator leaves a single civilian standing. The civilians did in fact
 * eliminate everyone, so the zero-infiltrators test must come first. Swap these
 * two ifs and the game is awarded to a faction with no living members.
 * Test W4 covers this, and the mutation suite proves W4 can fail.
 */
export function checkWin(s: GameState): Winner | null {
  if (infiltratorsAlive(s) === 0) return 'civilians';
  if (civiliansAlive(s) <= 1) return 'infiltrators';
  return null;
}

// ---------------------------------------------------------------- scoring

/** Civilians +2 each. Undercover +10, Mr White +6. A correct guess: +6, guesser only. */
export function award(s: GameState): Record<string, number> {
  const scores = { ...s.scores };
  const add = (id: string, n: number) => {
    scores[id] = (scores[id] ?? 0) + n;
  };

  if (s.winner === 'mrWhiteGuess') {
    // Take the guesser from the pending elimination, not by searching for a
    // player flagged correct — a human override sets the winner and the flag
    // must not be the only place that link is recorded.
    const guesserId = s.pendingEliminationId;
    if (guesserId) add(guesserId, 6);
    return scores;
  }

  const eligible = s.players.filter((p) => {
    if (s.settings.scoreSurvivorsOnly && !isAlive(p)) return false;
    return factionOf(p.role) === s.winner;
  });

  for (const p of eligible) {
    if (p.role === 'civilian') add(p.id, 2);
    else if (p.role === 'undercover') add(p.id, 10);
    else add(p.id, 6);
  }
  return scores;
}

// ---------------------------------------------------------------- guess match

/** lowercase -> NFD -> strip diacritics -> strip punctuation -> collapse spaces. */
export function normalizeGuess(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Exact compare after normalising, plus author-supplied aliases. No fuzzy matching. */
export function guessMatches(text: string, civilianWord: string, aliases: string[] = []): boolean {
  const g = normalizeGuess(text);
  if (g.length === 0) return false;
  return [civilianWord, ...aliases].some((w) => normalizeGuess(w) === g);
}

// ---------------------------------------------------------------- speaking order

/** Seat order from the starter, wrapping, skipping everyone not alive. */
export function buildSpeakingOrder(players: Player[], starterId: string): string[] {
  const bySeat = players.slice().sort((a, b) => a.seat - b.seat);
  const startIdx = bySeat.findIndex((p) => p.id === starterId);
  const out: string[] = [];
  for (let i = 0; i < bySeat.length; i++) {
    const p = bySeat[(startIdx + i) % bySeat.length];
    if (isAlive(p)) out.push(p.id);
  }
  return out;
}

function chooseStarter(s: GameState, rng: Rng): string {
  const living = alivePlayers(s);
  if (s.round === 1 || s.settings.starterMode === 'randomEachRound') {
    // Mr White has no word — going first with nothing is unplayable, so by
    // default the opener is drawn from everyone else.
    const eligible =
      s.settings.mrWhiteNeverFirst && living.some((p) => p.role !== 'mrwhite')
        ? living.filter((p) => p.role !== 'mrwhite')
        : living;
    return pick(rng, eligible).id;
  }
  // Rotate clockwise to the next living player after the previous starter.
  const prev = s.speakingOrder[0];
  const bySeat = s.players.slice().sort((a, b) => a.seat - b.seat);
  const prevIdx = bySeat.findIndex((p) => p.id === prev);
  for (let i = 1; i <= bySeat.length; i++) {
    const p = bySeat[(prevIdx + i) % bySeat.length];
    if (isAlive(p)) return p.id;
  }
  return living[0].id;
}

// ---------------------------------------------------------------- dealing

export function dealRoles(counts: SetupCounts, rng: Rng): Role[] {
  const { n, u, w } = counts;
  const roles: Role[] = [
    ...Array<Role>(n - u - w).fill('civilian'),
    ...Array<Role>(u).fill('undercover'),
    ...Array<Role>(w).fill('mrwhite'),
  ];
  return shuffle(rng, roles);
}

function startGame(
  counts: SetupCounts,
  names: string[],
  pair: WordPair,
  seed: number,
  settings: Settings,
  scores: Record<string, number>,
  existingIds?: string[],
): GameState {
  if (!isValidSetup(counts, settings.allowNonMajorityCivilians)) {
    throw new Error(`invalid setup: ${JSON.stringify(counts)}`);
  }
  if (names.length !== counts.n) {
    throw new Error(`expected ${counts.n} names, got ${names.length}`);
  }
  if (pair.civilianWord === pair.undercoverWord) {
    throw new Error('word pair must contain two different words');
  }

  const rng = makeRng(seed);

  // Swap the pair 50/50. Without this, anyone who has seen Cat/Dog before knows
  // which side is the civilian one the moment they read their card.
  const swap = rng.next() < 0.5;
  const civilianWord = swap ? pair.undercoverWord : pair.civilianWord;
  const undercoverWord = swap ? pair.civilianWord : pair.undercoverWord;

  const roles = dealRoles(counts, rng);
  const players: Player[] = names.map((name, i) => ({
    id: existingIds?.[i] ?? `p${i}`,
    name,
    seat: i,
    role: roles[i],
    word:
      roles[i] === 'civilian' ? civilianWord : roles[i] === 'undercover' ? undercoverWord : null,
    status: 'alive',
    eliminatedRound: null,
    eliminationCause: null,
    eliminationOrder: null,
    guess: null,
  }));

  return {
    phase: 'deal',
    settings,
    players,
    pair,
    civilianWord,
    undercoverWord,
    round: 1,
    speakingOrder: [],
    turnIndex: 0,
    dealIndex: 0,
    ballots: {},
    tiedCandidateIds: [],
    revoteCount: 0,
    noEliminationStreak: 0,
    pendingEliminationId: null,
    nextEliminationOrder: 1,
    winner: null,
    scores,
    seed: rng.seed,
  };
}

export function newGame(
  counts: SetupCounts,
  names: string[],
  pair: WordPair,
  seed: number,
  settings: Settings = DEFAULT_SETTINGS,
): GameState {
  return startGame(counts, names, pair, seed, settings, {});
}

// ---------------------------------------------------------------- helpers

function withPlayer(s: GameState, id: string, patch: Partial<Player>): GameState {
  return { ...s, players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

/** Apply an elimination, then run the win check. Never called mid-pair. */
function applyElimination(s: GameState, id: string, cause: EliminationCause): GameState {
  let next = withPlayer(s, id, {
    status: cause === 'vote' ? 'eliminated' : 'left',
    eliminatedRound: s.round,
    eliminationCause: cause,
    eliminationOrder: s.nextEliminationOrder,
  });
  next = { ...next, nextEliminationOrder: s.nextEliminationOrder + 1 };
  return next;
}

function toGameOver(s: GameState, winner: Winner): GameState {
  const withWinner = { ...s, winner };
  return { ...withWinner, phase: 'gameOver', scores: award(withWinner) };
}

/** Advance out of an elimination: Mr White gets a guess, otherwise check the win. */
function afterElimination(s: GameState): GameState {
  const victim = s.players.find((p) => p.id === s.pendingEliminationId);
  if (victim && victim.role === 'mrwhite' && victim.eliminationCause === 'vote') {
    return { ...s, phase: 'mrWhiteGuess' };
  }
  const winner = checkWin(s);
  if (winner) return toGameOver(s, winner);
  return beginRound({ ...s, round: s.round + 1, pendingEliminationId: null });
}

function beginRound(s: GameState): GameState {
  const rng = makeRng(s.seed);
  const starter = chooseStarter(s, rng);
  return {
    ...s,
    seed: rng.seed,
    phase: 'starterAnnounce',
    speakingOrder: buildSpeakingOrder(s.players, starter),
    turnIndex: 0,
    ballots: {},
    tiedCandidateIds: [],
    revoteCount: 0,
  };
}

/** Plurality winner(s) of the current ballots. */
export function tallyBallots(s: GameState): { top: string[]; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  for (const candidateId of Object.values(s.ballots)) {
    counts[candidateId] = (counts[candidateId] ?? 0) + 1;
  }
  const values = Object.values(counts);
  if (values.length === 0) return { top: [], counts };
  const max = Math.max(...values);
  return { top: Object.keys(counts).filter((id) => counts[id] === max), counts };
}

/**
 * A vote may only land on a living player — and, during a revote, only on one
 * of the tied. Without this a stale tap could "eliminate" someone already out.
 */
function isEligibleCandidate(s: GameState, id: string): boolean {
  const p = s.players.find((x) => x.id === id);
  if (!p || !isAlive(p)) return false;
  return s.tiedCandidateIds.length === 0 || s.tiedCandidateIds.includes(id);
}

// ---------------------------------------------------------------- reducer

/**
 * The phases each action is legal in. Anything else is a no-op, so a stray tap
 * from a screen that is mid-transition cannot move the game. Before this, an
 * override fired after game over re-ran the award and paid Mr White twice.
 */
const ACTION_PHASES: Record<Exclude<GameAction['type'], 'START'>, readonly Phase[]> = {
  REVEAL_NEXT: ['deal'],
  DEAL_DONE: ['deal'],
  BEGIN_ROUND: ['starterAnnounce'],
  NEXT_SPEAKER: ['description'],
  OPEN_VOTE: ['description', 'discussion'],
  CAST_BALLOT: ['voteCast'],
  ABSTAIN: ['voteCast'],
  CLOSE_VOTING: ['voteCast'],
  TAP_ELIMINATE: ['votePick'],
  RESOLVE_TIE: ['voteTie'],
  CONTINUE: ['eliminationReveal', 'mrWhiteGuessResult'],
  SUBMIT_GUESS: ['mrWhiteGuess'],
  OVERRIDE_GUESS: ['mrWhiteGuessResult'],
  REMOVE_PLAYER: [
    'deal',
    'starterAnnounce',
    'description',
    'discussion',
    'votePick',
    'voteCast',
    'voteTie',
    'eliminationReveal',
    'mrWhiteGuess',
    'mrWhiteGuessResult',
  ],
  PLAY_AGAIN: ['gameOver'],
};

export function reduce(s: GameState, action: GameAction): GameState {
  if (action.type !== 'START' && !ACTION_PHASES[action.type].includes(s.phase)) return s;

  switch (action.type) {
    case 'START':
      return startGame(
        action.counts,
        action.names,
        action.pair,
        action.seed,
        s.settings,
        s.scores,
      );

    case 'REVEAL_NEXT':
      return { ...s, dealIndex: Math.min(s.dealIndex + 1, s.players.length) };

    case 'DEAL_DONE':
      return beginRound(s);

    case 'BEGIN_ROUND':
      return { ...s, phase: 'description' };

    case 'NEXT_SPEAKER': {
      const next = s.turnIndex + 1;
      if (next >= s.speakingOrder.length) return { ...s, phase: 'discussion' };
      return { ...s, turnIndex: next };
    }

    case 'OPEN_VOTE':
      return {
        ...s,
        phase: s.settings.votingMode === 'groupTap' ? 'votePick' : 'voteCast',
        ballots: {},
      };

    case 'CAST_BALLOT': {
      const voter = s.players.find((p) => p.id === action.voterId);
      if (!voter || !isAlive(voter) || !isEligibleCandidate(s, action.candidateId)) return s;
      if (!s.settings.allowSelfVote && action.voterId === action.candidateId) return s;
      return { ...s, ballots: { ...s.ballots, [action.voterId]: action.candidateId } };
    }

    case 'ABSTAIN': {
      if (!s.settings.allowAbstain) return s;
      const ballots = { ...s.ballots };
      delete ballots[action.voterId];
      return { ...s, ballots };
    }

    case 'TAP_ELIMINATE': {
      if (!isEligibleCandidate(s, action.candidateId)) return s;
      const next = applyElimination(s, action.candidateId, 'vote');
      return {
        ...next,
        phase: 'eliminationReveal',
        pendingEliminationId: action.candidateId,
        noEliminationStreak: 0,
      };
    }

    case 'CLOSE_VOTING': {
      const { top } = tallyBallots(s);

      // Every ballot abstained. Without this branch the phase never changes and
      // the screen deadlocks with no button — the softlock the gap review found.
      if (top.length === 0) {
        const streak = s.noEliminationStreak + 1;
        return beginRound({
          ...s,
          round: s.round + 1,
          noEliminationStreak: streak,
        });
      }

      if (top.length > 1) {
        return { ...s, phase: 'voteTie', tiedCandidateIds: top };
      }

      const victimId = top[0];
      const next = applyElimination(s, victimId, 'vote');
      return {
        ...next,
        phase: 'eliminationReveal',
        pendingEliminationId: victimId,
        noEliminationStreak: 0,
      };
    }

    case 'RESOLVE_TIE': {
      const rule: TieRule = action.rule;

      if (rule === 'revote') {
        // Two tied revotes in a row and the option is withdrawn, so the round
        // provably terminates rather than looping forever.
        if (s.revoteCount >= 2) return s;
        return {
          ...s,
          phase: s.settings.votingMode === 'groupTap' ? 'votePick' : 'voteCast',
          ballots: {},
          revoteCount: s.revoteCount + 1,
        };
      }

      if (rule === 'noElimination') {
        if (s.noEliminationStreak >= 2) return s;
        return beginRound({
          ...s,
          round: s.round + 1,
          noEliminationStreak: s.noEliminationStreak + 1,
        });
      }

      // random: announced to the table as random, never silent.
      const rng = makeRng(s.seed);
      const victimId = pick(rng, s.tiedCandidateIds);
      const next = applyElimination({ ...s, seed: rng.seed }, victimId, 'vote');
      return {
        ...next,
        phase: 'eliminationReveal',
        pendingEliminationId: victimId,
        noEliminationStreak: 0,
      };
    }

    case 'CONTINUE': {
      if (s.phase === 'eliminationReveal') return afterElimination(s);
      if (s.phase === 'mrWhiteGuessResult') {
        const winner = checkWin(s);
        if (winner) return toGameOver(s, winner);
        return beginRound({ ...s, round: s.round + 1, pendingEliminationId: null });
      }
      return s;
    }

    case 'SUBMIT_GUESS': {
      if (s.phase !== 'mrWhiteGuess' || !s.pendingEliminationId) return s;
      const correct = guessMatches(action.text, s.civilianWord, s.pair.aliases);
      const next = withPlayer(s, s.pendingEliminationId, {
        guess: { text: action.text, correct },
      });
      if (correct) return toGameOver({ ...next, phase: 'mrWhiteGuessResult' }, 'mrWhiteGuess');
      return { ...next, phase: 'mrWhiteGuessResult' };
    }

    case 'OVERRIDE_GUESS': {
      if (!s.pendingEliminationId) return s;
      const victim = s.players.find((p) => p.id === s.pendingEliminationId);
      if (!victim?.guess) return s;
      // Write the verdict back onto the player. If only the winner were set,
      // award() would later look for a player flagged correct and find none.
      const next = withPlayer(s, s.pendingEliminationId, {
        guess: { text: victim.guess.text, correct: action.correct },
      });
      if (action.correct) return toGameOver({ ...next, phase: 'mrWhiteGuessResult' }, 'mrWhiteGuess');
      return { ...next, phase: 'mrWhiteGuessResult', winner: null };
    }

    case 'REMOVE_PLAYER': {
      const target = s.players.find((p) => p.id === action.playerId);
      if (!target || !isAlive(target)) return s;

      let next = applyElimination(s, action.playerId, 'removed');

      // Splice the id out of the speaking order rather than rebuilding it —
      // rebuilding mid-round invalidates turnIndex, so players who already
      // spoke would speak again, or the round would end early.
      const idx = next.speakingOrder.indexOf(action.playerId);
      if (idx !== -1) {
        const order = next.speakingOrder.filter((id) => id !== action.playerId);
        next = {
          ...next,
          speakingOrder: order,
          turnIndex: idx < next.turnIndex ? next.turnIndex - 1 : next.turnIndex,
        };
      }

      // The speaker on turn was last in the order and walked out. Nobody is
      // left to speak this round, so move on rather than point past the end.
      if (next.phase === 'description' && next.turnIndex >= next.speakingOrder.length) {
        next = {
          ...next,
          phase: 'discussion',
          turnIndex: Math.max(0, next.speakingOrder.length - 1),
        };
      }

      // The leaver's ballot, and every ballot cast for them, go with them.
      // Left in, a stale vote could put them out a second time — and hand a
      // departed Mr White the guess that M4 says they never get.
      next = {
        ...next,
        ballots: Object.fromEntries(
          Object.entries(next.ballots).filter(
            ([voter, candidate]) => voter !== action.playerId && candidate !== action.playerId,
          ),
        ),
        tiedCandidateIds: next.tiedCandidateIds.filter((id) => id !== action.playerId),
      };

      // A player walking out must not hand anyone a scored victory.
      const winner = checkWin(next);
      if (winner) return { ...next, phase: 'gameOver', winner };
      return next;
    }

    case 'PLAY_AGAIN': {
      // Build a fresh state from the roster rather than mutating the old one.
      // Resetting field-by-field is how `interrupt`-style leftovers survive into
      // game two and start it mid-cascade.
      const counts: SetupCounts = {
        n: s.players.length,
        u: s.players.filter((p) => p.role === 'undercover').length,
        w: s.players.filter((p) => p.role === 'mrwhite').length,
      };
      return startGame(
        counts,
        s.players.map((p) => p.name),
        action.pair,
        action.seed,
        s.settings,
        s.scores,
        s.players.map((p) => p.id),
      );
    }

    default:
      return s;
  }
}

// ---------------------------------------------------------------- invariants

/** Returns the list of violated invariants. Empty array means the state is sane. */
export function checkInvariants(s: GameState): string[] {
  const bad: string[] = [];
  const c = s.players.filter((p) => p.role === 'civilian').length;
  const u = s.players.filter((p) => p.role === 'undercover').length;
  const w = s.players.filter((p) => p.role === 'mrwhite').length;

  if (s.players.length !== c + u + w) bad.push('I1 player count');

  for (const p of s.players) {
    if (p.role === 'civilian' && p.word !== s.civilianWord) bad.push(`I3 civilian word ${p.id}`);
    if (p.role === 'undercover' && p.word !== s.undercoverWord)
      bad.push(`I3 undercover word ${p.id}`);
    if (p.role === 'mrwhite' && p.word !== null) bad.push(`I3 mrwhite word ${p.id}`);
  }

  if (s.civilianWord === s.undercoverWord) bad.push('I4 identical words');

  if (civiliansAlive(s) === 0 && infiltratorsAlive(s) === 0) bad.push('I5 nobody alive');

  if ((s.phase === 'gameOver') !== (s.winner !== null)) bad.push('I6 gameOver <-> winner');

  const orders = s.players
    .map((p) => p.eliminationOrder)
    .filter((o): o is number => o !== null)
    .sort((a, b) => a - b);
  if (new Set(orders).size !== orders.length) bad.push('I7 duplicate elimination order');

  if (RESUMED_PLAY_PHASES.includes(s.phase)) {
    const living = alivePlayers(s).map((p) => p.id).sort();
    const order = s.speakingOrder.slice().sort();
    if (living.length !== order.length || living.some((id, i) => id !== order[i])) {
      bad.push('I8 speaking order != alive players');
    }
    // I10 holds only where play has RESUMED. The transient phases
    // eliminationReveal / mrWhiteGuess / mrWhiteGuessResult legitimately sit at
    // 2 alive between an elimination and the win check — asserting the naive
    // global form produced 667 fuzz failures.
    if (alivePlayers(s).length === 2) bad.push('I10 resumed play with 2 alive');
  }

  for (const p of s.players) {
    if (p.guess && p.eliminationCause !== 'vote') bad.push(`I11 guess without vote ${p.id}`);
    if (p.guess && p.role !== 'mrwhite') bad.push(`I11 guess by non-mrwhite ${p.id}`);
  }

  // I12: everyone who is out holds one place in the elimination order, 1..k
  // with no gaps. Without this a player can be put out twice — first by walking
  // out, then by a stale vote — and every other invariant still passes.
  const out = s.players.filter((p) => !isAlive(p));
  const outOrders = out.map((p) => p.eliminationOrder ?? 0).sort((a, b) => a - b);
  if (outOrders.some((o, i) => o !== i + 1) || s.nextEliminationOrder !== out.length + 1) {
    bad.push('I12 elimination order is not 1..k');
  }
  for (const p of s.players) {
    if (isAlive(p) && (p.eliminationOrder !== null || p.eliminationCause !== null)) {
      bad.push(`I12 living player marked out ${p.id}`);
    }
    if (p.status === 'left' && p.eliminationCause !== 'removed') bad.push(`I12 left without removal ${p.id}`);
    if (p.status === 'eliminated' && p.eliminationCause !== 'vote') bad.push(`I12 eliminated without vote ${p.id}`);
  }

  // I13: while players are describing, someone is actually on turn.
  if (s.phase === 'description' && (s.turnIndex < 0 || s.turnIndex >= s.speakingOrder.length)) {
    bad.push('I13 no speaker on turn');
  }

  // I14: while a vote is open, every ballot and every tied candidate is alive.
  if (s.phase === 'votePick' || s.phase === 'voteCast' || s.phase === 'voteTie') {
    const living = new Set(alivePlayers(s).map((p) => p.id));
    for (const [voter, candidate] of Object.entries(s.ballots)) {
      if (!living.has(voter) || !living.has(candidate)) bad.push(`I14 ballot ${voter}->${candidate}`);
    }
    for (const id of s.tiedCandidateIds) {
      if (!living.has(id)) bad.push(`I14 tied candidate is out ${id}`);
    }
  }

  return bad;
}
