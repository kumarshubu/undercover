/**
 * The real app with a saved word list: the game must deal from that list, and
 * Settings must be reachable from setup and back.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import App from '../../../App';

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// Only the phone storage is replaced: it reports a saved list.
jest.mock('../wordStore', () => ({
  loadWordList: () => ({
    name: 'party',
    pairs: [{ civilianWord: 'Pizza', undercoverWord: 'Burger' }],
  }),
  uploadWordList: jest.fn(),
  clearWordList: jest.fn(),
}));

const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const settle = () => act(() => jest.advanceTimersByTime(400));

describe('app — word list', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('AW1 settings opens from setup, shows the saved list, and goes back', () => {
    render(<App />);
    press('setup-settings');
    expect(screen.getByTestId('settings-current').props.children).toBe('party');
    press('settings-done');
    expect(screen.getByTestId('setup-screen')).toBeTruthy();
  });

  it('AW2 BLOCKER — the game deals from the saved list, not the built-in pair', () => {
    render(<App />);
    press('setup-start');

    // Deal the whole table and collect every word anyone is shown.
    const seen = new Set<string>();
    while (screen.queryByTestId('reveal-handoff')) {
      settle();
      press('reveal-open');
      settle();
      fireEvent(screen.getByTestId('reveal-hold'), 'pressIn');
      const word = screen.queryByTestId('reveal-word')?.props.children;
      if (word !== undefined) seen.add(word);
      fireEvent(screen.getByTestId('reveal-hold'), 'pressOut');
      settle();
      press('reveal-confirm');
    }

    // 5 players, 1 Mr White: four people saw a word, all from the list.
    expect(seen.size).toBeGreaterThan(0);
    expect([...seen].every((w) => w === 'Pizza' || w === 'Burger')).toBe(true);
  });
});
