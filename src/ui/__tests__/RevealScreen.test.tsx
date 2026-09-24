/**
 * Reveal-screen tests. These guard a privacy property, not a layout — the whole
 * point is that a word never reaches a screen it should not be on.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { RevealScreen } from '../RevealScreen';
import type { Player } from '../../engine/types';

const player = (id: string, name: string, word: string | null): Player => ({
  id,
  name,
  seat: Number(id.slice(1)),
  role: word === null ? 'mrwhite' : 'civilian',
  word,
  status: 'alive',
  eliminatedRound: null,
  eliminationCause: null,
  eliminationOrder: null,
  guess: null,
});

const PLAYERS: Player[] = [
  player('p0', 'Ana', 'Coffee'),
  player('p1', 'Ben', 'Coffee'),
  player('p2', 'Cy', null), // Mr White
];

/** No dead zone in tests — it is exercised on its own in its dedicated case. */
const setup = (onDone = jest.fn(), deadZoneMs = 0) => {
  const utils = render(
    <RevealScreen players={PLAYERS} onDone={onDone} deadZoneMs={deadZoneMs} />,
  );
  return { ...utils, onDone };
};

/** Walk from the handoff screen to the card for the current player. */
const openCard = () => fireEvent.press(screen.getByTestId('reveal-open'));

describe('reveal — privacy', () => {
  it('R1 the word is ABSENT from the tree when covered, not merely hidden', () => {
    setup();
    openCard();

    // Nothing rendered anywhere may contain the secret.
    expect(screen.queryByTestId('reveal-word')).toBeNull();
    expect(screen.queryByText('Coffee')).toBeNull();
    expect(screen.getByTestId('reveal-card-covered')).toBeTruthy();

    // Positive control: the assertion above is worthless unless holding makes
    // it fail. Prove the detector works before trusting the negative.
    fireEvent(screen.getByTestId('reveal-hold'), 'pressIn');
    expect(screen.getByTestId('reveal-word')).toBeTruthy();
    expect(screen.getByText('Coffee')).toBeTruthy();
  });

  it('R2 releasing hides the word again immediately', () => {
    setup();
    openCard();
    const hold = screen.getByTestId('reveal-hold');

    fireEvent(hold, 'pressIn');
    expect(screen.getByText('Coffee')).toBeTruthy();

    fireEvent(hold, 'pressOut');
    expect(screen.queryByText('Coffee')).toBeNull();
    expect(screen.getByTestId('reveal-card-covered')).toBeTruthy();
  });

  it('R3 the next player never inherits the previous word on screen', () => {
    setup();
    openCard();
    fireEvent(screen.getByTestId('reveal-hold'), 'pressIn');
    expect(screen.getByText('Coffee')).toBeTruthy();

    fireEvent.press(screen.getByTestId('reveal-confirm'));

    // Back on a handoff screen, for Ben, with no word anywhere.
    expect(screen.getByTestId('reveal-handoff')).toBeTruthy();
    expect(screen.queryByText('Coffee')).toBeNull();

    // And the card starts covered rather than remembering the held state.
    openCard();
    expect(screen.queryByText('Coffee')).toBeNull();
    expect(screen.getByTestId('reveal-card-covered')).toBeTruthy();
  });

  it('R4 a civilian card and an undercover card differ only by the word', () => {
    // Same testID, same structure — nothing about the card announces the role.
    setup();
    openCard();
    fireEvent(screen.getByTestId('reveal-hold'), 'pressIn');
    const civilian = screen.getByTestId('reveal-card-open');

    expect(screen.queryByText(/civilian/i)).toBeNull();
    expect(screen.queryByText(/undercover/i)).toBeNull();
    expect(civilian).toBeTruthy();
  });

  it('R5 only Mr White is told their role, because an empty card must explain itself', () => {
    setup();
    openCard();
    fireEvent.press(screen.getByTestId('reveal-confirm')); // -> Ben
    openCard();
    fireEvent.press(screen.getByTestId('reveal-confirm')); // -> Cy (Mr White)
    openCard();

    expect(screen.queryByText(/Mr White/i)).toBeNull(); // still covered
    fireEvent(screen.getByTestId('reveal-hold'), 'pressIn');
    expect(screen.getByText(/Mr White/i)).toBeTruthy();
    expect(screen.queryByText('Coffee')).toBeNull();
  });
});

describe('reveal — the handoff', () => {
  it('R6 walks every player once, in order, then finishes', () => {
    const onDone = jest.fn();
    setup(onDone);

    expect(screen.getByText('1 of 3')).toBeTruthy();
    openCard();
    fireEvent.press(screen.getByTestId('reveal-confirm'));

    expect(screen.getByText('2 of 3')).toBeTruthy();
    openCard();
    fireEvent.press(screen.getByTestId('reveal-confirm'));

    expect(screen.getByText('3 of 3')).toBeTruthy();
    openCard();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('reveal-confirm'));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('R7 a fast double-tap advances exactly one player, not two', () => {
    // Both buttons sit at the same place on screen. A tap queued during the
    // transition would otherwise mount the next player's card while the
    // previous player is still holding the phone.
    jest.useFakeTimers();
    render(<RevealScreen players={PLAYERS} onDone={jest.fn()} deadZoneMs={350} />);

    act(() => {
      jest.advanceTimersByTime(350);
    });
    fireEvent.press(screen.getByTestId('reveal-open'));

    act(() => {
      jest.advanceTimersByTime(350);
    });
    fireEvent.press(screen.getByTestId('reveal-confirm')); // -> Ben's handoff

    // The second tap lands 80ms later, inside the dead zone. It must do nothing.
    act(() => {
      jest.advanceTimersByTime(80);
    });
    fireEvent.press(screen.getByTestId('reveal-open'));

    expect(screen.getByTestId('reveal-handoff')).toBeTruthy();
    expect(screen.getByText('2 of 3')).toBeTruthy();

    // Once armed, the same tap works.
    act(() => {
      jest.advanceTimersByTime(350);
    });
    fireEvent.press(screen.getByTestId('reveal-open'));
    expect(screen.getByTestId('reveal-card')).toBeTruthy();

    jest.useRealTimers();
  });
});

describe('reveal — accessibility', () => {
  it('R8 the hold control is reachable and labelled, without naming the word', () => {
    setup();
    openCard();
    const hold = screen.getByLabelText('Hold to see your secret word');
    expect(hold).toBeTruthy();
    // The label must describe the control, never leak its contents.
    expect(hold.props.accessibilityLabel).not.toContain('Coffee');
  });
});
