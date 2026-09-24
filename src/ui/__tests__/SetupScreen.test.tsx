/**
 * Setup-screen tests.
 *
 * The property that matters: a stepper is enabled if and only if pressing it
 * lands on a legal setup. If the buttons and the rule ever disagree, you get a
 * setting you can see but cannot reach — or one you can reach but cannot play.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { SetupScreen } from '../SetupScreen';
import { DEFAULT_SETTINGS, type SetupCounts } from '../../engine/types';
import { isValidSetup } from '../../engine/setup';

const setup = (onStart = jest.fn(), initial?: SetupCounts) => {
  render(<SetupScreen settings={DEFAULT_SETTINGS} onStart={onStart} initial={initial} />);
  return { onStart };
};

const enabled = (id: string) => !screen.getByTestId(id).props.accessibilityState?.disabled;

describe('setup — counts', () => {
  it('S1 opens on the app default: 5 players, 3 / 1 / 1', () => {
    setup();
    expect(screen.getByText('Players: 5')).toBeTruthy();
    expect(screen.getByTestId('setup-civilians').props.children.join('')).toBe('3 Civilians');
    expect(screen.getByTestId('setup-undercover-count').props.children.join('')).toBe(
      '1 Undercover',
    );
    expect(screen.getByTestId('setup-mrwhite-count').props.children.join('')).toBe('1 Mr White');
  });

  it('S2 civilians are computed, so they have no steppers', () => {
    setup();
    expect(screen.queryByTestId('setup-civilians-inc')).toBeNull();
    expect(screen.queryByTestId('setup-civilians-dec')).toBeNull();
  });

  it('S3 adding an undercover takes it from the civilians', () => {
    setup(jest.fn(), { n: 7, u: 1, w: 1 });
    expect(screen.getByTestId('setup-civilians').props.children.join('')).toBe('5 Civilians');
    fireEvent.press(screen.getByTestId('setup-undercover-inc'));
    expect(screen.getByTestId('setup-undercover-count').props.children.join('')).toBe(
      '2 Undercovers',
    );
    expect(screen.getByTestId('setup-civilians').props.children.join('')).toBe('4 Civilians');
  });

  it('S4 a disabled stepper does nothing when pressed', () => {
    // 5 players, 3/1/1 — one more infiltrator would break the civilian majority
    setup();
    expect(enabled('setup-mrwhite-inc')).toBe(false);
    fireEvent.press(screen.getByTestId('setup-mrwhite-inc'));
    expect(screen.getByTestId('setup-mrwhite-count').props.children.join('')).toBe('1 Mr White');
  });

  it('S5 you can never remove the last infiltrator', () => {
    setup(jest.fn(), { n: 5, u: 1, w: 0 });
    expect(enabled('setup-undercover-dec')).toBe(false);
  });
});

describe('setup — buttons agree with the rules', () => {
  it('S6 every stepper is enabled exactly when the move is legal', () => {
    // The whole point: the UI must not have its own opinion about validity.
    const cases: SetupCounts[] = [
      { n: 3, u: 1, w: 0 },
      { n: 4, u: 1, w: 0 },
      { n: 5, u: 1, w: 1 },
      { n: 7, u: 2, w: 1 },
      { n: 9, u: 2, w: 1 },
      { n: 12, u: 3, w: 1 },
      { n: 20, u: 5, w: 2 },
    ];

    for (const counts of cases) {
      const view = render(
        <SetupScreen settings={DEFAULT_SETTINGS} onStart={jest.fn()} initial={counts} />,
      );

      const flag = DEFAULT_SETTINGS.allowNonMajorityCivilians;
      expect(enabled('setup-undercover-inc')).toBe(
        isValidSetup({ ...counts, u: counts.u + 1 }, flag),
      );
      expect(enabled('setup-undercover-dec')).toBe(
        isValidSetup({ ...counts, u: counts.u - 1 }, flag),
      );
      expect(enabled('setup-mrwhite-inc')).toBe(isValidSetup({ ...counts, w: counts.w + 1 }, flag));
      expect(enabled('setup-mrwhite-dec')).toBe(isValidSetup({ ...counts, w: counts.w - 1 }, flag));
      view.unmount();
    }
  });

  it('S7 dragging the slider down re-clamps instead of going illegal', () => {
    setup(jest.fn(), { n: 12, u: 3, w: 1 });
    fireEvent(screen.getByTestId('setup-slider'), 'valueChange', 5);

    expect(screen.getByText('Players: 5')).toBeTruthy();
    const u = Number(screen.getByTestId('setup-undercover-count').props.children[0]);
    const w = Number(screen.getByTestId('setup-mrwhite-count').props.children[0]);
    expect(isValidSetup({ n: 5, u, w })).toBe(true);
  });

  it('S8 the slider never produces an illegal setup, at any size', () => {
    setup(jest.fn(), { n: 20, u: 5, w: 2 });
    for (let n = 20; n >= 3; n--) {
      fireEvent(screen.getByTestId('setup-slider'), 'valueChange', n);
      const u = Number(screen.getByTestId('setup-undercover-count').props.children[0]);
      const w = Number(screen.getByTestId('setup-mrwhite-count').props.children[0]);
      expect({ n, u, w, legal: isValidSetup({ n, u, w }) }).toEqual({ n, u, w, legal: true });
    }
  });
});

describe('setup — starting', () => {
  it('S9 Start hands back exactly what is on screen', () => {
    const onStart = jest.fn();
    setup(onStart, { n: 7, u: 2, w: 1 });
    fireEvent.press(screen.getByTestId('setup-start'));
    expect(onStart).toHaveBeenCalledWith(
      { n: 7, u: 2, w: 1 },
      ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7'],
    );
  });
});

describe('setup — names', () => {
  const nameAt = (i: number) => screen.getByTestId(`setup-name-${i}`).props.value;
  const startEnabled = () =>
    !screen.getByTestId('setup-start').props.accessibilityState?.disabled;

  it('SN1 one name per seat: saved names first, then "Player N"', () => {
    render(
      <SetupScreen
        settings={DEFAULT_SETTINGS}
        onStart={jest.fn()}
        initial={{ n: 5, u: 1, w: 1 }}
        names={['Ankit', 'Rajiv', 'Ken']}
      />,
    );
    expect([0, 1, 2, 3, 4].map(nameAt)).toEqual(['Ankit', 'Rajiv', 'Ken', 'Player 4', 'Player 5']);
    expect(screen.queryByTestId('setup-name-5')).toBeNull();
  });

  it('SN2 shrinking the table and growing it back keeps the names typed', () => {
    render(<SetupScreen settings={DEFAULT_SETTINGS} onStart={jest.fn()} initial={{ n: 5, u: 1, w: 1 }} />);
    fireEvent.changeText(screen.getByTestId('setup-name-4'), 'Karan');
    fireEvent(screen.getByTestId('setup-slider'), 'valueChange', 3);
    expect(screen.queryByTestId('setup-name-4')).toBeNull();
    fireEvent(screen.getByTestId('setup-slider'), 'valueChange', 6);
    expect(nameAt(4)).toBe('Karan');
    expect(nameAt(5)).toBe('Player 6');
  });

  it('SN3 a blank or repeated name blocks Start and says why', () => {
    render(<SetupScreen settings={DEFAULT_SETTINGS} onStart={jest.fn()} names={['Ankit', 'Rajiv']} />);
    expect(startEnabled()).toBe(true);
    expect(screen.queryByTestId('setup-name-problem')).toBeNull();

    fireEvent.changeText(screen.getByTestId('setup-name-1'), '   ');
    expect(startEnabled()).toBe(false);
    expect(screen.getByText('Every player needs a name.')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('setup-name-1'), 'ANKIT');
    expect(startEnabled()).toBe(false);
    expect(screen.getByText('Two players are called “ANKIT”.')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('setup-name-1'), 'Rajiv');
    expect(startEnabled()).toBe(true);
  });

  it('SN4 Start hands over the names as typed, trimmed, in seat order', () => {
    const onStart = jest.fn();
    render(<SetupScreen settings={DEFAULT_SETTINGS} onStart={onStart} initial={{ n: 3, u: 1, w: 0 }} />);
    fireEvent.changeText(screen.getByTestId('setup-name-0'), '  Asha ');
    fireEvent.changeText(screen.getByTestId('setup-name-2'), 'Chen');
    fireEvent.press(screen.getByTestId('setup-start'));
    expect(onStart).toHaveBeenCalledWith({ n: 3, u: 1, w: 0 }, ['Asha', 'Player 2', 'Chen']);
  });
});
