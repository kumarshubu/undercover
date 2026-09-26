/**
 * The real app with names and the leaderboard. Only the phone storage is
 * replaced — it hands back saved names and records what gets saved.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import App from '../../../App';

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

const mockSaveRoster = jest.fn();
const mockSaveLeaderboard = jest.fn();
jest.mock('../playerStore', () => ({
  loadRoster: () => ['Asha', 'Bilal', 'Chen', 'Dara', 'Eli', 'Farah'],
  saveRoster: (names: string[]) => mockSaveRoster(names),
  loadLeaderboard: () => ({ asha: { name: 'Asha', points: 4, wins: 2, games: 3 } }),
  saveLeaderboard: (b: unknown) => mockSaveLeaderboard(b),
}));

const mockSaveSettings = jest.fn();
jest.mock('../settingsStore', () => ({
  loadSettings: () => require('../../engine/types').DEFAULT_SETTINGS,
  saveSettings: (s: unknown) => mockSaveSettings(s),
}));

const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const on = (id: string) => screen.queryByTestId(id) !== null;
const settle = () => act(() => jest.advanceTimersByTime(400));

const deal = () => {
  while (on('reveal-handoff')) {
    settle();
    press('reveal-open');
    settle();
    press('reveal-confirm');
  }
};
const playToEnd = () => {
  for (let step = 0; step < 400 && !on('gameover-screen'); step++) {
    settle();
    if (on('starter-go')) press('starter-go');
    else if (on('describe-next')) press('describe-next');
    else if (on('discuss-vote')) press('discuss-vote');
    else if (on('vote-screen')) {
      press(screen.getAllByTestId(/^vote-p\d+$/)[0]!.props.testID);
      press('vote-confirm');
    } else if (on('elimination-continue')) press('elimination-continue');
    else if (on('guess-input')) {
      fireEvent.changeText(screen.getByTestId('guess-input'), 'nope');
      settle();
      press('guess-submit');
    } else if (on('guess-continue')) press('guess-continue');
  }
};

describe('app — players and leaderboard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSaveRoster.mockClear();
    mockSaveLeaderboard.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('AP2 saved names fill the seats; typed names are dealt, and remembered', () => {
    render(<App />);
    expect(screen.getByTestId('setup-name-0').props.value).toBe('Asha');
    fireEvent.changeText(screen.getByTestId('setup-name-1'), 'Bina');
    press('setup-start');

    expect(screen.getByText('Asha')).toBeTruthy(); //         first handoff
    expect(mockSaveRoster).toHaveBeenCalledWith(['Asha', 'Bina', 'Chen', 'Dara', 'Eli', 'Farah']);
    settle();
    press('reveal-open');
    settle();
    press('reveal-confirm');
    expect(screen.getByText('Bina')).toBeTruthy(); //         second handoff
  });

  it('AP3 BLOCKER — a finished game lands on the leaderboard, once, by name', () => {
    render(<App />);
    press('setup-start'); //  5 players: Asha..Eli
    deal();
    playToEnd();
    expect(on('gameover-screen')).toBe(true);

    expect(mockSaveLeaderboard).toHaveBeenCalledTimes(1);
    const board = mockSaveLeaderboard.mock.calls[0][0] as Record<string, { name: string; games: number; points: number }>;
    expect(Object.values(board).map((s) => s.name).sort()).toEqual(['Asha', 'Bilal', 'Chen', 'Dara', 'Eli']);
    expect(board.asha.games).toBe(4); //  3 saved + this one
    expect(board.bilal.games).toBe(1);
    const earned = Object.values(board).reduce((n, s) => n + s.points, 0) - 4;
    expect(earned).toBeGreaterThan(0);
  });

  it('AP4 the leaderboard opens over a finished game without ending it', () => {
    render(<App />);
    press('setup-start');
    deal();
    playToEnd();

    settle();
    press('gameover-leaderboard');
    expect(on('leaderboard-screen')).toBe(true);
    expect(screen.getByTestId('leaderboard-row-0')).toBeTruthy();
    press('leaderboard-done');

    // The game is still there: play again goes straight to the next deal.
    settle();
    press('gameover-again');
    expect(on('reveal-handoff')).toBe(true);
  });

  it('AP5 the leaderboard opens from setup too', () => {
    render(<App />);
    press('setup-leaderboard');
    expect(screen.getByText('Asha')).toBeTruthy();
    expect(on('leaderboard-row-0')).toBe(true);
  });

  it('AP6 picking secret ballot in Settings is saved and used by the next game', () => {
    render(<App />);
    press('setup-settings');
    press('settings-vote-secret');
    expect(mockSaveSettings).toHaveBeenCalledWith(expect.objectContaining({ votingMode: 'secretBallot' }));
    press('settings-done');

    press('setup-start');
    deal();
    settle();
    press('starter-go');
    while (on('describe-next')) {
      settle();
      press('describe-next');
    }
    settle();
    press('discuss-vote');
    expect(on('ballot-handoff')).toBe(true); //  not the out-loud vote screen
    expect(on('vote-screen')).toBe(false);
  });

  const SAVED = { asha: { name: 'Asha', points: 4, wins: 2, games: 3 } };
  const lastSaved = () => mockSaveLeaderboard.mock.calls.at(-1)?.[0];
  const wipe = () => {
    press('leaderboard-reset');
    settle();
    press('leaderboard-reset');
    settle();
  };

  it('AP7 a reset can be undone, even after closing the leaderboard', () => {
    render(<App />);
    press('setup-leaderboard');
    wipe();
    expect(lastSaved()).toEqual({});

    press('leaderboard-done'); //  change of mind comes a little later
    press('setup-leaderboard');
    press('leaderboard-undo');
    expect(lastSaved()).toEqual(SAVED);
    expect(on('leaderboard-undo')).toBe(false); //  once only: the scores can't be added back twice
    expect(on('leaderboard-row-0')).toBe(true);
  });

  it('AP8 undo keeps a game played after the reset, and adds the old scores back to it', () => {
    render(<App />);
    press('setup-leaderboard');
    wipe();
    press('leaderboard-done');

    press('setup-start'); //  5 players: Asha..Eli
    deal();
    playToEnd();
    press('gameover-leaderboard');
    settle();
    press('leaderboard-undo');

    const board = lastSaved() as Record<string, { games: number }>;
    expect(board.asha.games).toBe(4); //   3 from before the reset + this one
    expect(board.bilal.games).toBe(1);
  });

  it('AP9 two resets in a row are undone together', () => {
    render(<App />);
    press('setup-leaderboard');
    wipe(); //                                   wipes Asha's 3 saved games
    press('leaderboard-done');
    press('setup-start');
    deal();
    playToEnd();
    press('gameover-leaderboard');
    settle();
    wipe(); //                                   wipes the game just played
    press('leaderboard-undo');

    const board = lastSaved() as Record<string, { games: number }>;
    expect(board.asha.games).toBe(4); //   neither reset's scores are lost
    expect(board.bilal.games).toBe(1);
  });
});
