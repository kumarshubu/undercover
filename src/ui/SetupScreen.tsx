/**
 * Setup: how many players, and how many of them are infiltrators.
 *
 * Every button state here is DERIVED from the engine's one validity rule
 * (isValidSetup) rather than hand-written. That is what keeps the buttons and
 * the clamp from disagreeing — the failure mode where a setting is legal but
 * the +/- that reaches it is greyed out, or worse, the reverse.
 *
 * Civilians are never edited directly. They are whatever is left over, which is
 * why that pill has no steppers.
 *
 * Names are typed in seating order, because that is the order people speak in.
 * Every seat always shows a name — the one saved from last time, or "Player N"
 * — so what is on screen is exactly who plays.
 */

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  canDecMrWhite,
  canDecUndercover,
  canIncMrWhite,
  canIncUndercover,
  civilianCount,
  clampRoles,
  defaultRoles,
  isValidSetup,
  nameProblem,
} from '../engine/setup';
import type { SetupCounts, Settings } from '../engine/types';
import { c, radius, space, type } from './theme';

export interface SetupScreenProps {
  settings: Settings;
  /** Called with the counts and one trimmed name per seat, in seating order. */
  onStart: (counts: SetupCounts, names: string[]) => void;
  initial?: SetupCounts;
  /** Names saved from last time, seat by seat. */
  names?: readonly string[];
  /** Shown only when given, so the screen still stands alone in tests. */
  onOpenSettings?: () => void;
  onOpenLeaderboard?: () => void;
}

const seatName = (i: number) => `Player ${i + 1}`;

