/**
 * Secret-ballot voting, and the tie it can produce.
 *
 * The phone goes round the living players in seat order. Each one gets a
 * handoff screen and then a private ballot; nobody sees anyone else's vote.
 *
 * Who has voted is read from the engine's ballots rather than tracked here, so
 * a vote the dead zone dropped is never shown as cast. A skip leaves no ballot,
 * so skips alone are remembered on this screen. The handoff button ignores taps
 * for a moment after the phone changes hands — otherwise the last voter's
 * double-tap would open the next person's ballot while they still hold it.
 */

import { useEffect, useRef, useState } from 'react';
import { alivePlayers, tallyBallots } from '../engine/engine';
import { Body, Button, Kicker, Note, Screen, Title } from './parts';
import { DEAD_ZONE_MS } from './RevealScreen';
import { SomeoneLeft, nameOf, type ScreenProps } from './RoundScreens';
import { CandidateList } from './VoteScreen';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function VoteCastScreen({
  state,
  dispatch,
  onSomeoneLeft,
  deadZoneMs = DEAD_ZONE_MS,
}: ScreenProps & { deadZoneMs?: number }) {
  const voters = alivePlayers(state).sort((a, b) => a.seat - b.seat);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const shownAt = useRef(Date.now());

  const done = (id: string) => id in state.ballots || skipped.includes(id);
  const current = voters.find((p) => !done(p.id));
  const doneCount = voters.length - voters.filter((p) => !done(p.id)).length;

  // A new person holds the phone: close the ballot and restart the dead zone.
  useEffect(() => {
    shownAt.current = Date.now();
    setOpen(false);
    setPicked(null);
  }, [current?.id]);

  // Skipping is withdrawn after two rounds in a row with nobody out.
  const canSkip = state.settings.allowAbstain && state.noEliminationStreak < 2;

  if (!current) {
    const cast = Object.keys(state.ballots).length;
    return (
      <Screen testID="ballot-done-screen">
        <Kicker>ROUND {state.round} · SECRET VOTE</Kicker>
        <Title>All votes are in</Title>
        <Body>
          {plural(cast, 'vote')}
          {skipped.length > 0 ? `, ${plural(skipped.length, 'skip')}` : ''}. Put the phone where
          everyone can see it.
        </Body>
        <Button
          testID="ballot-count"
          label="Count the votes"
          onPress={() => dispatch({ type: 'CLOSE_VOTING' })}
        />
      </Screen>
    );
  }

  if (!open) {
    return (
      <Screen testID="ballot-handoff">
        <Kicker>
          SECRET VOTE · {doneCount + 1} OF {voters.length}
        </Kicker>
        <Title testID="ballot-voter">Pass the phone to {current.name}</Title>
        <Button
          testID="ballot-open"
          label={`I'm ${current.name} — vote`}
          onPress={() => {
            if (Date.now() - shownAt.current >= deadZoneMs) setOpen(true);
          }}
        />
        <Note>Everyone else: look away.</Note>
        <SomeoneLeft onPress={onSomeoneLeft} />
      </Screen>
    );
  }

  // During a revote only the tied players can be picked; nobody picks
  // themselves unless the rules allow it.
  const pool = voters.filter(
    (p) =>
      (state.tiedCandidateIds.length === 0 || state.tiedCandidateIds.includes(p.id)) &&
      (state.settings.allowSelfVote || p.id !== current.id),
  );

  return (
    <Screen testID="ballot-screen">
      <Kicker>{current.name.toUpperCase()}'S SECRET VOTE</Kicker>
      <Title>Who's out?</Title>
      {pool.length > 0 ? (
        <>
          <CandidateList
            candidates={pool}
            picked={picked}
            onPick={setPicked}
            testIDPrefix="ballot"
          />
          <Button
            testID="ballot-confirm"
            label={picked ? `Vote for ${nameOf(state, picked)}` : 'Pick a player'}
            disabled={!picked}
            onPress={() => {
              if (picked) dispatch({ type: 'CAST_BALLOT', voterId: current.id, candidateId: picked });
            }}
          />
          {canSkip && (
            <Button
              testID="ballot-skip"
              variant="secondary"
              label="Skip my vote"
              onPress={() => {
                dispatch({ type: 'ABSTAIN', voterId: current.id });
                setSkipped((s) => [...s, current.id]);
              }}
            />
          )}
        </>
      ) : (
        <>
          <Body>There's no one you can vote for this time.</Body>
          <Button
            testID="ballot-pass"
            label="Pass it on"
            onPress={() => setSkipped((s) => [...s, current.id])}
          />
        </>
      )}
    </Screen>
  );
}

export function TieScreen({ state, dispatch, onSomeoneLeft }: ScreenProps) {
  const { counts } = tallyBallots(state);
  const tied = state.tiedCandidateIds;
  const votes = counts[tied[0]] ?? 0;
  const canRevote = state.revoteCount < 2;
  const canSkipRound = state.noEliminationStreak < 2;

  return (
    <Screen testID="tie-screen">
      <Kicker>ROUND {state.round} · TIE</Kicker>
      <Title>It's a tie</Title>
      <Body>
        {tied.map((id) => nameOf(state, id)).join(' and ')} — {plural(votes, 'vote')} each. How do
        you want to settle it?
      </Body>

      <Button
        testID="tie-revote"
        label="Vote again, just between them"
        disabled={!canRevote}
        onPress={() => dispatch({ type: 'RESOLVE_TIE', rule: 'revote' })}
      />
      {!canRevote && <Note>You've voted again twice already.</Note>}
      <Button
        testID="tie-random"
        variant="secondary"
        label="Pick one at random"
        onPress={() => dispatch({ type: 'RESOLVE_TIE', rule: 'random' })}
      />
      <Button
        testID="tie-none"
        variant="secondary"
        label="No one goes out this round"
        disabled={!canSkipRound}
        onPress={() => dispatch({ type: 'RESOLVE_TIE', rule: 'noElimination' })}
      />
      {!canSkipRound && <Note>Two rounds in a row without anyone out — someone has to go.</Note>}
      <SomeoneLeft onPress={onSomeoneLeft} />
    </Screen>
  );
}
