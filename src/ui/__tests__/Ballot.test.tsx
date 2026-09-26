/**
 * Secret-ballot voting, ties, and players leaving — through the real Game
 * component and the real engine.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Game } from '../Game';
import { newGame, reduce } from '../../engine/engine';
import { DEFAULT_SETTINGS, type GameState, type Settings } from '../../engine/types';

const PAIR = { civilianWord: 'Coffee', undercoverWord: 'Tea' };
const NAMES = ['Ana', 'Ben', 'Cy', 'Dev', 'Eve'];

const secret = (extra: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  votingMode: 'secretBallot',
  ...extra,
});

/** A dealt game on the starter screen. */
const dealt = (settings: Settings, seed = 3): GameState =>
  reduce(newGame({ n: 5, u: 1, w: 1 }, NAMES, PAIR, seed, settings), { type: 'DEAL_DONE' });

const setup = (initial: GameState, deadZoneMs = 0) =>
  render(
    <Game
      initial={initial}
      nextPair={() => PAIR}
      onNewSetup={jest.fn()}
      deadZoneMs={deadZoneMs}
    />,
  );

const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const on = (id: string) => screen.queryByTestId(id) !== null;
const idOf = (name: string) => `p${NAMES.indexOf(name)}`;

const toVote = (s: GameState) => {
  press('starter-go');
  for (let i = 0; i < s.speakingOrder.length; i++) press('describe-next');
  press('discuss-vote');
};

/** Each voter in turn, in seat order, votes for whoever `choose` says. */
const castAll = (choose: (voter: string) => string) => {
  while (on('ballot-handoff')) {
    const title = screen.getByTestId('ballot-voter').props.children;
    const voter = [title].flat().join('').replace('Pass the phone to ', '');
    press('ballot-open');
    press(`ballot-${idOf(choose(voter))}`);
    press('ballot-confirm');
  }
};

