/**
 * The real entry point, with the real dead zones: setup, the deal, whole games,
 * play again, and back to setup. If a screen is ever left with nothing to press,
 * this is the test that notices.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import App from '../../../App';

// SafeAreaProvider renders nothing until native reports the screen insets, and
// jest has no native side. The library's own mock supplies fixed insets;
// everything else here is the real app.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const on = (id: string) => screen.queryByTestId(id) !== null;

/** Let the dead zone pass, then act — the way a person at the table would. */
const settle = () => act(() => jest.advanceTimersByTime(400));

/** Hand the phone round until everyone has seen their word. */
const deal = () => {
  while (on('reveal-handoff') || on('reveal-card')) {
    settle();
    if (on('reveal-open')) press('reveal-open');
    settle();
    fireEvent(screen.getByTestId('reveal-hold'), 'pressIn');
    fireEvent(screen.getByTestId('reveal-hold'), 'pressOut');
    settle();
    press('reveal-confirm');
  }
};

/** Play until game over, voting for whoever is listed first. */
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
      fireEvent.changeText(screen.getByTestId('guess-input'), 'latte');
      settle();
      press('guess-submit');
    } else if (on('guess-continue')) press('guess-continue');
    else throw new Error('stuck on a screen with nothing to press');
  }
  expect(on('gameover-screen')).toBe(true);
};

describe('app', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('AP1 plays setup -> deal -> a whole game -> play again -> a second game -> new setup', () => {
    render(<App />);
    expect(on('setup-screen')).toBe(true);

    press('setup-start');
    expect(screen.getByText('1 of 5')).toBeTruthy();
    deal();
    playToEnd();

    settle();
    press('gameover-again');
    expect(screen.getByText('1 of 5')).toBeTruthy();
    deal();
    playToEnd();

    // Somebody won points in this game.
    const earned = screen.getAllByText(/^\+\d+ pts$/).map((t) => Number(t.props.children[1]));
    expect(earned.some((n) => n > 0)).toBe(true);

    settle();
    press('gameover-setup');
    expect(on('setup-screen')).toBe(true);
  });
});
