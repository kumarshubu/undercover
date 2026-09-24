/**
 * Core game types. No React, no I/O — this module must stay pure so the whole
 * game can be tested without launching a simulator.
 */

export type Role = 'civilian' | 'undercover' | 'mrwhite';
export type Faction = 'civilians' | 'infiltrators';
export type Winner = 'civilians' | 'infiltrators' | 'mrWhiteGuess';

export type PlayerStatus = 'alive' | 'eliminated' | 'left';
export type EliminationCause = 'vote' | 'removed';

export type Phase =
  | 'setup'
  | 'deal' //            pass-and-play reveal loop
  | 'starterAnnounce'
  | 'description' //     each alive player says one word
  | 'discussion'
  | 'votePick' //        group-tap voting
  | 'voteCast' //        secret-ballot voting
  | 'voteTie' //         table decides how to break it
  | 'eliminationReveal'
  | 'mrWhiteGuess'
  | 'mrWhiteGuessResult'
  | 'gameOver';

/** Phases in which play has RESUMED — i.e. the round is genuinely running again. */
export const RESUMED_PLAY_PHASES: readonly Phase[] = [
  'starterAnnounce',
  'description',
  'discussion',
  'votePick',
  'voteCast',
  'voteTie',
];

export interface WordPair {
  civilianWord: string;
  undercoverWord: string;
  /** Extra accepted spellings for Mr White's guess. */
  aliases?: string[];
}

export interface MrWhiteGuess {
  text: string;
  correct: boolean;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  role: Role;
  /** null for Mr White — null, never '' (invariant I3). */
  word: string | null;
  status: PlayerStatus;
  eliminatedRound: number | null;
  eliminationCause: EliminationCause | null;
  eliminationOrder: number | null;
  guess: MrWhiteGuess | null;
}

export type TieRule = 'revote' | 'random' | 'noElimination';

export interface Settings {
  /** Relaxes the "civilians must be the majority" rule. */
  allowNonMajorityCivilians: boolean;
  /** Round-1 starter is drawn from alive non-Mr-White players. */
  mrWhiteNeverFirst: boolean;
  starterMode: 'rotate' | 'randomEachRound';
  votingMode: 'groupTap' | 'secretBallot';
  allowSelfVote: boolean;
  allowAbstain: boolean;
  /** Points only to surviving members of the winning faction. */
  scoreSurvivorsOnly: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  allowNonMajorityCivilians: false,
  mrWhiteNeverFirst: true,
  starterMode: 'rotate',
  votingMode: 'groupTap',
  allowSelfVote: true,
  allowAbstain: false,
  scoreSurvivorsOnly: false,
};

export interface SetupCounts {
  n: number;
  u: number;
  w: number;
}

export interface GameState {
  phase: Phase;
  settings: Settings;
  players: Player[];
  pair: WordPair;
  /** The civilians' word for THIS game — the pair is swapped at deal time. */
  civilianWord: string;
  undercoverWord: string;

  round: number;
  /** Ids in speaking order for the current round. */
  speakingOrder: string[];
  turnIndex: number;
  /** Index into the deal loop (which player is being handed the phone). */
  dealIndex: number;

  /** Secret-ballot tally for the current vote: voterId -> candidateId. */
  ballots: Record<string, string>;
  /** Candidates a revote is restricted to; empty means everyone alive. */
  tiedCandidateIds: string[];
  revoteCount: number;
  noEliminationStreak: number;

  pendingEliminationId: string | null;
  nextEliminationOrder: number;

  winner: Winner | null;
  scores: Record<string, number>;

  /** Seeded RNG state lives INSIDE the state so `reduce` is genuinely pure. */
  seed: number;
}

export type GameAction =
  | { type: 'START'; counts: SetupCounts; names: string[]; pair: WordPair; seed: number }
  | { type: 'REVEAL_NEXT' }
  | { type: 'DEAL_DONE' }
  | { type: 'BEGIN_ROUND' }
  | { type: 'NEXT_SPEAKER' }
  | { type: 'OPEN_VOTE' }
  | { type: 'CAST_BALLOT'; voterId: string; candidateId: string }
  | { type: 'ABSTAIN'; voterId: string }
  | { type: 'CLOSE_VOTING' }
  | { type: 'TAP_ELIMINATE'; candidateId: string }
  | { type: 'RESOLVE_TIE'; rule: TieRule }
  | { type: 'CONTINUE' }
  | { type: 'SUBMIT_GUESS'; text: string }
  | { type: 'OVERRIDE_GUESS'; correct: boolean }
  | { type: 'REMOVE_PLAYER'; playerId: string }
  | { type: 'PLAY_AGAIN'; pair: WordPair; seed: number };

export function factionOf(role: Role): Faction {
  return role === 'civilian' ? 'civilians' : 'infiltrators';
}

export const isAlive = (p: Player): boolean => p.status === 'alive';
