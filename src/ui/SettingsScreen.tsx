/**
 * Settings: how the table votes, and which word list the games draw from.
 *
 * This screen may be opened with the table watching, so it never shows a word
 * from the list — only its name and size. Skipped lines are reported by line
 * number and reason, not by content.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { Settings } from '../engine/types';
import type { SkippedLine, WordList } from '../engine/wordlist';
import { Body, Button, Kicker, Note, Screen, Title } from './parts';
import { c, radius, space, type } from './theme';
import { clearWordList, uploadWordList, type UploadOutcome } from './wordStore';

/** How many skipped lines to list before summarising the rest. */
const SHOW_SKIPPED = 5;

export interface SettingsScreenProps {
  wordList: WordList | null;
  builtInCount: number;
  onChange: (list: WordList | null) => void;
  onDone: () => void;
  /** The voting rules. The section only shows when both are given. */
  settings?: Settings;
  onSettingsChange?: (settings: Settings) => void;
  /** Test seams: the real picker and file system need a device. */
  upload?: () => Promise<UploadOutcome>;
  clear?: () => void;
}

interface Message {
  tone: 'ok' | 'error';
  text: string;
  skipped: SkippedLine[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function SettingsScreen({
  wordList,
  builtInCount,
  onChange,
  onDone,
  settings,
  onSettingsChange,
  upload = uploadWordList,
  clear = clearWordList,
}: SettingsScreenProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const doUpload = async () => {
    setBusy(true);
    try {
      const out = await upload();
      if (out.kind === 'failed') {
        setMessage({ tone: 'error', text: `${out.message} Nothing changed.`, skipped: [] });
      } else if (out.kind === 'empty') {
        setMessage({
          tone: 'error',
          text: `No word pairs found in “${out.name}”. Nothing changed.`,
          skipped: out.result.skipped,
        });
      } else if (out.kind === 'loaded') {
        onChange(out.list);
        setMessage({
          tone: 'ok',
          text: `Loaded ${plural(out.list.pairs.length, 'pair')} from “${out.list.name}”.`,
          skipped: out.result.skipped,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const useBuiltIn = () => {
    try {
      clear();
    } catch {
      setMessage({ tone: 'error', text: "Couldn't remove the saved list.", skipped: [] });
      return;
    }
    onChange(null);
    setMessage({ tone: 'ok', text: 'Back to the built-in words.', skipped: [] });
  };

  return (
    <Screen testID="settings-screen">
      <Kicker>SETTINGS</Kicker>
      <Title>Settings</Title>

      {settings && onSettingsChange && (
        <View style={s.section}>
          <Text style={s.sectionHead}>VOTING</Text>
          <View style={s.segment}>
            {(
              [
                ['groupTap', 'Out loud', 'settings-vote-tap'],
                ['secretBallot', 'Secret ballot', 'settings-vote-secret'],
              ] as const
            ).map(([mode, label, id]) => {
              const selected = settings.votingMode === mode;
              return (
                <Pressable
                  key={mode}
                  testID={id}
                  onPress={() => onSettingsChange({ ...settings, votingMode: mode })}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[s.segmentItem, selected && s.segmentOn]}
                >
                  <Text style={[s.segmentText, selected && s.segmentTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Note>
            {settings.votingMode === 'groupTap'
              ? 'The table agrees on who goes out, then one person taps them.'
              : 'The phone goes round and everyone votes in private. Most votes goes out.'}
          </Note>
          {settings.votingMode === 'secretBallot' && (
            <View style={s.switchRow}>
              <Text style={s.switchLabel}>Players may skip their vote</Text>
              <Switch
                testID="settings-abstain"
                value={settings.allowAbstain}
                onValueChange={(v) => onSettingsChange({ ...settings, allowAbstain: v })}
                trackColor={{ true: c.accent, false: c.line }}
              />
            </View>
          )}
        </View>
      )}

      <Text style={s.sectionHead}>WORD LIST</Text>

      <View style={s.card}>
        <Text style={s.label}>IN USE</Text>
        <Text style={s.current} testID="settings-current">
          {wordList ? wordList.name : 'Built-in words'}
        </Text>
        <Text style={s.count} testID="settings-count">
          {plural(wordList ? wordList.pairs.length : builtInCount, 'pair')}
        </Text>
      </View>

      <Body>Upload a text or CSV file with one pair per line:</Body>
      <View style={s.example}>
        <Text style={s.exampleText}>{'Coffee / Tea\nCat, Dog\nTrain, Metro'}</Text>
      </View>
      <Note>From Excel or Google Sheets, put the pairs in two columns and export as CSV. Each game draws a random pair.</Note>

      {message && (
        <View
          testID="settings-message"
          style={[s.message, message.tone === 'error' ? s.messageError : s.messageOk]}
        >
          <Text style={s.messageText}>{message.text}</Text>
          {message.skipped.length > 0 && (
            <>
              <Text style={s.skippedHead}>
                Skipped {plural(message.skipped.length, 'line')}:
              </Text>
              {message.skipped.slice(0, SHOW_SKIPPED).map((sk) => (
                <Text key={sk.line} style={s.skipped}>
                  Line {sk.line}: {sk.reason}
                </Text>
              ))}
              {message.skipped.length > SHOW_SKIPPED && (
                <Text style={s.skipped}>…and {message.skipped.length - SHOW_SKIPPED} more</Text>
              )}
            </>
          )}
        </View>
      )}

      <Button
        testID="settings-upload"
        label={busy ? 'Opening…' : 'Upload word list'}
        disabled={busy}
        onPress={doUpload}
      />
      {wordList && (
        <Button
          testID="settings-builtin"
          variant="secondary"
          label="Use built-in words"
          onPress={useBuiltIn}
        />
      )}
      <Button testID="settings-done" variant="secondary" label="Done" onPress={onDone} />
    </Screen>
  );
}

const s = StyleSheet.create({
  section: { width: '100%', gap: space(1.5), marginBottom: space(1) },
  sectionHead: { ...type.kicker, color: c.accentInk, textAlign: 'center' },
  segment: {
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: radius.pill,
    padding: space(0.5),
  },
  segmentItem: { flex: 1, paddingVertical: space(1.25), borderRadius: radius.pill, alignItems: 'center' },
  segmentOn: { backgroundColor: c.accent },
  segmentText: { ...type.label, fontSize: 15, color: c.inkDim },
  segmentTextOn: { color: '#0E0F16' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space(1),
    paddingHorizontal: space(2),
  },
  switchLabel: { ...type.body, color: c.ink },
  card: {
    width: '100%',
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space(2),
    alignItems: 'center',
    gap: space(0.5),
  },
  label: { ...type.kicker, color: c.inkFaint },
  current: { ...type.title, color: c.ink, textAlign: 'center' },
  count: { ...type.label, color: c.inkDim },
  example: {
    width: '100%',
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.sm,
    padding: space(1.5),
  },
  exampleText: { ...type.body, color: c.inkDim, fontFamily: 'Menlo', textAlign: 'center' },
  message: { width: '100%', borderRadius: radius.md, borderWidth: 1, padding: space(1.5), gap: space(0.5) },
  messageOk: { borderColor: c.ok },
  messageError: { borderColor: c.danger },
  messageText: { ...type.body, color: c.ink },
  skippedHead: { ...type.label, color: c.inkDim, marginTop: space(0.5) },
  skipped: { ...type.label, color: c.inkFaint },
});
