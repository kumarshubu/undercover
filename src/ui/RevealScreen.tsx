/**
 * The pass-and-play reveal loop. The phone goes round the table and each player
 * sees their own word and nobody else's.
 *
 * Three safety rules drive the whole design:
 *
 *  1. HOLD, don't tap. Release covers it instantly, so a dropped or grabbed
 *     phone re-covers itself. A toggle would leave the word up.
 *
 *  2. When covered, the word is NOT IN THE TREE. Not hidden, not zero-opacity,
 *     not behind an overlay — absent. That is the actual defence, and it is
 *     what the test asserts.
 *
 *  3. A dead zone after each handoff. Without it a fast double-tap advances two
 *     players and the counter is wrong for the rest of the deal.
 *
 * On iOS a still screenshot cannot be blocked at all. The hold is what protects
 * the word, so it must be the strong part rather than a formality.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { c, radius, space, type } from './theme';
import type { Player } from '../engine/types';

/** Time after a handoff during which taps are ignored. */
export const DEAD_ZONE_MS = 350;

type Step = 'handoff' | 'card';

export interface RevealScreenProps {
  players: Player[];
  /** Called once every player has confirmed they have seen their word. */
  onDone: () => void;
  /** Test seam: skip the dead zone so widget tests do not have to wait. */
  deadZoneMs?: number;
}

export function RevealScreen({ players, onDone, deadZoneMs = DEAD_ZONE_MS }: RevealScreenProps) {
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>('handoff');
  const [held, setHeld] = useState(false);
  const [armed, setArmed] = useState(false);

  const player = players[index];
  const isLast = index === players.length - 1;

  // Arm after the dead zone. Any tap landing before this is ignored, which is
  // what stops a double-tap from mounting the next player's card while the
  // previous player is still holding the phone.
  useEffect(() => {
    // A zero dead zone must arm synchronously. Going through a 0ms timer leaves
    // the control dead until the next tick, which is a real (if brief) hole.
    if (deadZoneMs <= 0) {
      setArmed(true);
      return;
    }
    setArmed(false);
    const t = setTimeout(() => setArmed(true), deadZoneMs);
    return () => clearTimeout(t);
  }, [index, step, deadZoneMs]);

  // Releasing must always cover the word, even if the finger leaves the button.
  useEffect(() => {
    if (step !== 'card') setHeld(false);
  }, [step]);

  const show = useCallback(() => {
    if (!armed) return;
    setHeld(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [armed]);

  const hide = useCallback(() => setHeld(false), []);

  const openCard = useCallback(() => {
    if (!armed) return;
    setStep('card');
  }, [armed]);

  const confirm = useCallback(() => {
    if (!armed) return;
    setHeld(false);
    if (isLast) {
      onDone();
      return;
    }
    setIndex((i) => i + 1);
    setStep('handoff');
  }, [armed, isLast, onDone]);

  if (step === 'handoff') {
    return (
      <View style={s.root} testID="reveal-handoff">
        <Text style={s.kicker}>PASS THE PHONE TO</Text>
        <Text style={s.name} accessibilityRole="header">
          {player.name}
        </Text>
        <Text style={s.counter}>
          {index + 1} of {players.length}
        </Text>
        <Pressable
          testID="reveal-open"
          onPress={openCard}
          accessibilityRole="button"
          accessibilityLabel={`I am ${player.name}. Show my word.`}
          style={({ pressed }) => [s.primary, pressed && s.primaryPressed]}
        >
          <Text style={s.primaryText}>I'm {player.name} — show my word</Text>
        </Pressable>
        <Text style={s.foot}>Everyone else: look away.</Text>
      </View>
    );
  }

  return (
    <View style={s.root} testID="reveal-card">
      <Text style={s.kicker}>{player.name.toUpperCase()}</Text>

      <Card word={held ? player.word : null} isMrWhite={player.word === null} held={held} />

      <Pressable
        testID="reveal-hold"
        onPressIn={show}
        onPressOut={hide}
        delayLongPress={0}
        accessibilityRole="button"
        accessibilityLabel="Hold to see your secret word"
        accessibilityHint="Your word shows while you hold, and hides the moment you let go"
        style={({ pressed }) => [s.hold, pressed && s.holdActive]}
      >
        <Text style={s.holdText}>{held ? 'Release to hide' : 'Hold to reveal'}</Text>
      </Pressable>

      <Pressable
        testID="reveal-confirm"
        onPress={confirm}
        accessibilityRole="button"
        style={({ pressed }) => [s.secondary, pressed && s.primaryPressed]}
      >
        <Text style={s.secondaryText}>{isLast ? "Everyone's ready" : "I've got it"}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The card. Nothing here may vary by role except the word itself — same size,
 * same colour, same border, same everything. Only Mr White's card names a role,
 * because an empty card has to explain itself.
 */
function Card({
  word,
  isMrWhite,
  held,
}: {
  word: string | null;
  isMrWhite: boolean;
  held: boolean;
}) {
  if (!held) {
    return (
      <View style={s.card} testID="reveal-card-covered">
        <Text style={s.covered}>· · · · ·</Text>
      </View>
    );
  }
  if (isMrWhite) {
    return (
      <View style={s.card} testID="reveal-card-open">
        <Text style={s.mrWhite}>No word.</Text>
        <Text style={s.mrWhiteSub}>You're Mr White. Blend in.</Text>
      </View>
    );
  }
  return (
    <View style={s.card} testID="reveal-card-open">
      {/* Only the word. No role label, ever — see the module header. */}
      <Text style={s.word} testID="reveal-word">
        {word}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(3),
    gap: space(2),
  },
  kicker: { ...type.kicker, color: c.accentInk },
  name: { ...type.hero, color: c.ink, textAlign: 'center' },
  counter: { ...type.label, color: c.inkFaint },
  foot: { ...type.label, color: c.inkFaint, marginTop: space(1) },

  card: {
    width: '100%',
    minHeight: 220,
    backgroundColor: c.card,
    borderColor: c.cardEdge,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(3),
    gap: space(1),
  },
  covered: { fontSize: 30, color: c.inkFaint, letterSpacing: 6 },
  word: { ...type.word, color: c.ink, textAlign: 'center' },
  mrWhite: { ...type.title, color: c.inkDim, fontStyle: 'italic' },
  mrWhiteSub: { ...type.label, color: c.inkFaint, textAlign: 'center' },

  hold: {
    width: '100%',
    paddingVertical: space(2.5),
    borderRadius: radius.pill,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
  },
  holdActive: { backgroundColor: c.accent, borderColor: c.accent },
  holdText: { ...type.label, color: c.ink },

  primary: {
    width: '100%',
    paddingVertical: space(2.5),
    borderRadius: radius.pill,
    backgroundColor: c.accent,
    alignItems: 'center',
  },
  primaryPressed: { opacity: 0.85 },
  primaryText: { ...type.label, color: '#0E0F16', fontSize: 16 },

  secondary: {
    width: '100%',
    paddingVertical: space(2),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
  },
  secondaryText: { ...type.label, color: c.inkDim },
});
