/**
 * The leaderboard: everyone who has played on this phone, ranked by points.
 *
 * Resetting wipes every game ever recorded, so it takes two taps with a pause
 * between them — the same guard as counting Mr White's guess.
 */

import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ranked, type Leaderboard } from '../engine/leaderboard';
import { Body, Button, Kicker, Note, Screen, Title } from './parts';
import { DEAD_ZONE_MS } from './RevealScreen';
import { c, radius, space, type } from './theme';

export interface LeaderboardScreenProps {
  board: Leaderboard;
  onReset: () => void;
  onDone: () => void;
  deadZoneMs?: number;
}

export function LeaderboardScreen({
  board,
  onReset,
  onDone,
  deadZoneMs = DEAD_ZONE_MS,
}: LeaderboardScreenProps) {
  const rows = ranked(board);
  const [confirming, setConfirming] = useState(false);
  const armedAt = useRef(0);

  const reset = () => {
    if (!confirming) {
      setConfirming(true);
      armedAt.current = Date.now() + deadZoneMs;
      return;
    }
    if (Date.now() < armedAt.current) return; //   a double-tap is not a decision
    setConfirming(false);
    onReset();
  };

  return (
    <Screen testID="leaderboard-screen">
      <Kicker>ALL GAMES ON THIS PHONE</Kicker>
      <Title>Leaderboard</Title>

      {rows.length === 0 ? (
        <Body>No games finished yet. Play one and the points show up here.</Body>
      ) : (
        <View style={s.table}>
          <View style={[s.row, s.head]}>
            <Text style={[s.rank, s.headText]}>#</Text>
            <Text style={[s.name, s.headText]}>PLAYER</Text>
            <Text style={[s.num, s.headText]}>WINS</Text>
            <Text style={[s.num, s.headText]}>GAMES</Text>
            <Text style={[s.pts, s.headText]}>PTS</Text>
          </View>
          {rows.map((r, i) => (
            <View key={r.name} style={[s.row, i === 0 && s.leader]} testID={`leaderboard-row-${i}`}>
              <Text style={s.rank}>{i + 1}</Text>
              <Text style={s.name} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={s.num}>{r.wins}</Text>
              <Text style={s.num}>{r.games}</Text>
              <Text style={s.pts}>{r.points}</Text>
            </View>
          ))}
        </View>
      )}

      <Note>Civilians win 2 points each, Undercovers 10, Mr White 6.</Note>

      <Button testID="leaderboard-done" label="Done" onPress={onDone} />
      {rows.length > 0 && (
        <Button
          testID="leaderboard-reset"
          variant="secondary"
          label={confirming ? 'Tap again to wipe every score' : 'Reset leaderboard'}
          onPress={reset}
        />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  table: {
    width: '100%',
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(1.25),
    paddingHorizontal: space(1.5),
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  head: { backgroundColor: c.surfaceAlt },
  headText: { ...type.kicker, color: c.inkFaint },
  leader: { backgroundColor: '#2A2C45' },
  rank: { ...type.label, color: c.inkDim, width: 24 },
  name: { ...type.body, fontWeight: '600', color: c.ink, flex: 1 },
  // Wide enough for "GAMES" in the spaced-out header style on one line.
  num: { ...type.label, color: c.inkDim, width: 64, textAlign: 'right' },
  pts: { ...type.label, fontSize: 16, color: c.ink, width: 48, textAlign: 'right' },
});
