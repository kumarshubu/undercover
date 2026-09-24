import { describe, expect, it } from 'vitest';
import { newGame, reduce } from '../engine';
import { gameResults, ranked, recordGame, type Leaderboard, type PlayerResult } from '../leaderboard';
import { MAX_NAME_LENGTH, nameKey, nameProblem } from '../setup';
import type { GameState } from '../types';

const PAIR = { civilianWord: 'Coffee', undercoverWord: 'Tea' };
const NAMES = ['Ankit', 'Rajiv', 'Abhishek', 'Shubham', 'Ken'];

/** Play a whole group-tap game by always voting out the first living player. */
const playOut = (s: GameState): GameState => {
  s = reduce(s, { type: 'DEAL_DONE' });
  for (let i = 0; i < 200 && s.phase !== 'gameOver'; i++) {
    if (s.phase === 'starterAnnounce') s = reduce(s, { type: 'BEGIN_ROUND' });
    else if (s.phase === 'description') s = reduce(s, { type: 'OPEN_VOTE' });
    else if (s.phase === 'votePick') {
      const first = s.players.find((p) => p.status === 'alive')!;
      s = reduce(s, { type: 'TAP_ELIMINATE', candidateId: first.id });
    } else if (s.phase === 'mrWhiteGuess') s = reduce(s, { type: 'SUBMIT_GUESS', text: 'nope' });
    else s = reduce(s, { type: 'CONTINUE' });
  }
  return s;
};

describe('N — player names', () => {
  it('N1 needs a name for everyone, unique regardless of case and spacing', () => {
    expect(nameProblem(NAMES)).toBeNull();
    expect(nameProblem(['Ankit', '  '])).toBe('Every player needs a name.');
    expect(nameProblem(['Ankit', ' ankit '])).toBe('Two players are called “ankit”.');
    expect(nameProblem(['Ken', 'x'.repeat(MAX_NAME_LENGTH + 1)])).toMatch(/too long/);
    expect(nameKey('  Ankit   Kumar ')).toBe('ankit kumar');
  });
});

describe('P — points and the leaderboard', () => {
  it('P1 BLOCKER — results carry only the points won in THIS game', () => {
    // Play again carries running scores into the next game; the leaderboard
    // must add each game once, not the running total again every game.
    const first = playOut(newGame({ n: 5, u: 1, w: 1 }, NAMES, PAIR, 11));
    const firstTotal = gameResults(first).reduce((n, r) => n + r.points, 0);
    expect(firstTotal).toBeGreaterThan(0);

    const second = playOut(reduce(first, { type: 'PLAY_AGAIN', pair: PAIR, seed: 12 }));
    const secondResults = gameResults(second);
    const secondTotal = secondResults.reduce((n, r) => n + r.points, 0);
    const running = Object.values(second.scores).reduce((n, v) => n + v, 0);
    expect(secondTotal).toBe(running - firstTotal);
  });

  it('P2 a win is a game that paid the player; everyone else just played', () => {
    const s = playOut(newGame({ n: 5, u: 1, w: 1 }, NAMES, PAIR, 11));
    for (const r of gameResults(s)) expect(r.won).toBe(r.points > 0);
    expect(gameResults(s).some((r) => r.won)).toBe(true);
    expect(gameResults(s).some((r) => !r.won)).toBe(true);
  });

  it('P3 recording adds points, wins and games per name, however the name is typed', () => {
    const game = (pts: Record<string, number>): PlayerResult[] =>
      Object.entries(pts).map(([name, points]) => ({ name, role: 'civilian', points, won: points > 0 }));

    let board: Leaderboard = {};
    board = recordGame(board, game({ Ankit: 2, Rajiv: 0, Ken: 10 }));
    board = recordGame(board, game({ ' ankit ': 2, Rajiv: 6, Ken: 0 }));

    expect(ranked(board)).toEqual([
      { name: 'Ken', points: 10, wins: 1, games: 2 },
      { name: 'Rajiv', points: 6, wins: 1, games: 2 },
      { name: 'ankit', points: 4, wins: 2, games: 2 }, //  one player, latest spelling
    ]);
  });

  it('P4 ties go to more wins, then fewer games, then name', () => {
    const board: Leaderboard = {
      a: { name: 'A', points: 6, wins: 1, games: 3 },
      b: { name: 'B', points: 6, wins: 3, games: 5 },
      c: { name: 'C', points: 6, wins: 1, games: 2 },
      d: { name: 'D', points: 6, wins: 1, games: 2 },
    };
    expect(ranked(board).map((s) => s.name)).toEqual(['B', 'C', 'D', 'A']);
  });

  it('P5 recording never changes the board it was given', () => {
    const board: Leaderboard = { ken: { name: 'Ken', points: 1, wins: 1, games: 1 } };
    recordGame(board, [{ name: 'Ken', role: 'civilian', points: 2, won: true }]);
    expect(board.ken.points).toBe(1);
  });
});