describe('secret ballot', () => {
  it('BS1 the phone goes round every living player in seat order, then the count', () => {
    const s = dealt(secret());
    setup(s);
    toVote(s);

    const order: string[] = [];
    castAll((voter) => {
      order.push(voter);
      return voter === 'Dev' ? 'Ana' : 'Dev'; //  four votes for Dev
    });
    expect(order).toEqual(NAMES);
    expect(screen.getByText('5 votes. Put the phone where everyone can see it.')).toBeTruthy();

    press('ballot-count');
    expect(screen.getByTestId('elimination-name').props.children).toBe('Dev');
  });

  it("BS2 BLOCKER — a voter never sees anyone else's vote", () => {
    const s = dealt(secret());
    setup(s);
    toVote(s);
    press('ballot-open');
    press('ballot-p3'); //   Ana picks Dev
    press('ballot-confirm');

    // Ben's turn: nothing on his ballot is picked, and Ana's choice is nowhere.
    press('ballot-open');
    const rows = screen.getAllByTestId(/^ballot-p\d$/);
    expect(rows.every((r) => !r.props.accessibilityState?.selected)).toBe(true);
    expect(screen.queryByText(/Dev/)).not.toBeNull(); //   control: Dev is a candidate…
    expect(screen.queryByText(/Vote for Dev/)).toBeNull(); //  …but not pre-chosen
  });

  it('BS3 a tie goes to the table, and a revote offers only the tied players', () => {
    const s = dealt(secret());
    setup(s);
    toVote(s);
    const votes: Record<string, string> = { Ana: 'Dev', Ben: 'Eve', Cy: 'Dev', Dev: 'Eve', Eve: 'Ana' };
    castAll((v) => votes[v]);
    press('ballot-count');

    expect(on('tie-screen')).toBe(true);
    expect(screen.getByText(/Dev and Eve — 2 votes each/)).toBeTruthy();
    press('tie-revote');

    press('ballot-open'); //  Ana's revote ballot
    const offered = screen.getAllByTestId(/^ballot-p\d$/).map((r) => r.props.testID);
    expect(offered.sort()).toEqual(['ballot-p3', 'ballot-p4']);
  });

  it('BS4 at their limits, the tie screen withdraws revote and "no one", never random', () => {
    const base = dealt(secret());
    const tie: GameState = {
      ...base,
      phase: 'voteTie',
      tiedCandidateIds: ['p3', 'p4'],
      ballots: { p0: 'p3', p1: 'p4' },
      revoteCount: 2,
      noEliminationStreak: 2,
    };
    setup(tie);
    const disabled = (id: string) => screen.getByTestId(id).props.accessibilityState?.disabled;
    expect(disabled('tie-revote')).toBe(true);
    expect(disabled('tie-none')).toBe(true);
    expect(disabled('tie-random')).toBe(false);
    press('tie-random');
    expect(['Dev', 'Eve']).toContain(screen.getByTestId('elimination-name').props.children);
  });

  it('BS5 skipping works until two rounds in a row had nobody out, then it is gone', () => {
    const s = dealt(secret({ allowAbstain: true }));
    setup(s);
    const skipRound = () => {
      toVote(s);
      while (on('ballot-handoff')) {
        press('ballot-open');
        press('ballot-skip');
      }
      expect(screen.getByText('0 votes, 5 skips. Put the phone where everyone can see it.')).toBeTruthy();
      press('ballot-count');
    };
    skipRound();
    skipRound();

    // Third vote: the skip button is withdrawn, so someone has to be named.
    toVote(s);
    press('ballot-open');
    expect(on('ballot-skip')).toBe(false);
    expect(on('ballot-confirm')).toBe(true);
  });

  it('BS7 by default a voter cannot pick themselves', () => {
    const s = dealt(secret());
    setup(s);
    toVote(s);
    press('ballot-open'); //  Ana's ballot
    const offered = screen.getAllByTestId(/^ballot-p\d$/).map((r) => r.props.testID);
    expect(offered.sort()).toEqual(['ballot-p1', 'ballot-p2', 'ballot-p3', 'ballot-p4']);
  });

  it('BS6 a double-tap on the handoff does not open the next ballot', () => {
    jest.useFakeTimers();
    try {
      const s = dealt(secret());
      setup(s, 350);
      const step = (id: string) => {
        act(() => jest.advanceTimersByTime(400));
        press(id);
      };
      step('starter-go');
      for (let i = 0; i < s.speakingOrder.length; i++) step('describe-next');
      step('discuss-vote');
      step('ballot-open');
      step('ballot-p3');
      step('ballot-confirm'); //                 Ana has voted; Ben's handoff shows

      act(() => jest.advanceTimersByTime(80));
      press('ballot-open'); //                   Ana's second tap, 80ms later
      expect(on('ballot-handoff')).toBe(true);

      step('ballot-open'); //                    Ben, once the phone has changed hands
      expect(on('ballot-screen')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('someone leaves', () => {
  it('LS1 a player who leaves drops out of the round, with two taps', () => {
    const s = dealt({ ...DEFAULT_SETTINGS }, 3);
    setup(s);
    press('starter-go');
    const leaver = s.players.find((p) => p.role === 'civilian')!;

    press('someone-left');
    expect(on('leave-sheet')).toBe(true);
    press(`leave-${leaver.id}`);
    expect(on('describe-screen')).toBe(true); //  picking alone does nothing
    press('leave-confirm');

    expect(on('leave-sheet')).toBe(false);
    expect(screen.queryByText(leaver.name)).toBeNull();
    expect(screen.getByText(/SPEAKER \d OF 4/)).toBeTruthy();
  });

  it('LS2 cancel changes nothing', () => {
    const s = dealt({ ...DEFAULT_SETTINGS }, 3);
    setup(s);
    press('starter-go');
    press('someone-left');
    press('leave-p0');
    press('leave-cancel');
    expect(screen.getByText(/SPEAKER 1 OF 5/)).toBeTruthy();
  });

  it('LS3 if leaving ends the game, it ends with no points, and says so', () => {
    const s = dealt({ ...DEFAULT_SETTINGS }, 3);
    setup(s);
    press('starter-go');
    const infiltrators = s.players.filter((p) => p.role !== 'civilian');
    for (const p of infiltrators) {
      press('someone-left');
      press(`leave-${p.id}`);
      press('leave-confirm');
    }
    expect(on('gameover-screen')).toBe(true);
    // Nobody is paid, so nobody is called the winner either.
    expect(screen.getByTestId('gameover-winner').props.children).toBe('No winner');
    expect(screen.getByText(`Ended when ${infiltrators[infiltrators.length - 1].name} left. No points this game.`)).toBeTruthy();
    expect(screen.getAllByText('+0 pts')).toHaveLength(5);
  });
});
