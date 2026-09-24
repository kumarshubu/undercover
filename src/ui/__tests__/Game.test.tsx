/**
 * The game loop, driven through the real screens and the real engine.
 *
 * After the deal the phone lies face up on the table, so the property that
 * matters most is that no secret word is on screen until the game is over.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Game } from '../Game';
import { newGame, reduce } from '../../engine/engine';
import type { GameState, Player } from '../../engine/types';

const PAIR = { civilianWord: 'Coffee', undercoverWord: 'Tea' };
const NAMES = ['Ana', 'Ben', 'Cy', 'Dev', 'Eve', 'Fin', 'Gus'];

/** A dealt game, sitting on the starter announcement. */
const dealt = (seed: number, n = 5, u = 1, w = 1): GameState =>
  reduce(newGame({ n, u, w }, NAMES.slice(0, n), PAIR, seed), { type: 'DEAL_DONE' });

const setup = (initial: GameState, deadZoneMs = 0) => {
  const onNewSetup = jest.fn();
  let seed = 1000;
  const view = render(
    <Game
      initial={initial}
      pair={PAIR}
      onNewSetup={onNewSetup}
      nextSeed={() => seed++}
      deadZoneMs={deadZoneMs}
    />,
  );
  return { onNewSetup, unmount: view.unmount };
};

const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const on = (id: string) => screen.queryByTestId(id) !== null;
const nameOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.name;
const withRole = (s: GameState, role: Player['role']) => s.players.find((p) => p.role === role)!;

/** Walk from the starter screen to the vote. */
const talkThrough = (s: GameState) => {
  press('starter-go');
  for (let i = 0; i < s.speakingOrder.length; i++) press('describe-next');
  press('discuss-vote');
};

describe('game — a round', () => {
  it('GU1 walks starter, every speaker in order, discussion, vote, reveal', () => {
    const s = dealt(3);
    setup(s);

    expect(screen.getByText(`${nameOf(s, s.speakingOrder[0])} starts`)).toBeTruthy();
    press('starter-go');

    for (let i = 0; i < s.speakingOrder.length; i++) {
      expect(screen.getByTestId('describe-speaker').props.children).toBe(
        nameOf(s, s.speakingOrder[i]),
      );
      press('describe-next');
    }

    expect(on('discuss-screen')).toBe(true);
    press('discuss-vote');

    const target = withRole(s, 'undercover');
    press(`vote-${target.id}`);
    expect(screen.getByText(`Eliminate ${target.name}`)).toBeTruthy();
    press('vote-confirm');

    expect(screen.getByTestId('elimination-name').props.children).toBe(target.name);
    expect(screen.getByText('was an Undercover')).toBeTruthy();
  });

  it('GU2 the vote needs a pick first, and a second tap on the pick un-picks it', () => {
    const s = dealt(3);
    setup(s);
    talkThrough(s);

    press('vote-confirm');
    expect(on('vote-screen')).toBe(true); // nothing picked, nothing happens

    press('vote-p0');
    press('vote-p0');
    press('vote-confirm');
    expect(on('vote-screen')).toBe(true);
  });

  it('GU3 an eliminated player is not offered in the next vote', () => {
    const s = dealt(3, 7, 2, 1);
    setup(s);
    talkThrough(s);
    const out = s.players.find((p) => p.role === 'civilian')!;
    press(`vote-${out.id}`);
    press('vote-confirm');
    press('elimination-continue');

    talkThrough({ ...s, speakingOrder: s.speakingOrder.filter((id) => id !== out.id) });
    expect(on(`vote-${out.id}`)).toBe(false);
    expect(screen.getAllByTestId(/^vote-p\d+$/)).toHaveLength(6);
  });
});

