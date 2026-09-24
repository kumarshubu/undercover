/**
 * Setup validation and the +/- stepper predicates.
 *
 * Every stepper is DERIVED from isValidSetup, never hand-written — that is what
 * keeps the buttons and the clamp from disagreeing. The gap review found exactly
 * that bug in the original proposal: clampRoles took no allowNonMajorityCivilians
 * flag but asserted a predicate whose flag defaulted to false, so turning the
 * setting on left the steppers dead and could trip the assert on a legal setup.
 * The flag is threaded through everything here.
 */

import type { SetupCounts } from './types';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;

/**
 * Largest legal U + W for N players.
 * Strict-majority rule: C > U + W. Relaxed rule: only C >= 2.
 */
export function maxInfiltrators(n: number, allowNonMajorityCivilians: boolean): number {
  return allowNonMajorityCivilians ? n - 2 : Math.floor((n - 1) / 2);
}

export function civilianCount({ n, u, w }: SetupCounts): number {
  return n - u - w;
}

export function isValidSetup(
  { n, u, w }: SetupCounts,
  allowNonMajorityCivilians = false,
): boolean {
  if (!Number.isInteger(n) || !Number.isInteger(u) || !Number.isInteger(w)) return false;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return false;
  if (u < 0 || w < 0) return false;
  if (u + w < 1) return false; //           at least one infiltrator
  const c = n - u - w;
  if (c < 2) return false; //               C <= 1 is already a finished game
  if (!allowNonMajorityCivilians && c <= u + w) return false;
  return true;
}

/** The four stepper predicates, all derived from the one rule above. */
export function canIncUndercover(s: SetupCounts, flag = false): boolean {
  return isValidSetup({ ...s, u: s.u + 1 }, flag);
}
export function canDecUndercover(s: SetupCounts, flag = false): boolean {
  return isValidSetup({ ...s, u: s.u - 1 }, flag);
}
export function canIncMrWhite(s: SetupCounts, flag = false): boolean {
  return isValidSetup({ ...s, w: s.w + 1 }, flag);
}
export function canDecMrWhite(s: SetupCounts, flag = false): boolean {
  return isValidSetup({ ...s, w: s.w - 1 }, flag);
}

/**
 * Pull an arbitrary (n, u, w) back to something legal.
 * Sheds Mr Whites before Undercovers — Undercover is the core role, and the
 * reference game only introduces the no-word role at 5+ players.
 */
export function clampRoles(counts: SetupCounts, allowNonMajorityCivilians = false): SetupCounts {
  const n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, counts.n));
  let u = Math.max(0, counts.u);
  let w = Math.max(0, counts.w);

  const cap = maxInfiltrators(n, allowNonMajorityCivilians);

  while (u + w > cap && w > 0) w--;
  while (u + w > cap && u > 0) u--;
  if (u + w < 1) u = 1;

  const result = { n, u, w };
  // Cap >= 1 for every n >= 3 under both rules, so this always terminates legally.
  return isValidSetup(result, allowNonMajorityCivilians) ? result : { n, u: 1, w: 0 };
}

export const MAX_NAME_LENGTH = 16;

/** Names are compared the way people read them: case and spacing don't count. */
export const nameKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * What stops these names from starting a game, or null if nothing does. Two
 * players with one name would make the vote ambiguous and merge their points
 * on the leaderboard, so duplicates are refused, not just discouraged.
 */
export function nameProblem(names: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (name === '') return 'Every player needs a name.';
    if (name.length > MAX_NAME_LENGTH) return `“${name}” is too long (max ${MAX_NAME_LENGTH}).`;
    const key = nameKey(name);
    if (seen.has(key)) return `Two players are called “${name}”.`;
    seen.add(key);
  }
  return null;
}

/** Sensible starting split. Anchored on the one real data point: N=5 -> 3/1/1. */
export function defaultRoles(n: number, allowNonMajorityCivilians = false): SetupCounts {
  const w = n >= 5 ? 1 : 0;
  const u = Math.max(1, Math.floor(n / 4));
  return clampRoles({ n, u, w }, allowNonMajorityCivilians);
}
