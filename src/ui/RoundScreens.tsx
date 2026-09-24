/**
 * The talking part of a round: who starts, one word each, then discussion.
 *
 * From here on the phone lies face up in the middle of the table, so nothing on
 * these screens may carry a secret — names and speaking order only, never a
 * word and never a role.
 */

import { StyleSheet, Text, View } from 'react-native';
import type { GameAction, GameState } from '../engine/types';
import { Body, Button, Kicker, Note, Screen, TextButton, Title } from './parts';
import { c, radius, space, type } from './theme';

export interface ScreenProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
  /** Opens the "who left?" sheet. Offered only while a round is running. */
  onSomeoneLeft?: () => void;
}

export function SomeoneLeft({ onPress }: { onPress?: () => void }) {
  return onPress ? (
    <TextButton testID="someone-left" label="Someone left the game" onPress={onPress} />
  ) : null;
}

export const nameOf = (s: GameState, id: string | null): string =>
  s.players.find((p) => p.id === id)?.name ?? '?';

export function StarterScreen({ state, dispatch, onSomeoneLeft }: ScreenProps) {
  const [first, ...rest] = state.speakingOrder;
  return (
    <Screen testID="starter-screen">
      <Kicker>ROUND {state.round}</Kicker>
      <Title testID="starter-name">{nameOf(state, first)} starts</Title>
      {rest.length > 0 && <Body>Then {rest.map((id) => nameOf(state, id)).join(', ')}.</Body>}
      <Button
        testID="starter-go"
        label="Start describing"
        onPress={() => dispatch({ type: 'BEGIN_ROUND' })}
      />
      <SomeoneLeft onPress={onSomeoneLeft} />
    </Screen>
  );
}

export function DescribeScreen({ state, dispatch, onSomeoneLeft }: ScreenProps) {
  const { speakingOrder: order, turnIndex } = state;
  const isLast = turnIndex === order.length - 1;
  return (
    <Screen testID="describe-screen">
      <Kicker>
        ROUND {state.round} · SPEAKER {turnIndex + 1} OF {order.length}
      </Kicker>
      <Title testID="describe-speaker">{nameOf(state, order[turnIndex])}</Title>
      <Body>One word about your secret word. No repeats.</Body>

      <View style={s.order}>
        {order.map((id, i) => (
          <View
            key={id}
            style={[s.chip, i < turnIndex && s.chipDone, i === turnIndex && s.chipNow]}
          >
            <Text style={[s.chipText, i === turnIndex && s.chipTextNow]}>{nameOf(state, id)}</Text>
          </View>
        ))}
      </View>

      <Button
        testID="describe-next"
        label={isLast ? 'Everyone has spoken' : 'Next speaker'}
        onPress={() => dispatch({ type: 'NEXT_SPEAKER' })}
      />
      <SomeoneLeft onPress={onSomeoneLeft} />
    </Screen>
  );
}

export function DiscussScreen({ state, dispatch, onSomeoneLeft }: ScreenProps) {
  return (
    <Screen testID="discuss-screen">
      <Kicker>ROUND {state.round} · DISCUSS</Kicker>
      <Title>Who's the odd one out?</Title>
      <Body>Talk it over. Accuse, defend, bluff. Vote when the table is ready.</Body>
      <Note>{state.speakingOrder.length} players still in</Note>
      <Button testID="discuss-vote" label="Go to the vote" onPress={() => dispatch({ type: 'OPEN_VOTE' })} />
      <SomeoneLeft onPress={onSomeoneLeft} />
    </Screen>
  );
}

const s = StyleSheet.create({
  order: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space(1),
    marginVertical: space(1),
  },
  chip: {
    paddingVertical: space(0.75),
    paddingHorizontal: space(1.5),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.line,
  },
  chipDone: { opacity: 0.35 },
  chipNow: { backgroundColor: c.accent, borderColor: c.accent },
  chipText: { ...type.label, color: c.inkDim },
  chipTextNow: { color: '#0E0F16' },
});
