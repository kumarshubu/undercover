/**
 * What happens after a vote: the elimination, Mr White's last guess, and the
 * end of the game.
 *
 * Words stay secret until game over. An elimination shows the player's role,
 * never their word, and a wrong Mr White guess does NOT reveal the civilian
 * word — the undercovers still think it is their own, and seeing a different
 * one would tell them which side they are on.
 */

import { useRef, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GameState, Role, Winner } from '../engine/types';
import { Body, Button, Kicker, Note, Screen, Title } from './parts';
import { nameOf, type ScreenProps } from './RoundScreens';
import { DEAD_ZONE_MS } from './RevealScreen';
import { c, radius, space, type } from './theme';

const ROLE: Record<Role, string> = {
  civilian: 'a Civilian',
  undercover: 'an Undercover',
  mrwhite: 'Mr White',
};

const pending = (s: GameState) => s.players.find((p) => p.id === s.pendingEliminationId);

export function EliminationScreen({ state, dispatch }: ScreenProps) {
  const victim = pending(state);
  return (
    <Screen testID="elimination-screen">
      <Kicker>ELIMINATED</Kicker>
      <Title testID="elimination-name">{victim?.name}</Title>
      <Text style={s.role} testID="elimination-role">
        was {victim ? ROLE[victim.role] : '?'}
      </Text>
      {victim?.role === 'mrwhite' && (
        <Body>Mr White gets one guess at the civilians' word. Get it right and they win.</Body>
      )}
      <Button testID="elimination-continue" label="Continue" onPress={() => dispatch({ type: 'CONTINUE' })} />
    </Screen>
  );
}

