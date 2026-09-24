/**
 * One table's session: owns the game state, picks the screen for each phase,
 * and is the only place actions reach the engine.
 *
 * Every dispatch landing within the dead zone of the last accepted one is
 * dropped. Consecutive screens put their main button in the same place, so
 * without this one fast double-tap skips a speaker, or jumps straight past the
 * elimination reveal nobody has read yet. The engine's phase guards stop a tap
 * from doing something illegal; this stops it doing something unintended.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { reduce } from '../engine/engine';
import type { GameAction, GameState, WordPair } from '../engine/types';
import { Body, Button, Kicker, Screen, Title } from './parts';
import { DEAD_ZONE_MS, RevealScreen } from './RevealScreen';
import { DescribeScreen, DiscussScreen, StarterScreen } from './RoundScreens';
import { VoteScreen } from './VoteScreen';
import {
  EliminationScreen,
  GameOverScreen,
  GuessResultScreen,
  GuessScreen,
} from './OutcomeScreens';

export const randomSeed = () => Math.floor(Math.random() * 1e9);

export interface GameProps {
  initial: GameState;
  /** The word pair dealt when the table plays again. */
  pair: WordPair;
  onNewSetup: () => void;
  /** Test seams: fixed seeds and no dead zone keep widget tests deterministic. */
  nextSeed?: () => number;
  deadZoneMs?: number;
}

export function Game({
  initial,
  pair,
  onNewSetup,
  nextSeed = randomSeed,
  deadZoneMs = DEAD_ZONE_MS,
}: GameProps) {
  const [state, apply] = useReducer(reduce, initial);
  const lastAt = useRef(-Infinity);

  const dispatch = useCallback(
    (action: GameAction) => {
      const now = Date.now();
      if (now - lastAt.current < deadZoneMs) return;
      lastAt.current = now;
      apply(action);
    },
    [deadZoneMs],
  );

  useEffect(() => {
    if (state.phase === 'eliminationReveal') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    } else if (state.phase === 'gameOver') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [state.phase]);

  const props = { state, dispatch };

  switch (state.phase) {
    case 'deal':
      return (
        <RevealScreen
          players={state.players}
          onDone={() => dispatch({ type: 'DEAL_DONE' })}
          deadZoneMs={deadZoneMs}
        />
      );
    case 'starterAnnounce':
      return <StarterScreen {...props} />;
    case 'description':
      return <DescribeScreen {...props} />;
    case 'discussion':
      return <DiscussScreen {...props} />;
    case 'votePick':
      return <VoteScreen key={state.round} {...props} />;
    case 'eliminationReveal':
      return <EliminationScreen {...props} />;
    case 'mrWhiteGuess':
      return <GuessScreen {...props} />;
    case 'mrWhiteGuessResult':
      return <GuessResultScreen {...props} deadZoneMs={deadZoneMs} />;
    case 'gameOver':
      return (
        <GameOverScreen
          state={state}
          onPlayAgain={() => dispatch({ type: 'PLAY_AGAIN', pair, seed: nextSeed() })}
          onNewSetup={onNewSetup}
        />
      );
    case 'setup':
    case 'voteCast':
    case 'voteTie':
      // Secret-ballot voting (and the ties only it can produce) has no screen
      // yet, and nothing in the app can switch it on. Say so rather than
      // render a blank page if that ever changes.
      return (
        <Screen testID="unsupported-screen">
          <Kicker>NOT BUILT YET</Kicker>
          <Title>Secret ballot</Title>
          <Body>This voting mode has no screen yet.</Body>
          <Button testID="unsupported-setup" label="Back to setup" onPress={onNewSetup} />
        </Screen>
      );
  }
}
