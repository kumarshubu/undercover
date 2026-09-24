/**
 * Design tokens. One place, so a colour never gets typed twice and drifts.
 *
 * The palette is deliberately dark for the reveal flow: a bright screen at a
 * table is readable over someone's shoulder from much further away.
 */

export const c = {
  bg: '#12131A',
  surface: '#1B1D25',
  surfaceAlt: '#22242E',
  line: '#2E313C',

  ink: '#F2F3F7',
  inkDim: '#969AAA',
  inkFaint: '#5C6070',

  accent: '#7A80EE',
  accentInk: '#B4B8F8',

  ok: '#5FC49E',
  warn: '#DCA746',
  danger: '#F08279',

  /**
   * Card colours must NOT vary by role. A civilian card and an undercover card
   * are identical apart from the word string — if the shade differed by so much
   * as a step, a player could read their own faction off the design.
   */
  card: '#252834',
  cardEdge: '#343848',
} as const;

export const space = (n: number) => n * 8;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const type = {
  hero: { fontSize: 44, fontWeight: '800', letterSpacing: -1.2 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  word: { fontSize: 40, fontWeight: '800', letterSpacing: -0.8 },
  body: { fontSize: 16, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
} as const;