export function GuessScreen({ state, dispatch }: ScreenProps) {
  const [text, setText] = useState('');
  const ready = text.trim().length > 0;
  const submit = () => {
    if (ready) dispatch({ type: 'SUBMIT_GUESS', text: text.trim() });
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={s.fill}>
      <Screen testID="guess-screen">
        <Kicker>MR WHITE'S LAST CHANCE</Kicker>
        <Title>{nameOf(state, state.pendingEliminationId)}, what's the word?</Title>
        <Body>Guess the civilians' word to win on the spot. Case and accents don't matter.</Body>
        <TextInput
          testID="guess-input"
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          placeholder="Your guess"
          placeholderTextColor={c.inkFaint}
          // Autocorrect would silently turn a right guess into a wrong one.
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          returnKeyType="done"
          accessibilityLabel="Your guess"
          style={s.input}
        />
        <Button testID="guess-submit" label="Lock it in" disabled={!ready} onPress={submit} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

/**
 * Only a WRONG guess lands here — a right one ends the game at once. The table
 * can still count it (a plural, a spelling slip), but that ends the game, so
 * it takes two deliberate taps with a pause between them.
 */
export function GuessResultScreen({
  state,
  dispatch,
  deadZoneMs = DEAD_ZONE_MS,
}: ScreenProps & { deadZoneMs?: number }) {
  const guess = pending(state)?.guess;
  const [confirming, setConfirming] = useState(false);
  const armedAt = useRef(0);

  const override = () => {
    if (!confirming) {
      setConfirming(true);
      armedAt.current = Date.now() + deadZoneMs;
      return;
    }
    if (Date.now() < armedAt.current) return; //   a double-tap is not a decision
    dispatch({ type: 'OVERRIDE_GUESS', correct: true });
  };

  return (
    <Screen testID="guess-result-screen">
      <Kicker>MR WHITE GUESSED</Kicker>
      <Title testID="guess-result-text">“{guess?.text}”</Title>
      <Body>That's not the word.</Body>
      <Note>Civilians: if it really is yours — a plural, a spelling slip — you can count it.</Note>
      <Button
        testID="guess-override"
        variant="secondary"
        label={confirming ? 'Tap again: Mr White wins' : "Actually, that's right"}
        onPress={override}
      />
      <Button testID="guess-continue" label="Continue" onPress={() => dispatch({ type: 'CONTINUE' })} />
    </Screen>
  );
}

const HEADLINE: Record<Winner, string> = {
  civilians: 'Civilians win',
  infiltrators: 'Infiltrators win',
  mrWhiteGuess: 'Mr White wins',
};

export function GameOverScreen({
  state,
  onPlayAgain,
  onNewSetup,
  onShowLeaderboard,
}: {
  state: GameState;
  onPlayAgain: () => void;
  onNewSetup: () => void;
  onShowLeaderboard?: () => void;
}) {
  const earned = (id: string) => (state.scores[id] ?? 0) - (state.scoresAtStart[id] ?? 0);
  const guesser = state.winner === 'mrWhiteGuess' ? pending(state) : undefined;
  // The last one out walked out rather than being voted out: the game ended
  // on a departure, which pays nobody.
  const lastOut = state.players.reduce<(typeof state.players)[number] | undefined>(
    (a, p) => (p.eliminationOrder !== null && (!a || p.eliminationOrder > a.eliminationOrder!) ? p : a),
    undefined,
  );
  const walkout = lastOut?.eliminationCause === 'removed';
  const why = walkout
    ? `Ended when ${lastOut!.name} left. No points this game.`
    : state.winner === 'mrWhiteGuess'
      ? `${guesser?.name} guessed “${guesser?.guess?.text}”.`
      : state.winner === 'civilians'
        ? 'Every Undercover and Mr White is out.'
        : 'The civilians have run out of numbers.';

  return (
    <Screen testID="gameover-screen">
      <Kicker>GAME OVER</Kicker>
      <Title testID="gameover-winner">{state.winner ? HEADLINE[state.winner] : ''}</Title>
      <Body>{why}</Body>

      {/* Game over is the one place words may be shown to the whole table. */}
      <View style={s.words}>
        <Text style={s.wordLabel}>CIVILIANS</Text>
        <Text style={s.word} testID="gameover-civilian-word">
          {state.civilianWord}
        </Text>
        <Text style={s.wordLabel}>UNDERCOVER</Text>
        <Text style={s.word} testID="gameover-undercover-word">
          {state.undercoverWord}
        </Text>
      </View>

      <View style={s.table}>
        {state.players.map((p) => (
          <View key={p.id} style={s.row} testID={`gameover-${p.id}`}>
            <Text style={[s.rowName, p.status !== 'alive' && s.rowOut]}>{p.name}</Text>
            <Text style={s.rowRole}>{ROLE[p.role].replace(/^an? /, '')}</Text>
            <Text style={s.rowScore}>+{earned(p.id)} pts</Text>
          </View>
        ))}
      </View>
      <Note>Points from this game. Totals are on the leaderboard.</Note>

      <Button testID="gameover-again" label="Play again" onPress={onPlayAgain} />
      {onShowLeaderboard && (
        <Button
          testID="gameover-leaderboard"
          variant="secondary"
          label="Leaderboard"
          onPress={onShowLeaderboard}
        />
      )}
      <Button testID="gameover-setup" variant="secondary" label="New setup" onPress={onNewSetup} />
    </Screen>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  role: { ...type.title, color: c.accentInk, textAlign: 'center' },
  input: {
    width: '100%',
    ...type.body,
    fontSize: 22,
    color: c.ink,
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space(2),
    paddingHorizontal: space(2.5),
    textAlign: 'center',
  },
  words: {
    width: '100%',
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space(2),
    alignItems: 'center',
    gap: space(0.5),
  },
  wordLabel: { ...type.kicker, color: c.inkFaint, marginTop: space(0.5) },
  word: { ...type.title, color: c.ink },
  table: { width: '100%', gap: space(0.5) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(1),
    paddingHorizontal: space(1.5),
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  rowName: { ...type.body, fontWeight: '600', color: c.ink, flex: 1 },
  rowOut: { color: c.inkFaint, textDecorationLine: 'line-through' },
  rowRole: { ...type.label, color: c.inkDim, width: 96 },
  rowScore: { ...type.label, color: c.ink, width: 56, textAlign: 'right' },
});
