/**
 * Pieces every in-game screen shares. The setup and reveal screens predate
 * this file and keep their own styles; the round screens build from here so a
 * button looks and sits the same on every step of a round.
 */

import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { c, radius, space, type } from './theme';

export function Screen({ testID, children }: { testID: string; children: ReactNode }) {
  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={s.screen}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <Text style={s.kicker}>{children}</Text>;
}

export function Title({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Text style={s.title} testID={testID} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={s.body}>{children}</Text>;
}

export function Note({ children }: { children: ReactNode }) {
  return <Text style={s.note}>{children}</Text>;
}

export function Button({
  testID,
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        s.button,
        primary ? s.primary : s.secondary,
        disabled && s.off,
        pressed && s.pressed,
      ]}
    >
      <Text style={primary ? s.primaryText : s.secondaryText}>{label}</Text>
    </Pressable>
  );
}

/** A quiet link for rarely-needed actions, so it never competes with the main button. */
export function TextButton({
  testID,
  label,
  onPress,
}: {
  testID: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={12}
      style={({ pressed }) => [s.textButton, pressed && s.pressed]}
    >
      <Text style={s.textButtonText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  textButton: { paddingVertical: space(1), marginTop: space(1) },
  textButtonText: { ...type.label, color: c.inkFaint, textDecorationLine: 'underline' },
  screen: {
    flexGrow: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(3),
    gap: space(2),
  },
  kicker: { ...type.kicker, color: c.accentInk, textAlign: 'center' },
  title: { ...type.hero, color: c.ink, textAlign: 'center' },
  body: { ...type.body, color: c.inkDim, textAlign: 'center' },
  note: { ...type.label, color: c.inkFaint, textAlign: 'center' },

  button: {
    width: '100%',
    paddingVertical: space(2.5),
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  primary: { backgroundColor: c.accent },
  secondary: { borderWidth: 1, borderColor: c.line },
  off: { opacity: 0.35 },
  pressed: { opacity: 0.85 },
  primaryText: { ...type.label, color: '#0E0F16', fontSize: 16 },
  secondaryText: { ...type.label, color: c.inkDim, fontSize: 16 },
});
