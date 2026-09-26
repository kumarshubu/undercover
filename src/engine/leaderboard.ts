/**
 * The leaderboard: points, wins and games per player, across every game ever
 * played on this phone. Pure — saving it is the UI layer's job.
 *
 * Players are tracked by NAME, not by seat or id. Ids are seat numbers, so the
 * same friends sitting in a different order would otherwise swap points.
 */

import { nameKey } from './setup';
import type { GameState, Role } from './types';

export interface Standing {
  /** As last typed — "ankit" and "Ankit" are one player, shown the latest way. */
  name: string;
  points: number;
  wins: number;
  games: number;
}

/** Keyed by nameKey(name). */
export type Leaderboard = Record<string, Standing>;

export interface PlayerResult {
  name: string;
  role: Role;
  /** Points won in this game alone. */
  points: number;
  won: boolean;
}

/**
 * Who earned what in a finished game. A win is a game that paid the player
 * points — which also means a game ended by a walkout, which pays nobody,
 * counts as played but won by no one.
 */
export function gameResults(s: GameState): PlayerResult[] {
  return s.players.map((p) => {
    const points = (s.scores[p.id] ?? 0) - (s.scoresAtStart[p.id] ?? 0);
    return { name: p.name, role: p.role, points, won: points > 0 };
  });
}

export function recordGame(board: Leaderboard, results: readonly PlayerResult[]): Leaderboard {
  const next = { ...board };
  for (const r of results) {
    const key = nameKey(r.name);
    const prev = next[key] ?? { name: r.name, points: 0, wins: 0, games: 0 };
    next[key] = {
      name: r.name.trim(),
      points: prev.points + r.points,
      wins: prev.wins + (r.won ? 1 : 0),
      games: prev.games + 1,
    };
  }
  return next;
}

/**
 * Two boards added together, player by player. Undoing a reset uses it, so a
 * game played after the reset is kept rather than lost. The newer board's
 * spelling of a name wins.
 */
export function mergeBoards(older: Leaderboard, newer: Leaderboard): Leaderboard {
  const next = { ...older };
  for (const [key, s] of Object.entries(newer)) {
    const prev = next[key];
    next[key] = prev
      ? {
          name: s.name,
          points: prev.points + s.points,
          wins: prev.wins + s.wins,
          games: prev.games + s.games,
        }
      : s;
  }
  return next;
}

/** Most points first; ties go to more wins, then fewer games, then name. */
export function ranked(board: Leaderboard): Standing[] {
  return Object.values(board).sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      a.games - b.games ||
      a.name.localeCompare(b.name),
  );
}
