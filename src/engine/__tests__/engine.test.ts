import { describe, expect, it } from 'vitest';
import {
  alivePlayers,
  award,
  buildSpeakingOrder,
  checkInvariants,
  checkWin,
  civiliansAlive,
  dealRoles,
  guessMatches,
  infiltratorsAlive,
  newGame,
  normalizeGuess,
  reduce,
  tallyBallots,
} from '../engine';
import { makeRng, shuffle } from '../rng';
import {
  canDecMrWhite,
  canIncMrWhite,
  canIncUndercover,
  clampRoles,
  defaultRoles,
  isValidSetup,
  maxInfiltrators,
} from '../setup';
import { DEFAULT_SETTINGS, type GameState, type Player, type Settings } from '../types';

const PAIR = { civilianWord: 'Coffee', undercoverWord: 'Tea' };
const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i}`);

/** Build a state with an exact role layout, bypassing the shuffle. */
function stateWith(roles: Array<'civilian' | 'undercover' | 'mrwhite'>): GameState {
  const s = newGame(
    { n: 5, u: 1, w: 1 },
    names(5),
    PAIR,
    1,
  );
  const players: Player[] = roles.map((role, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    seat: i,
    role,
    word: role === 'civilian' ? s.civilianWord : role === 'undercover' ? s.undercoverWord : null,
    status: 'alive',
    eliminatedRound: null,
    eliminationCause: null,
    eliminationOrder: null,
    guess: null,
  }));
  return { ...s, players, phase: 'description', speakingOrder: players.map((p) => p.id) };
}

const kill = (s: GameState, ids: string[]): GameState => ({
  ...s,
  players: s.players.map((p) =>
    ids.includes(p.id) ? { ...p, status: 'eliminated', eliminationCause: 'vote' } : p,
  ),
});

// ------------------------------------------------------------------ setup

describe('V — setup validation', () => {
  it('V1 rejects fewer than 3 players and more than 20', () => {
    expect(isValidSetup({ n: 2, u: 1, w: 0 })).toBe(false);
    expect(isValidSetup({ n: 21, u: 1, w: 0 })).toBe(false);
  });

  it('V2 requires at least one infiltrator', () => {
    expect(isValidSetup({ n: 5, u: 0, w: 0 })).toBe(false);
  });

  it('V3 requires at least two civilians', () => {
    // 3 players, 2 infiltrators -> 1 civilian, already a finished game
    expect(isValidSetup({ n: 3, u: 1, w: 1 })).toBe(false);
  });

  it('V4 enforces the civilian majority by default', () => {
    expect(isValidSetup({ n: 4, u: 1, w: 1 })).toBe(false); // 2 vs 2
    expect(isValidSetup({ n: 5, u: 1, w: 1 })).toBe(true); //  3 vs 2
  });

  it('V5 accepts the app default of 5 players -> 3/1/1', () => {
    expect(defaultRoles(5)).toEqual({ n: 5, u: 1, w: 1 });
  });

  it('V6 threads allowNonMajorityCivilians through predicate, cap and clamp', () => {
    const relaxed: Settings = { ...DEFAULT_SETTINGS, allowNonMajorityCivilians: true };
    const flag = relaxed.allowNonMajorityCivilians;

    // 2 vs 2 is illegal strict, legal relaxed
    expect(isValidSetup({ n: 4, u: 1, w: 1 })).toBe(false);
    expect(isValidSetup({ n: 4, u: 1, w: 1 }, true)).toBe(true);

    // The cap must move with the flag, or the relaxed rule is unreachable
    expect(maxInfiltrators(5, false)).toBe(2);
    expect(maxInfiltrators(5, true)).toBe(3);

    // Steppers must agree with the clamp under the flag
    expect(canIncMrWhite({ n: 5, u: 1, w: 1 }, false)).toBe(false);
    expect(canIncMrWhite({ n: 5, u: 1, w: 1 }, true)).toBe(true);
    expect(clampRoles({ n: 5, u: 2, w: 1 }, flag)).toEqual({ n: 5, u: 2, w: 1 });
  });

  it('V7 clamp sheds Mr Whites before Undercovers', () => {
    expect(clampRoles({ n: 5, u: 2, w: 2 })).toEqual({ n: 5, u: 2, w: 0 });
  });

  it('V8 clamp always produces a valid setup, for every n and every over-ask', () => {
    for (let n = 3; n <= 20; n++) {
      for (let u = 0; u <= n; u++) {
        for (let w = 0; w <= n; w++) {
          for (const flag of [false, true]) {
            expect(isValidSetup(clampRoles({ n, u, w }, flag), flag)).toBe(true);
          }
        }
      }
    }
  });

  it('V9 stepper predicates never enable an illegal move', () => {
    for (let n = 3; n <= 20; n++) {
      const base = defaultRoles(n);
      if (canIncUndercover(base)) {
        expect(isValidSetup({ ...base, u: base.u + 1 })).toBe(true);
      }
      if (canDecMrWhite(base)) {
        expect(isValidSetup({ ...base, w: base.w - 1 })).toBe(true);
      }
    }
  });
});

// ------------------------------------------------------------------ dealing

describe('D — dealing', () => {
  it('D1 deals exactly the requested role counts', () => {
    const roles = dealRoles({ n: 7, u: 2, w: 1 }, makeRng(42));
    expect(roles.filter((r) => r === 'civilian')).toHaveLength(4);
    expect(roles.filter((r) => r === 'undercover')).toHaveLength(2);
    expect(roles.filter((r) => r === 'mrwhite')).toHaveLength(1);
  });

  it('D2 gives civilians one word, undercovers the other, Mr White null', () => {
    const s = newGame({ n: 5, u: 1, w: 1 }, names(5), PAIR, 7);
    for (const p of s.players) {
      if (p.role === 'civilian') expect(p.word).toBe(s.civilianWord);
      if (p.role === 'undercover') expect(p.word).toBe(s.undercoverWord);
      if (p.role === 'mrwhite') expect(p.word).toBeNull(); // null, not ''
    }
    expect(s.civilianWord).not.toBe(s.undercoverWord);
  });

  it('D3 swaps which side of the pair is the civilian word across seeds', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      seen.add(newGame({ n: 5, u: 1, w: 1 }, names(5), PAIR, seed).civilianWord);
    }
    // Both words must appear, or a repeat player knows their faction on sight.
    expect(seen).toEqual(new Set(['Coffee', 'Tea']));
  });

  it('D4 is deterministic for a given seed', () => {
    const a = newGame({ n: 6, u: 1, w: 1 }, names(6), PAIR, 99);
    const b = newGame({ n: 6, u: 1, w: 1 }, names(6), PAIR, 99);
    expect(a.players.map((p) => p.role)).toEqual(b.players.map((p) => p.role));
  });

  it('D5 rejects a pair whose two words are identical', () => {
    expect(() =>
      newGame({ n: 5, u: 1, w: 1 }, names(5), { civilianWord: 'Tea', undercoverWord: 'Tea' }, 1),
    ).toThrow();
  });

  it('D6 shuffle is unbiased — no seat is over-represented', () => {
    const N = 6;
    const counts = Array.from({ length: N }, () => 0);
    for (let seed = 0; seed < 6000; seed++) {
      const order = shuffle(makeRng(seed), [0, 1, 2, 3, 4, 5]);
      counts[order[0]]++;
    }
    const expected = 6000 / N;
    for (const c of counts) {
      expect(Math.abs(c - expected)).toBeLessThan(expected * 0.25);
    }
  });
});

// ------------------------------------------------------------------ winning

describe('W — win conditions', () => {
  it('W1 civilians win when every infiltrator is out', () => {
    const s = kill(stateWith(['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite']), [
      'p3',
      'p4',
    ]);
    expect(checkWin(s)).toBe('civilians');
  });

  it('W2 infiltrators win at one civilian left', () => {
    const s = kill(stateWith(['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite']), [
      'p0',
      'p1',
    ]);
    expect(checkWin(s)).toBe('infiltrators');
  });

  it('W3 no winner while both sides have room', () => {
    expect(checkWin(stateWith(['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite']))).toBeNull();
  });

  it('W4 one civilian and zero infiltrators is a CIVILIAN win, not an infiltrator win', () => {
    // Both written conditions are true here. Order decides. Getting this
    // backwards awards the game to a faction with nobody alive.
    const s = kill(stateWith(['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite']), [
      'p1',
      'p2',
      'p3',
      'p4',
    ]);
    expect(civiliansAlive(s)).toBe(1);
    expect(infiltratorsAlive(s)).toBe(0);
    expect(checkWin(s)).toBe('civilians');
  });

  it('W5 BLOCKER — 2 civilians vs 2 infiltrators is NOT a win', () => {
    // The UX spec said nonCivilians >= civilians ends it here, which would kill
    // ~40% of five-player games after a single vote.
    const s = kill(stateWith(['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite']), ['p0']);
    expect(civiliansAlive(s)).toBe(2);
    expect(infiltratorsAlive(s)).toBe(2);
    expect(checkWin(s)).toBeNull();
  });

  it('W6 a surviving Mr White is an infiltrator — the game does not end when the undercovers die', () => {
    const s = kill(stateWith(['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite']), ['p3']);
    expect(checkWin(s)).toBeNull();
  });
});

// ------------------------------------------------------------------ Mr White

describe('M — Mr White', () => {
  const base = () => stateWith(['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite']);

  it('M1 a voted-out Mr White is offered a guess', () => {
    const s = reduce(base(), { type: 'TAP_ELIMINATE', candidateId: 'p4' });
    expect(s.phase).toBe('eliminationReveal');
    expect(reduce(s, { type: 'CONTINUE' }).phase).toBe('mrWhiteGuess');
  });

  it('M2 a correct guess wins immediately, even as the last infiltrator', () => {
    let s = kill(base(), ['p3']); //             undercover already out
    s = reduce(s, { type: 'TAP_ELIMINATE', candidateId: 'p4' });
    s = reduce(s, { type: 'CONTINUE' });
    expect(s.phase).toBe('mrWhiteGuess');
    s = reduce(s, { type: 'SUBMIT_GUESS', text: s.civilianWord });
    expect(s.winner).toBe('mrWhiteGuess');
    expect(s.phase).toBe('gameOver');
  });

  it('M3 a wrong guess falls through to the normal win check', () => {
    let s = kill(base(), ['p3']);
    s = reduce(s, { type: 'TAP_ELIMINATE', candidateId: 'p4' });
    s = reduce(s, { type: 'CONTINUE' });
    s = reduce(s, { type: 'SUBMIT_GUESS', text: 'definitely not it' });
    expect(s.winner).toBeNull();
    s = reduce(s, { type: 'CONTINUE' });
    expect(s.winner).toBe('civilians');
  });

  it('M4 a removed (not voted-out) Mr White gets no guess', () => {
    const s = reduce(base(), { type: 'REMOVE_PLAYER', playerId: 'p4' });
    expect(s.phase).not.toBe('mrWhiteGuess');
    expect(s.players.find((p) => p.id === 'p4')!.guess).toBeNull();

    // The line above never reaches the guard inside afterElimination, because
    // REMOVE_PLAYER returns without entering eliminationReveal. Drive that guard
    // directly: a Mr White sitting in eliminationReveal with cause 'removed'
    // must still be refused a guess. Today only votes can put them there, so
    // this is a defensive path — and an untested guard is a guard that rots.
    const staged: GameState = {
      ...base(),
      phase: 'eliminationReveal',
      pendingEliminationId: 'p4',
      players: base().players.map((p) =>
        p.id === 'p4'
          ? { ...p, status: 'left' as const, eliminationCause: 'removed' as const }
          : p,
      ),
    };
    expect(reduce(staged, { type: 'CONTINUE' }).phase).not.toBe('mrWhiteGuess');
  });

  it('M5 guess matching ignores case, accents and punctuation but is not fuzzy', () => {
    expect(guessMatches('  CofFee! ', 'Coffee')).toBe(true);
    expect(guessMatches('café', 'cafe')).toBe(true);
    expect(guessMatches('coffe', 'Coffee')).toBe(false); //  near miss stays a miss
    expect(guessMatches('', 'Coffee')).toBe(false);
    expect(guessMatches('espresso', 'Coffee', ['Espresso'])).toBe(true);
    expect(normalizeGuess('Ünïcôde  Test')).toBe('unicode test');
  });

  it('M8 BLOCKER — overriding a wrong guess to correct scores without crashing', () => {
    let s = kill(base(), ['p3']);
    s = reduce(s, { type: 'TAP_ELIMINATE', candidateId: 'p4' });
    s = reduce(s, { type: 'CONTINUE' });
    s = reduce(s, { type: 'SUBMIT_GUESS', text: 'coffees' }); // plural, auto-marked wrong
    expect(s.players.find((p) => p.id === 'p4')!.guess!.correct).toBe(false);

    s = reduce(s, { type: 'OVERRIDE_GUESS', correct: true });
    expect(s.winner).toBe('mrWhiteGuess');
    // The verdict must be written back onto the player, not just onto the winner
    expect(s.players.find((p) => p.id === 'p4')!.guess!.correct).toBe(true);
    expect(s.scores['p4']).toBe(6);
  });
});

// ------------------------------------------------------------------ order

describe('O — turn order', () => {
  it('O1 speaking order is exactly the living players, each once', () => {
    const s = kill(stateWith(['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite']), ['p2']);
    const order = buildSpeakingOrder(s.players, 'p1');
    expect(order).toEqual(['p1', 'p3', 'p4', 'p0']);
  });

  it('O2 Mr White never speaks first in round 1, over many seeds', () => {
    for (let seed = 0; seed < 400; seed++) {
      const s = reduce(newGame({ n: 5, u: 1, w: 1 }, names(5), PAIR, seed), { type: 'DEAL_DONE' });
      const first = s.players.find((p) => p.id === s.speakingOrder[0])!;
      expect(first.role).not.toBe('mrwhite');
    }
  });

  it('O4 BLOCKER — removing a player mid-round does not make anyone speak twice', () => {
    let s = stateWith(['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite']);
    s = { ...s, speakingOrder: ['p0', 'p1', 'p2', 'p3', 'p4'], turnIndex: 3 };
    // p1 has already spoken; removing them must pull the pointer back with them
    s = reduce(s, { type: 'REMOVE_PLAYER', playerId: 'p1' });
    expect(s.speakingOrder).toEqual(['p0', 'p2', 'p3', 'p4']);
    expect(s.speakingOrder[s.turnIndex]).toBe('p3'); // still on p3, not skipped
    expect(new Set(s.speakingOrder).size).toBe(s.speakingOrder.length);
  });

  it('O5 removing a player never awards points', () => {
    let s = kill(stateWith(['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite']), ['p4']);
    s = reduce(s, { type: 'REMOVE_PLAYER', playerId: 'p3' }); // last infiltrator walks out
    expect(s.winner).toBe('civilians');
    expect(s.phase).toBe('gameOver');
    expect(Object.keys(s.scores)).toHaveLength(0); // ended, not won
  });
});

// ------------------------------------------------------------------ voting

describe('T — voting', () => {
  const base = (): GameState => {
    const s = stateWith(['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite']);
    return { ...s, settings: { ...s.settings, votingMode: 'secretBallot' } };
  };

  it('T1 plurality is ousted', () => {
    let s = base();
    s = reduce(s, { type: 'CAST_BALLOT', voterId: 'p0', candidateId: 'p3' });
    s = reduce(s, { type: 'CAST_BALLOT', voterId: 'p1', candidateId: 'p3' });
    s = reduce(s, { type: 'CAST_BALLOT', voterId: 'p2', candidateId: 'p4' });
    s = reduce(s, { type: 'CLOSE_VOTING' });
    expect(s.pendingEliminationId).toBe('p3');
    expect(s.phase).toBe('eliminationReveal');
  });

  it('T2 a tie goes to the table, never resolved silently', () => {
    let s = base();
    s = reduce(s, { type: 'CAST_BALLOT', voterId: 'p0', candidateId: 'p3' });
    s = reduce(s, { type: 'CAST_BALLOT', voterId: 'p1', candidateId: 'p4' });
    s = reduce(s, { type: 'CLOSE_VOTING' });
    expect(s.phase).toBe('voteTie');
    expect(new Set(s.tiedCandidateIds)).toEqual(new Set(['p3', 'p4']));
  });

  it('T3 revote is withdrawn after two consecutive ties, so the round terminates', () => {
    let s = { ...base(), phase: 'voteTie' as const, tiedCandidateIds: ['p3', 'p4'], revoteCount: 2 };
    const after = reduce(s, { type: 'RESOLVE_TIE', rule: 'revote' });
    expect(after).toEqual(s); // inert, not another loop
  });

  it('T4 a third no-elimination in a row is blocked', () => {
    const s = {
      ...base(),
      phase: 'voteTie' as const,
      tiedCandidateIds: ['p3', 'p4'],
      noEliminationStreak: 2,
    };
    expect(reduce(s, { type: 'RESOLVE_TIE', rule: 'noElimination' })).toEqual(s);
  });

  it('T5 random tie-break eliminates one of the tied candidates', () => {
    const s = { ...base(), phase: 'voteTie' as const, tiedCandidateIds: ['p3', 'p4'] };
    const after = reduce(s, { type: 'RESOLVE_TIE', rule: 'random' });
    expect(['p3', 'p4']).toContain(after.pendingEliminationId);
  });

  it('T6 self-votes are refused when the setting is off', () => {
    const s = { ...base(), settings: { ...base().settings, allowSelfVote: false } };
    const after = reduce(s, { type: 'CAST_BALLOT', voterId: 'p0', candidateId: 'p0' });
    expect(after.ballots).toEqual({});
  });

  it('T7 BLOCKER — an all-abstain vote does not softlock the game', () => {
    // Empty tally: no victim, no tie, no interrupt. Without an explicit
    // transition the phase never changes and the screen has no button.
    const s = { ...base(), settings: { ...base().settings, allowAbstain: true }, ballots: {} };
    const after = reduce(s, { type: 'CLOSE_VOTING' });
    expect(tallyBallots(s).top).toHaveLength(0);
    expect(after.phase).not.toBe(s.phase);
    expect(after.round).toBe(s.round + 1);
    expect(after.noEliminationStreak).toBe(1);
    expect(alivePlayers(after)).toHaveLength(5); // nobody eliminated
  });
});

// ------------------------------------------------------------------ whole game

describe('G — whole game', () => {
  it('G1 scoring matches the contract', () => {
    const s = kill(stateWith(['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite']), [
      'p3',
      'p4',
    ]);
    const scores = award({ ...s, winner: 'civilians' });
    expect(scores).toEqual({ p0: 2, p1: 2, p2: 2 });

    const infil = award({ ...kill(s, ['p0', 'p1']), winner: 'infiltrators' });
    expect(infil['p3']).toBe(10); //  undercover
    expect(infil['p4']).toBe(6); //   Mr White
  });

  it('G2 fuzz — 4000 random games all terminate and never break an invariant', () => {
    let played = 0;
    for (let seed = 0; seed < 4000; seed++) {
      const rng = makeRng(seed * 7919 + 13);
      const n = 3 + Math.floor(rng.next() * 8);
      const counts = defaultRoles(n);
      let s = newGame(counts, names(n), PAIR, seed);
      s = reduce(s, { type: 'DEAL_DONE' });

      for (let step = 0; step < 300 && s.phase !== 'gameOver'; step++) {
        const bad = checkInvariants(s);
        expect(bad, `seed ${seed} step ${step}: ${bad.join(', ')}`).toEqual([]);

        if (s.phase === 'mrWhiteGuess') {
          s = reduce(s, {
            type: 'SUBMIT_GUESS',
            text: rng.next() < 0.3 ? s.civilianWord : 'wrong',
          });
        } else if (s.phase === 'mrWhiteGuessResult' || s.phase === 'eliminationReveal') {
          s = reduce(s, { type: 'CONTINUE' });
        } else if (s.phase === 'starterAnnounce') {
          s = reduce(s, { type: 'BEGIN_ROUND' });
        } else if (s.phase === 'description' || s.phase === 'discussion') {
          s = reduce(s, { type: 'OPEN_VOTE' });
        } else if (s.phase === 'votePick') {
          const living = alivePlayers(s);
          const victim = living[Math.floor(rng.next() * living.length)];
          s = reduce(s, { type: 'TAP_ELIMINATE', candidateId: victim.id });
        } else {
          s = reduce(s, { type: 'CONTINUE' });
        }
      }

      expect(s.phase, `seed ${seed} did not terminate`).toBe('gameOver');
      expect(s.winner).not.toBeNull();
      expect(checkInvariants(s)).toEqual([]);
      played++;
    }
    expect(played).toBe(4000);
  });

  it('G5 BLOCKER — play again resets everything except roster, setup and scores', () => {
    let s = kill(stateWith(['civilian', 'civilian', 'civilian', 'undercover', 'mrwhite']), ['p3']);
    s = {
      ...s,
      round: 4,
      pendingEliminationId: 'p3',
      tiedCandidateIds: ['p1'],
      revoteCount: 2,
      noEliminationStreak: 2,
      ballots: { p0: 'p1' },
      scores: { p0: 2 },
      winner: 'civilians',
      phase: 'gameOver',
    };

    const next = reduce(s, { type: 'PLAY_AGAIN', pair: PAIR, seed: 5 });

    expect(next.round).toBe(1);
    expect(next.winner).toBeNull();
    expect(next.pendingEliminationId).toBeNull();
    expect(next.tiedCandidateIds).toEqual([]);
    expect(next.revoteCount).toBe(0);
    expect(next.noEliminationStreak).toBe(0);
    expect(next.ballots).toEqual({});
    expect(next.nextEliminationOrder).toBe(1);
    expect(next.players.every((p) => p.status === 'alive')).toBe(true);
    expect(next.players.every((p) => p.guess === null)).toBe(true);
    expect(next.players.every((p) => p.eliminationOrder === null)).toBe(true);

    // carried over
    expect(next.scores).toEqual({ p0: 2 });
    expect(next.players.map((p) => p.name)).toEqual(s.players.map((p) => p.name));
    expect(next.players.filter((p) => p.role === 'mrwhite')).toHaveLength(1);
    expect(next.players.filter((p) => p.role === 'undercover')).toHaveLength(1);
  });

  it('G6 the reveal card carries no role label — only the word distinguishes it', () => {
    const s = newGame({ n: 5, u: 1, w: 1 }, names(5), PAIR, 3);
    const civ = s.players.find((p) => p.role === 'civilian')!;
    const und = s.players.find((p) => p.role === 'undercover')!;
    // What a card is allowed to render: the word, and nothing else.
    const card = (p: Player) => ({ word: p.word, name: p.name });
    expect(Object.keys(card(civ))).toEqual(Object.keys(card(und)));
    expect(card(civ).word).not.toBe(card(und).word);
  });
});
