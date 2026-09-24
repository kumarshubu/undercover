import { describe, expect, it } from 'vitest';
import { MAX_WORD_LENGTH, parseWordList, pickPair, recentWindow } from '../wordlist';
import { BUILT_IN_PAIRS } from '../builtinWords';
import { newGame, normalizeGuess } from '../engine';
import { makeRng } from '../rng';

const pair = (civilianWord: string, undercoverWord: string) => ({ civilianWord, undercoverWord });

describe('L — word list upload', () => {
  it('L1 reads one pair per line, split by slash, comma, tab or pipe', () => {
    const { pairs, skipped } = parseWordList('Coffee / Tea\nCat,Dog\nSun\tMoon\nPen | Pencil\n');
    expect(pairs).toEqual([
      pair('Coffee', 'Tea'),
      pair('Cat', 'Dog'),
      pair('Sun', 'Moon'),
      pair('Pen', 'Pencil'),
    ]);
    expect(skipped).toEqual([]);
  });

  it('L2 copes with what Notes, Excel and Windows put in a file', () => {
    const text = '﻿"Ice cream","Frozen yogurt"\r\n\r\n# comment\r\n  Train  /  Metro  \r\n';
    expect(parseWordList(text).pairs).toEqual([
      pair('Ice cream', 'Frozen yogurt'),
      pair('Train', 'Metro'),
    ]);
  });

  it('L3 keeps words in any script', () => {
    expect(parseWordList('चाय / कॉफी').pairs).toEqual([pair('चाय', 'कॉफी')]);
  });

  it('L4 skips bad lines and says which, by line number', () => {
    const text = [
      'Coffee / Tea', //                  1 ok
      'Just one word', //                 2
      'A / B / C', //                     3
      'Tea / tea', //                     4 same word
      'Tea / Coffee', //                  5 same pair as 1, reversed
      `${'x'.repeat(MAX_WORD_LENGTH + 1)} / y`, // 6
      ' / Tea', //                        7 empty side
    ].join('\n');
    const { pairs, skipped } = parseWordList(text);
    expect(pairs).toEqual([pair('Coffee', 'Tea')]);
    expect(skipped.map((s) => s.line)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(skipped.find((s) => s.line === 5)!.reason).toBe('same pair as line 1');
  });

  it('L5 an empty or wordless file yields no pairs', () => {
    expect(parseWordList('').pairs).toEqual([]);
    expect(parseWordList('\n\n# nothing\n').pairs).toEqual([]);
    expect(parseWordList('%PDF-1.7 garbage').pairs).toEqual([]);
  });

  it('L6 BLOCKER — every pair it accepts can start a game', () => {
    // The engine throws on a pair it cannot deal. Anything the parser lets
    // through must never reach that throw.
    const text = ['Coffee / Tea', 'Tea / Tea', 'Tea / tea', 'a / A', 'café / cafe', 'x / y', ' / '].join('\n');
    for (const p of parseWordList(text).pairs) {
      expect(() => newGame({ n: 5, u: 1, w: 1 }, ['a', 'b', 'c', 'd', 'e'], p, 1)).not.toThrow();
    }
  });

  it('L7 the next game skips recent pairs, and never repeats the last one while there is a choice', () => {
    const pairs = [pair('A', 'B'), pair('C', 'D'), pair('E', 'F')];
    for (let i = 0; i < 100; i++) {
      expect(pickPair(pairs, i / 100, [pairs[1]])).not.toEqual(pairs[1]);
      // Two recent: only the third is left.
      expect(pickPair(pairs, i / 100, [pairs[0], pairs[2]])).toEqual(pairs[1]);
      // All recent: anything but the one just played.
      expect(pickPair(pairs, i / 100, [pairs[1], pairs[2], pairs[0]])).not.toEqual(pairs[0]);
    }
    // Control: with no history, every pair can come up.
    const seen = new Set([0, 0.4, 0.8].map((r) => pickPair(pairs, r).civilianWord));
    expect(seen).toEqual(new Set(['A', 'C', 'E']));
    // A one-pair list has no choice.
    expect(pickPair([pairs[0]], 0.5, [pairs[0]])).toEqual(pairs[0]);
  });
});

describe('B — built-in words', () => {
  it('B1 every built-in pair survives the same checks as an upload', () => {
    // Written out in the upload format and read back: nothing may be skipped.
    const text = BUILT_IN_PAIRS.map((p) => `${p.civilianWord} / ${p.undercoverWord}`).join('\n');
    const { pairs, skipped } = parseWordList(text);
    expect(skipped).toEqual([]);
    expect(pairs).toEqual(BUILT_IN_PAIRS);
  });

  it('B2 no word is used in two pairs, so every game feels different', () => {
    const words = BUILT_IN_PAIRS.flatMap((p) => [p.civilianWord, p.undercoverWord]);
    const seen = new Map<string, string>();
    const repeats: string[] = [];
    for (const w of words) {
      const k = normalizeGuess(w);
      if (seen.has(k)) repeats.push(`${w} ~ ${seen.get(k)}`);
      seen.set(k, w);
    }
    expect(repeats).toEqual([]);
  });

  it('B3 there are enough pairs for a long evening', () => {
    expect(BUILT_IN_PAIRS.length).toBeGreaterThanOrEqual(200);
  });

  it('B4 a night of 40 games never repeats a pair, however the dice fall', () => {
    // Real random draws, plus the worst case: a "random" number that never
    // changes, which without the recent-pairs rule picks one pair all night.
    const sources: Array<() => number> = [
      ...Array.from({ length: 20 }, (_, seed) => {
        const rng = makeRng(seed + 1);
        return () => rng.next();
      }),
      () => 0.5,
    ];
    for (const [i, random] of sources.entries()) {
      const recent: typeof BUILT_IN_PAIRS[number][] = [];
      const played = new Set<string>();
      for (let g = 0; g < 40; g++) {
        const p = pickPair(BUILT_IN_PAIRS, random(), recent);
        const key = `${p.civilianWord}/${p.undercoverWord}`;
        expect(played.has(key), `source ${i}, game ${g} repeated ${key}`).toBe(false);
        played.add(key);
        recent.push(p);
        if (recent.length > recentWindow(BUILT_IN_PAIRS.length)) recent.shift();
      }
    }
  });
});
