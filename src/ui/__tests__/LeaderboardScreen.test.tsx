import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { LeaderboardScreen } from '../LeaderboardScreen';
import type { Leaderboard } from '../../engine/leaderboard';

const BOARD: Leaderboard = {
  ken: { name: 'Ken', points: 10, wins: 1, games: 2 },
  ankit: { name: 'Ankit', points: 14, wins: 3, games: 4 },
  rajiv: { name: 'Rajiv', points: 2, wins: 1, games: 4 },
};

const rowText = (i: number) => {
  const flat = (c: unknown): string =>
    Array.isArray(c) ? c.map(flat).join(' ') : c && typeof c === 'object' ? flat((c as { props: { children: unknown } }).props.children) : String(c ?? '');
  return flat(screen.getByTestId(`leaderboard-row-${i}`).props.children).replace(/\s+/g, ' ').trim();
};

describe('leaderboard', () => {
  it('LB1 with no games yet, says so and offers no reset', () => {
    render(<LeaderboardScreen board={{}} onReset={jest.fn()} onDone={jest.fn()} />);
    expect(screen.getByText(/No games finished yet/)).toBeTruthy();
    expect(screen.queryByTestId('leaderboard-reset')).toBeNull();
  });

  it('LB2 ranks by points: rank, name, wins, games, points', () => {
    render(<LeaderboardScreen board={BOARD} onReset={jest.fn()} onDone={jest.fn()} />);
    expect(rowText(0)).toBe('1 Ankit 3 4 14');
    expect(rowText(1)).toBe('2 Ken 1 2 10');
    expect(rowText(2)).toBe('3 Rajiv 1 4 2');
  });

  it('LB3 BLOCKER — wiping every score takes two deliberate taps', () => {
    jest.useFakeTimers();
    try {
      const onReset = jest.fn();
      render(<LeaderboardScreen board={BOARD} onReset={onReset} onDone={jest.fn()} deadZoneMs={350} />);
      fireEvent.press(screen.getByTestId('leaderboard-reset'));
      expect(onReset).not.toHaveBeenCalled(); // first tap only asks
      act(() => jest.advanceTimersByTime(80));
      fireEvent.press(screen.getByTestId('leaderboard-reset')); // a double-tap
      expect(onReset).not.toHaveBeenCalled();

      act(() => jest.advanceTimersByTime(400));
      fireEvent.press(screen.getByTestId('leaderboard-reset')); // a decision
      expect(onReset).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('LB4 done closes it', () => {
    const onDone = jest.fn();
    render(<LeaderboardScreen board={BOARD} onReset={jest.fn()} onDone={onDone} />);
    fireEvent.press(screen.getByTestId('leaderboard-done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
