/**
 * The table's names and the leaderboard, kept on the phone between sessions.
 * Anything unreadable loads as "nothing saved" rather than breaking the app.
 */

import type { Leaderboard, Standing } from '../engine/leaderboard';
import { readJson, writeJson } from './storage';

const ROSTER = 'players.json';
const BOARD = 'leaderboard.json';

export function loadRoster(): string[] | null {
  const data = readJson(ROSTER);
  return Array.isArray(data) && data.every((n) => typeof n === 'string') ? data : null;
}

export function saveRoster(names: readonly string[]): void {
  try {
    writeJson(ROSTER, names);
  } catch {
    // Remembering names is a convenience; failing to must not stop the game.
  }
}

const isStanding = (v: unknown): v is Standing =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Standing).name === 'string' &&
  ['points', 'wins', 'games'].every((k) => Number.isFinite((v as unknown as Record<string, number>)[k]));

export function loadLeaderboard(): Leaderboard {
  const data = readJson(BOARD);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data).filter(([, v]) => isStanding(v))) as Leaderboard;
}

export function saveLeaderboard(board: Leaderboard): boolean {
  try {
    writeJson(BOARD, board);
    return true;
  } catch {
    return false;
  }
}
