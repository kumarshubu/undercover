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

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { reduce } from '../engine/engine';
import { gameResults, type PlayerResult } from '../engine/leaderboard';
import type { GameAction, GameState, WordPair } from '../engine/types';
import { Body, Button, Kicker, Screen, Title } from './parts';
import { DEAD_ZONE_MS, RevealScreen } from './RevealScreen';
import { DescribeScreen, DiscussScreen, StarterScreen } from './RoundScreens';
import { VoteScreen } from './VoteScreen';
import { TieScreen, VoteCastScreen } from './BallotScreens';
import { LeaveSheet } from './LeaveSheet';
import { c } from './theme';
import {
  EliminationScreen,
  GameOverScreen,
  GuessResultScreen,
  GuessScreen,
} from './OutcomeScreens';

export const randomSeed = () => Math.floor(Math.random() * 1e9);

export interface GameProps {
  initial: GameState;
  /** Draws the word pair for the next game when the table plays again. */
  nextPair: () => WordPair;
  onNewSetup: () => void;
  /** Called once per finished game, with the points each player won in it. */
  onGameOver?: (results: PlayerResult[]) => void;
  onShowLeaderboard?: () => void;
  /** Test seams: fixed seeds and no dead zone keep widget tests deterministic. */
  nextSeed?: () => number;
  deadZoneMs?: number;
}

export function Game({
  initial,
  nextPair,
  onNewSetup,
  onGameOver,
  onShowLeaderboard,
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

  // Once per finished game: the state object at game over is only replaced by
  // "play again", so remembering which one was recorded makes this idempotent
  // however often React runs the effect.
  const recorded = useRef<GameState | null>(null);
  useEffect(() => {
    if (state.phase === 'gameOver' && recorded.current !== state) {
      recorded.current = state;
      onGameOver?.(gameResults(state));
    }
  }, [state, onGameOver]);

  useEffect(() => {
    if (state.phase === 'eliminationReveal') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    } else if (state.phase === 'gameOver') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [state.phase]);

  // "Someone left" is offered on the screens where a round is running; the
  // sheet sits over the game so nothing underneath is lost.
  const [leaving, setLeaving] = useState(false);
  const props = { state, dispatch, onSomeoneLeft: () => setLeaving(true) };

  return (
    <>
      {screenFor(props, { nextPair, nextSeed, deadZoneMs, onNewSetup, onShowLeaderboard })}
      <Modal
        visible={leaving}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLeaving(false)}
      >
        <View style={s.fill}>
          <LeaveSheet
            state={state}
            onLeave={(playerId) => {
              dispatch({ type: 'REMOVE_PLAYER', playerId });
              setLeaving(false);
            }}
            onCancel={() => setLeaving(false)}
          />
        </View>
      </Modal>
    </>
  );
}

function screenFor(
  props: { state: GameState; dispatch: (a: GameAction) => void; onSomeoneLeft: () => void },
  opts: {
    nextPair: () => WordPair;
    nextSeed: () => number;
    deadZoneMs: number;
    onNewSetup: () => void;
    onShowLeaderboard?: () => void;
  },
) {
  const { state, dispatch } = props;
  const { nextPair, nextSeed, deadZoneMs, onNewSetup, onShowLeaderboard } = opts;
  const quiet = { state, dispatch }; //  screens where nobody can leave mid-step

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
    case 'voteCast':
      return (
        <VoteCastScreen
          key={`${state.round}-${state.revoteCount}`}
          {...props}
          deadZoneMs={deadZoneMs}
        />
      );
    case 'voteTie':
      return <TieScreen {...props} />;
    case 'eliminationReveal':
      return <EliminationScreen {...quiet} />;
    case 'mrWhiteGuess':
      return <GuessScreen {...quiet} />;
    case 'mrWhiteGuessResult':
      return <GuessResultScreen {...quiet} deadZoneMs={deadZoneMs} />;
    case 'gameOver':
      return (
        <GameOverScreen
          state={state}
          onPlayAgain={() => dispatch({ type: 'PLAY_AGAIN', pair: nextPair(), seed: nextSeed() })}
          onNewSetup={onNewSetup}
          onShowLeaderboard={onShowLeaderboard}
        />
      );
    case 'setup':
      // No game starts here — setup lives outside Game. Say so rather than
      // render a blank page if that ever changes.
      return (
        <Screen testID="unsupported-screen">
          <Kicker>NOTHING TO SHOW</Kicker>
          <Title>Back to setup</Title>
          <Body>This game hasn't been dealt.</Body>
          <Button testID="unsupported-setup" label="Back to setup" onPress={onNewSetup} />
        </Screen>
      );
  }
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: c.bg },
});
