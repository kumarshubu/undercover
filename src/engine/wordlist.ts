/**
 * Word lists: turning an uploaded text file into word pairs, and drawing a pair
 * for each game. Pure — the file picking and saving live in the UI layer.
 *
 * The format is deliberately forgiving, because the file will usually come out
 * of Notes, Excel or a chat message: one pair per line, the two words split by
 * a slash, comma, tab or pipe. Blank lines and lines starting with # are
 * ignored. Anything else that is not exactly two words is skipped and reported
 * by line number, so the person uploading can fix it.
 */

import { normalizeGuess } from './engine';
import type { WordPair } from './types';

export interface WordList {
  /** Where it came from, shown in settings — usually the file name. */
  name: string;
  pairs: WordPair[];
}

export interface SkippedLine {
  line: number;
  reason: string;
}

export interface ParseResult {
  pairs: WordPair[];
  skipped: SkippedLine[];
}

/** Longer than this and the word no longer fits the reveal card. */
export const MAX_WORD_LENGTH = 30;
export const MAX_PAIRS = 2000;

const SEPARATOR = /[/,\t|]/;

/** Strip the quotes a spreadsheet puts around a CSV cell. */
const clean = (s: string) => s.trim().replace(/^"(.*)"$/, '$1').trim();

export function parseWordList(text: string): ParseResult {
  const pairs: WordPair[] = [];
  const skipped: SkippedLine[] = [];
  const seen = new Map<string, number>();

  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  lines.forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;

    const parts = trimmed.split(SEPARATOR).map(clean);
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      skipped.push({ line, reason: 'needs exactly two words, like Coffee / Tea' });
      return;
    }
    const [a, b] = parts;
    if (a.length > MAX_WORD_LENGTH || b.length > MAX_WORD_LENGTH) {
      skipped.push({ line, reason: `a word is longer than ${MAX_WORD_LENGTH} letters` });
      return;
    }
    // Compared the way Mr White's guess is, so a pair can never be two
    // spellings of one word — and never trips the engine's identical-pair check.
    if (normalizeGuess(a) === normalizeGuess(b)) {
      skipped.push({ line, reason: 'both words are the same' });
      return;
    }
    const key = [normalizeGuess(a), normalizeGuess(b)].sort().join('\u0000');
    const first = seen.get(key);
    if (first !== undefined) {
      skipped.push({ line, reason: `same pair as line ${first}` });
      return;
    }
    if (pairs.length >= MAX_PAIRS) {
      skipped.push({ line, reason: `only the first ${MAX_PAIRS} pairs are kept` });
      return;
    }
    seen.set(key, line);
    pairs.push({ civilianWord: a, undercoverWord: b });
  });

  return { pairs, skipped };
}

const samePair = (a: WordPair, b: WordPair) =>
  a.civilianWord === b.civilianWord && a.undercoverWord === b.undercoverWord;

/** How many recent pairs to keep out of the draw, for a list of this size. */
export const recentWindow = (listSize: number) => Math.min(50, Math.floor(listSize / 2));

/**
 * Draw a pair for the next game, skipping the recently played ones (oldest
 * first in `recent`). If every pair is recent, it still never repeats the one
 * just played while there is any choice. `random` is in [0, 1) so the draw
 * stays testable.
 */
export function pickPair(
  pairs: readonly WordPair[],
  random: number,
  recent: readonly WordPair[] = [],
): WordPair {
  if (pairs.length === 0) throw new Error('word list is empty');
  const last = recent[recent.length - 1];
  let pool = pairs.filter((p) => !recent.some((r) => samePair(r, p)));
  if (pool.length === 0 && last) pool = pairs.filter((p) => !samePair(p, last));
  if (pool.length === 0) pool = [...pairs];
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))];
}
