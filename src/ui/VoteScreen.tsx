/**
 * Group-tap voting: the table agrees out loud, then one person taps the player
 * who is out.
 *
 * Picking and eliminating are two separate taps. One tap straight on a name
 * would put a player out on a mis-tap, with no way back.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alivePlayers } from '../engine/engine';
import { Body, Button, Kicker, Screen, Title } from './parts';
import { nameOf, type ScreenProps } from './RoundScreens';
import { c, radius, space, type } from './theme';

export function VoteScreen({ state, dispatch }: ScreenProps) {
  const [picked, setPicked] = useState<string | null>(null);

  // During a revote only the tied players can be picked — the engine refuses
  // anyone else, so offering them would be a button that does nothing.
  const candidates = alivePlayers(state).filter(
    (p) => state.tiedCandidateIds.length === 0 || state.tiedCandidateIds.includes(p.id),
  );

  return (
    <Screen testID="vote-screen">
      <Kicker>ROUND {state.round} · VOTE</Kicker>
      <Title>Who's out?</Title>
      <Body>Agree as a table, then pick that player.</Body>

      <View style={s.list}>
        {candidates.map((p) => {
          const selected = p.id === picked;
          return (
            <Pressable
              key={p.id}
              testID={`vote-${p.id}`}
              onPress={() => setPicked(selected ? null : p.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [s.row, selected && s.rowPicked, pressed && s.pressed]}
            >
              <Text style={[s.rowText, selected && s.rowTextPicked]}>{p.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Button
        testID="vote-confirm"
        label={picked ? `Eliminate ${nameOf(state, picked)}` : 'Pick a player'}
        disabled={!picked}
        onPress={() => {
          if (picked) dispatch({ type: 'TAP_ELIMINATE', candidateId: picked });
        }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { width: '100%', gap: space(1) },
  row: {
    width: '100%',
    paddingVertical: space(1.75),
    paddingHorizontal: space(2.5),
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
  },
  rowPicked: { backgroundColor: c.danger, borderColor: c.danger },
  pressed: { opacity: 0.85 },
  rowText: { ...type.body, fontWeight: '600', color: c.ink },
  rowTextPicked: { color: '#0E0F16' },
});
