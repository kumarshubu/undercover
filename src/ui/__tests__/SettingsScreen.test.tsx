/**
 * Settings — the word list. The picker and the file system need a device, so
 * the upload is swapped for a stub here; the parsing behind it is the real one.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SettingsScreen } from '../SettingsScreen';
import { parseWordList, type WordList } from '../../engine/wordlist';
import type { UploadOutcome } from '../wordStore';
import { DEFAULT_SETTINGS } from '../../engine/types';

jest.mock('../wordStore', () => ({
  uploadWordList: jest.fn(),
  clearWordList: jest.fn(),
}));

const TEXT = 'Pizza / Burger\nonly-one-word\nSun, Moon\nMango | Papaya\n';

const loaded = (): UploadOutcome => {
  const result = parseWordList(TEXT);
  return { kind: 'loaded', list: { name: 'party', pairs: result.pairs }, result };
};

const setup = (outcome: UploadOutcome, wordList: WordList | null = null) => {
  const onChange = jest.fn();
  const onDone = jest.fn();
  const clear = jest.fn();
  render(
    <SettingsScreen
      wordList={wordList}
      builtInCount={1}
      onChange={onChange}
      onDone={onDone}
      upload={() => Promise.resolve(outcome)}
      clear={clear}
    />,
  );
  return { onChange, onDone, clear };
};

const upload = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId('settings-upload'));
  });
};
const text = (id: string) => {
  const c = screen.getByTestId(id).props.children;
  return Array.isArray(c) ? c.join('') : String(c);
};

describe('settings — word list', () => {
  it('ST1 starts on the built-in words, with nothing to remove', () => {
    setup({ kind: 'canceled' });
    expect(text('settings-current')).toBe('Built-in words');
    expect(text('settings-count')).toBe('1 pair');
    expect(screen.queryByTestId('settings-builtin')).toBeNull();
  });

  it('ST2 an upload is taken into use and reported, skipped lines by number', async () => {
    const { onChange } = setup(loaded());
    await upload();

    expect(onChange).toHaveBeenCalledWith({
      name: 'party',
      pairs: [
        { civilianWord: 'Pizza', undercoverWord: 'Burger' },
        { civilianWord: 'Sun', undercoverWord: 'Moon' },
        { civilianWord: 'Mango', undercoverWord: 'Papaya' },
      ],
    });
    expect(screen.getByText('Loaded 3 pairs from “party”.')).toBeTruthy();
    expect(screen.getByText('Skipped 1 line:')).toBeTruthy();
    expect(screen.getByText('Line 2: needs exactly two words, like Coffee / Tea')).toBeTruthy();
  });

  it('ST3 BLOCKER — no word from the list is ever on screen', async () => {
    // Settings can be opened with the table watching.
    const out = loaded();
    const list = out.kind === 'loaded' ? out.list : null;
    const words = list!.pairs.flatMap((p) => [p.civilianWord, p.undercoverWord]);
    const leak = new RegExp(`\\b(${words.join('|')})\\b`, 'i');

    setup(out, list);
    await upload();
    expect(screen.queryByText(leak)).toBeNull();

    // Positive control: the same check does fire when a word is on screen.
    expect(screen.queryAllByText(/\b(Coffee|Tea)\b/).length).toBeGreaterThan(0); // the format example
  });

  it('ST4 a file with no pairs changes nothing and says why', async () => {
    const result = parseWordList('just\nwords\n');
    const { onChange } = setup({ kind: 'empty', name: 'notes', result });
    await upload();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('No word pairs found in “notes”. Nothing changed.')).toBeTruthy();
    expect(screen.getByText('Skipped 2 lines:')).toBeTruthy();
  });

  it('ST5 a file that cannot be read changes nothing', async () => {
    const { onChange } = setup({ kind: 'failed', message: "Couldn't read that file." });
    await upload();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Couldn't read that file. Nothing changed.")).toBeTruthy();
  });

  it('ST6 cancelling the picker changes nothing and says nothing', async () => {
    const { onChange } = setup({ kind: 'canceled' });
    await upload();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('settings-message')).toBeNull();
  });

  it('ST7 a long list of bad lines is summarised, not dumped', async () => {
    const bad = Array.from({ length: 12 }, () => 'nope').join('\n');
    const result = parseWordList(`Pizza / Burger\n${bad}`);
    setup({ kind: 'loaded', list: { name: 'big', pairs: result.pairs }, result });
    await upload();
    expect(screen.getByText('Skipped 12 lines:')).toBeTruthy();
    expect(screen.getAllByText(/^Line \d+:/)).toHaveLength(5);
    expect(screen.getByText('…and 7 more')).toBeTruthy();
  });

  it('ST8 "use built-in words" removes the saved list', () => {
    const list = { name: 'party', pairs: [{ civilianWord: 'A', undercoverWord: 'B' }] };
    const { onChange, clear } = setup({ kind: 'canceled' }, list);
    expect(text('settings-current')).toBe('party');
    fireEvent.press(screen.getByTestId('settings-builtin'));
    expect(clear).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('ST9 done leaves settings', () => {
    const { onDone } = setup({ kind: 'canceled' });
    fireEvent.press(screen.getByTestId('settings-done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('settings — voting', () => {
  const renderVoting = (settings = DEFAULT_SETTINGS) => {
    const onSettingsChange = jest.fn();
    render(
      <SettingsScreen
        wordList={null}
        builtInCount={1}
        onChange={jest.fn()}
        onDone={jest.fn()}
        settings={settings}
        onSettingsChange={onSettingsChange}
        upload={() => Promise.resolve({ kind: 'canceled' })}
        clear={jest.fn()}
      />,
    );
    return { onSettingsChange };
  };

  it('ST10 switching to secret ballot hands back the new rules', () => {
    const { onSettingsChange } = renderVoting();
    expect(screen.getByTestId('settings-vote-tap').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('settings-vote-secret'));
    expect(onSettingsChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, votingMode: 'secretBallot' });
  });

  it('ST11 "players may skip" only shows for secret ballot', () => {
    renderVoting();
    expect(screen.queryByTestId('settings-abstain')).toBeNull();
    screen.unmount();
    const { onSettingsChange } = renderVoting({ ...DEFAULT_SETTINGS, votingMode: 'secretBallot' });
    fireEvent(screen.getByTestId('settings-abstain'), 'valueChange', true);
    expect(onSettingsChange).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      votingMode: 'secretBallot',
      allowAbstain: true,
    });
  });
});
