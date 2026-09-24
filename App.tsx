import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RevealScreen } from './src/ui/RevealScreen';
import { SetupScreen } from './src/ui/SetupScreen';
import { newGame } from './src/engine/engine';
import { DEFAULT_SETTINGS, type GameState, type SetupCounts } from './src/engine/types';
import { c, radius, space, type } from './src/ui/theme';

const NAMES = ['Ana','Ben','Cy','Dev','Eve','Fin','Gus','Hal','Ivy','Jo','Kit','Lou','Max','Nel','Oz','Pia','Quin','Rae','Sam','Tay'];
const PAIR = { civilianWord: 'Coffee', undercoverWord: 'Tea' };

/**
 * Temporary shell. Setup, names and word packs are still to come — this exists
 * so the reveal loop can be played on a real device today.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <Game />
    </SafeAreaProvider>
  );
}

function Game() {
  const [game, setGame] = useState<GameState | null>(null);
  const [dealt, setDealt] = useState(false);

  if (!game) {
    return (
      <SafeAreaView style={s.fill}>
        <StatusBar style="light" />
        <SetupScreen
          settings={DEFAULT_SETTINGS}
          onStart={(counts: SetupCounts) =>
            setGame(
              newGame(
                counts,
                NAMES.slice(0, counts.n),
                PAIR,
                Math.floor(Math.random() * 1e9),
              ),
            )
          }
        />
      </SafeAreaView>
    );
  }

  if (!dealt) {
    return (
      <SafeAreaView style={s.fill}>
        <StatusBar style="light" />
        <RevealScreen players={game.players} onDone={() => setDealt(true)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
      <Text style={s.kicker}>EVERYONE HAS THEIR WORD</Text>
      <Text style={s.title}>Talk it out</Text>
      <View style={s.card}>
        <Text style={s.body}>
          Go round the table. Each player says one word describing theirs. Then vote.
        </Text>
        <Text style={s.dim}>The speaking, voting and results screens come next.</Text>
      </View>
      <Pressable
        style={s.primary}
        onPress={() => {
          setGame(null);
          setDealt(false);
        }}
      >
        <Text style={s.primaryText}>New game</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: c.bg },
  root: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(3),
    gap: space(2),
  },
  kicker: { ...type.kicker, color: c.accentInk },
  title: { ...type.hero, color: c.ink },
  body: { ...type.body, color: c.inkDim, textAlign: 'center' },
  dim: { ...type.label, color: c.inkFaint, textAlign: 'center' },
  card: {
    width: '100%',
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space(2.5),
    gap: space(1.5),
  },
  primary: {
    width: '100%',
    paddingVertical: space(2.5),
    borderRadius: radius.pill,
    backgroundColor: c.accent,
    alignItems: 'center',
  },
  primaryText: { ...type.label, color: '#0E0F16', fontSize: 16 },
});