export function SetupScreen({
  settings,
  onStart,
  initial,
  names,
  onOpenSettings,
  onOpenLeaderboard,
}: SetupScreenProps) {
  const flag = settings.allowNonMajorityCivilians;
  const [counts, setCounts] = useState<SetupCounts>(initial ?? defaultRoles(5, flag));
  const [roster, setRoster] = useState<string[]>(() => [...(names ?? [])]);

  const tick = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const setPlayers = useCallback(
    (n: number) => {
      // Re-clamp on every slider step: shedding Mr Whites before Undercovers,
      // so shrinking the table never lands on an illegal split.
      setCounts((prev) => clampRoles({ ...prev, n: Math.round(n) }, flag));
    },
    [flag],
  );

  const bump = useCallback(
    (key: 'u' | 'w', delta: number) => {
      setCounts((prev) => {
        const next = { ...prev, [key]: prev[key] + delta };
        if (!isValidSetup(next, flag)) return prev;
        return next;
      });
      tick();
    },
    [flag, tick],
  );

  const setName = useCallback((seat: number, name: string) => {
    setRoster((prev) => {
      const next = [...prev];
      for (let i = next.length; i < seat; i++) next[i] = seatName(i);
      next[seat] = name;
      return next;
    });
  }, []);

  const c_ = civilianCount(counts);
  const shown = Array.from({ length: counts.n }, (_, i) => roster[i] ?? seatName(i));
  const problem = nameProblem(shown);
  const canStart = isValidSetup(counts, flag) && problem === null;

  return (
    <ScrollView
      contentContainerStyle={s.scroll}
      testID="setup-screen"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={s.kicker}>WHO'S PLAYING</Text>
      <Text style={s.players} testID="setup-player-count">
        Players: {counts.n}
      </Text>

      <Slider
        testID="setup-slider"
        style={s.slider}
        minimumValue={MIN_PLAYERS}
        maximumValue={MAX_PLAYERS}
        step={1}
        value={counts.n}
        onValueChange={setPlayers}
        minimumTrackTintColor={c.accent}
        maximumTrackTintColor={c.line}
        thumbTintColor={c.ink}
        accessibilityLabel={`Number of players: ${counts.n}`}
      />

      <View style={s.card}>
        {/* Computed, never edited — hence no steppers on this row. */}
        <View style={s.row}>
          <View style={s.stepperGap} />
          <View style={[s.pill, s.pillCivilian]}>
            <Text style={s.pillTextLight} testID="setup-civilians">
              {c_} {c_ === 1 ? 'Civilian' : 'Civilians'}
            </Text>
          </View>
          <View style={s.stepperGap} />
        </View>

        <RoleRow
          testIDPrefix="setup-undercover"
          label={counts.u === 1 ? 'Undercover' : 'Undercovers'}
          count={counts.u}
          pillStyle={s.pillUndercover}
          textStyle={s.pillTextLight}
          canDec={canDecUndercover(counts, flag)}
          canInc={canIncUndercover(counts, flag)}
          onDec={() => bump('u', -1)}
          onInc={() => bump('u', +1)}
        />

        <RoleRow
          testIDPrefix="setup-mrwhite"
          label="Mr White"
          count={counts.w}
          pillStyle={s.pillMrWhite}
          textStyle={s.pillTextDark}
          canDec={canDecMrWhite(counts, flag)}
          canInc={canIncMrWhite(counts, flag)}
          onDec={() => bump('w', -1)}
          onInc={() => bump('w', +1)}
        />
      </View>

      <Text style={s.hint}>
        Civilians are whatever's left. They always outnumber the rest.
      </Text>

      <View style={s.names}>
        <Text style={s.namesHead}>NAMES · IN SEATING ORDER</Text>
        {shown.map((name, i) => (
          <View key={i} style={s.nameRow}>
            <Text style={s.seat}>{i + 1}</Text>
            <TextInput
              testID={`setup-name-${i}`}
              value={name}
              onChangeText={(v) => setName(i, v)}
              maxLength={MAX_NAME_LENGTH}
              placeholder={seatName(i)}
              placeholderTextColor={c.inkFaint}
              autoCorrect={false}
              autoCapitalize="words"
              selectTextOnFocus
              returnKeyType="done"
              accessibilityLabel={`Name of player ${i + 1}`}
              style={s.nameInput}
            />
          </View>
        ))}
        {problem && (
          <Text style={s.problem} testID="setup-name-problem">
            {problem}
          </Text>
        )}
      </View>

      <Pressable
        testID="setup-start"
        disabled={!canStart}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onStart(counts, shown.map((n) => n.trim()));
        }}
        style={({ pressed }) => [s.start, !canStart && s.startOff, pressed && s.pressed]}
      >
        <Text style={s.startText}>Start</Text>
      </Pressable>

      <View style={s.links}>
        {onOpenLeaderboard && (
          <Pressable
            testID="setup-leaderboard"
            onPress={onOpenLeaderboard}
            accessibilityRole="button"
            style={({ pressed }) => [s.settings, pressed && s.pressed]}
          >
            <Text style={s.settingsText}>Leaderboard</Text>
          </Pressable>
        )}
        {onOpenSettings && (
          <Pressable
            testID="setup-settings"
            onPress={onOpenSettings}
            accessibilityRole="button"
            style={({ pressed }) => [s.settings, pressed && s.pressed]}
          >
            <Text style={s.settingsText}>Settings</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

function RoleRow({
  testIDPrefix,
  label,
  count,
  pillStyle,
  textStyle,
  canDec,
  canInc,
  onDec,
  onInc,
}: {
  testIDPrefix: string;
  label: string;
  count: number;
  pillStyle: object;
  textStyle: object;
  canDec: boolean;
  canInc: boolean;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View style={s.row}>
      <Stepper
        testID={`${testIDPrefix}-dec`}
        sign="−"
        enabled={canDec}
        onPress={onDec}
        label={`One fewer ${label}`}
      />
      <View style={[s.pill, pillStyle]}>
        <Text style={[s.pillBase, textStyle]} testID={`${testIDPrefix}-count`}>
          {count} {label}
        </Text>
      </View>
      <Stepper
        testID={`${testIDPrefix}-inc`}
        sign="+"
        enabled={canInc}
        onPress={onInc}
        label={`One more ${label}`}
      />
    </View>
  );
}

function Stepper({
  testID,
  sign,
  enabled,
  onPress,
  label,
}: {
  testID: string;
  sign: string;
  enabled: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      testID={testID}
      disabled={!enabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      style={({ pressed }) => [s.stepper, !enabled && s.stepperOff, pressed && s.pressed]}
    >
      <Text style={[s.stepperText, !enabled && s.stepperTextOff]}>{sign}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(3),
    gap: space(2),
  },
  kicker: { ...type.kicker, color: c.accentInk },
  players: { ...type.hero, color: c.ink },
  slider: { width: '100%', height: 40 },

  card: {
    width: '100%',
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space(2),
    gap: space(1.5),
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },

  pill: {
    flex: 1,
    paddingVertical: space(1.5),
    paddingHorizontal: space(2),
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  pillBase: { ...type.label, fontSize: 16 },
  pillCivilian: { backgroundColor: c.accent },
  pillUndercover: { backgroundColor: '#2A2D3A', borderWidth: 1, borderColor: c.line },
  pillMrWhite: { backgroundColor: c.ink },
  pillTextLight: { ...type.label, fontSize: 16, color: c.ink },
  pillTextDark: { color: '#12131A' },

  stepper: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGap: { width: 40, height: 40 },
  stepperOff: { opacity: 0.25 },
  stepperText: { color: c.ink, fontSize: 22, lineHeight: 26, fontWeight: '600' },
  stepperTextOff: { color: c.inkFaint },

  hint: { ...type.label, color: c.inkFaint, textAlign: 'center' },

  start: {
    width: '100%',
    paddingVertical: space(2.5),
    borderRadius: radius.pill,
    backgroundColor: c.ok,
    alignItems: 'center',
    marginTop: space(1),
  },
  startOff: { opacity: 0.35 },
  startText: { ...type.label, fontSize: 18, color: '#0E0F16' },
  names: { width: '100%', gap: space(1), marginTop: space(1) },
  namesHead: { ...type.kicker, color: c.accentInk, textAlign: 'center', marginBottom: space(0.5) },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  seat: { ...type.label, color: c.inkFaint, width: 24, textAlign: 'right' },
  nameInput: {
    flex: 1,
    ...type.body,
    color: c.ink,
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: space(1.25),
    paddingHorizontal: space(1.5),
  },
  problem: { ...type.label, color: c.danger, textAlign: 'center' },
  links: { width: '100%', flexDirection: 'row', gap: space(1.5) },
  settings: {
    flex: 1,
    paddingVertical: space(2),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
  },
  settingsText: { ...type.label, fontSize: 16, color: c.inkDim },
  pressed: { opacity: 0.85 },
});
