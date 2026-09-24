/**
 * "Someone left": take a player out of the game mid-round.
 *
 * Their role stays secret. If leaving ends the game, it ends with no points
 * for anyone — a walkout is not a win. Picking and confirming are two taps,
 * like the vote, because there is no undo.
 */

import { useState } from 'react';
import { alivePlayers } from '../engine/engine';
import type { GameState } from '../engine/types';
import { Body, Button, Kicker, Screen, Title } from './parts';
import { nameOf } from './RoundScreens';
import { CandidateList } from './VoteScreen';

export function LeaveSheet({
  state,
  onLeave,
  onCancel,
}: {
  state: GameState;
  onLeave: (playerId: string) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const living = alivePlayers(state).sort((a, b) => a.seat - b.seat);

  return (
    <Screen testID="leave-sheet">
      <Kicker>SOMEONE LEFT</Kicker>
      <Title>Who left the game?</Title>
      <Body>They're out for the rest of this game. Their role stays secret.</Body>
      <CandidateList candidates={living} picked={picked} onPick={setPicked} testIDPrefix="leave" />
      <Button
        testID="leave-confirm"
        label={picked ? `${nameOf(state, picked)} has left` : 'Pick who left'}
        disabled={!picked}
        onPress={() => {
          if (picked) onLeave(picked);
        }}
      />
      <Button testID="leave-cancel" variant="secondary" label="Cancel" onPress={onCancel} />
    </Screen>
  );
}