describe('game — Mr White', () => {
  const toGuess = () => {
    const s = dealt(3);
    setup(s);
    talkThrough(s);
    const mw = withRole(s, 'mrwhite');
    press(`vote-${mw.id}`);
    press('vote-confirm');
    expect(screen.getByText('was Mr White')).toBeTruthy();
    press('elimination-continue');
    return { s, mw };
  };

  it('GU4 a right guess ends the game for Mr White', () => {
    const { s, mw } = toGuess();
    expect(screen.getByTestId('guess-submit').props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(screen.getByTestId('guess-input'), `  ${s.civilianWord.toUpperCase()} `);
    press('guess-submit');

    expect(screen.getByTestId('gameover-winner').props.children).toBe('Mr White wins');
    expect(screen.getByTestId(`gameover-${mw.id}`)).toBeTruthy();
    expect(screen.getByText('6 pts')).toBeTruthy();
  });

  it('GU5 a wrong guess is shown, the word is not, and counting it takes two taps', () => {
    const { s } = toGuess();
    fireEvent.changeText(screen.getByTestId('guess-input'), 'latte');
    press('guess-submit');

    expect(screen.getByText('“latte”')).toBeTruthy();
    expect(screen.queryByText(new RegExp(`\\b(${s.civilianWord}|${s.undercoverWord})\\b`, 'i'))).toBeNull();

    press('guess-override');
    expect(on('guess-result-screen')).toBe(true); // first tap only asks
    press('guess-override');
    expect(screen.getByTestId('gameover-winner').props.children).toBe('Mr White wins');
  });

  it('GU6 a double-tap on "count it" is not a decision', () => {
    jest.useFakeTimers();
    try {
      const s = dealt(3);
      setup(s, 350);
      const step = (id: string) => {
        act(() => jest.advanceTimersByTime(400));
        press(id);
      };
      step('starter-go');
      for (let i = 0; i < s.speakingOrder.length; i++) step('describe-next');
      step('discuss-vote');
      const mw = withRole(s, 'mrwhite');
      step(`vote-${mw.id}`);
      step('vote-confirm');
      step('elimination-continue');
      act(() => jest.advanceTimersByTime(400));
      fireEvent.changeText(screen.getByTestId('guess-input'), 'latte');
      step('guess-submit');

      step('guess-override');
      act(() => jest.advanceTimersByTime(80));
      press('guess-override'); //                 80ms later: the same double-tap
      expect(on('guess-result-screen')).toBe(true);

      step('guess-override'); //                  a deliberate second tap
      expect(on('gameover-screen')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('game — taps', () => {
  it('GU7 a fast double-tap on "next speaker" skips nobody', () => {
    jest.useFakeTimers();
    try {
      const s = dealt(3);
      setup(s, 350);
      act(() => jest.advanceTimersByTime(400));
      press('starter-go');
      act(() => jest.advanceTimersByTime(400));

      press('describe-next');
      act(() => jest.advanceTimersByTime(80));
      press('describe-next'); // inside the dead zone
      expect(screen.getByTestId('describe-speaker').props.children).toBe(
        nameOf(s, s.speakingOrder[1]),
      );

      // Control: once the dead zone has passed, the same tap works.
      act(() => jest.advanceTimersByTime(400));
      press('describe-next');
      expect(screen.getByTestId('describe-speaker').props.children).toBe(
        nameOf(s, s.speakingOrder[2]),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('game — privacy and the end', () => {
  /**
   * Play whole games through the UI, picking whoever is listed, and look for
   * either secret word on every screen until game over.
   */
  const playOut = (seed: number, onScreen: () => void) => {
    const s = dealt(seed, 7, 2, 1);
    const out = setup(s);
    for (let step = 0; step < 300 && !on('gameover-screen'); step++) {
      onScreen();
      if (on('starter-go')) press('starter-go');
      else if (on('describe-next')) press('describe-next');
      else if (on('discuss-vote')) press('discuss-vote');
      else if (on('vote-screen')) {
        press(screen.getAllByTestId(/^vote-p\d+$/)[step % 2]!.props.testID);
        press('vote-confirm');
      } else if (on('elimination-continue')) press('elimination-continue');
      else if (on('guess-input')) {
        fireEvent.changeText(screen.getByTestId('guess-input'), 'latte');
        press('guess-submit');
      } else if (on('guess-continue')) press('guess-continue');
      else throw new Error('stuck on a screen with nothing to press');
    }
    return { s, ...out };
  };

  it('GU8 BLOCKER — no secret word is on screen between the deal and game over', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const words = dealt(seed, 7, 2, 1);
      const secret = new RegExp(`\\b(${words.civilianWord}|${words.undercoverWord})\\b`, 'i');
      const { s, unmount } = playOut(seed, () => expect(screen.queryByText(secret)).toBeNull());

      // Positive control: at game over both words are shown, so the check
      // above is one that can fire.
      expect(on('gameover-screen')).toBe(true);
      expect(screen.getByTestId('gameover-civilian-word').props.children).toBe(s.civilianWord);
      expect(screen.queryAllByText(secret)).toHaveLength(2);
      unmount();
    }
  });

  it('GU9 play again goes straight back to the deal, for the same table', () => {
    playOut(4, () => {});
    press('gameover-again');
    expect(on('reveal-handoff')).toBe(true);
    expect(screen.getByText('1 of 7')).toBeTruthy();
  });

  it('GU10 new setup hands control back to the app', () => {
    const { onNewSetup } = playOut(5, () => {});
    press('gameover-setup');
    expect(onNewSetup).toHaveBeenCalledTimes(1);
  });
});
