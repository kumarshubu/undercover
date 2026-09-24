import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Game, randomSeed } from './src/ui/Game';
import { SetupScreen } from './src/ui/SetupScreen';
import { newGame } from './src/engine/engine';
import { DEFAULT_SETTINGS, type GameState, type SetupCounts } from './src/engine/types';
import { c } from './src/ui/theme';

const NAMES = ['Ana','Ben','Cy','Dev','Eve','Fin','Gus','Hal','Ivy','Jo','Kit','Lou','Max','Nel','Oz','Pia','Quin','Rae','Sam','Tay'];
const PAIR = { civilianWord: 'Coffee', undercoverWord: 'Tea' };

/**
 * Player names and word packs are still to come — until then every game uses
 * placeholder names and the one pair above.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={s.fill}>
        <Session />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Session() {
  const [game, setGame] = useState<GameState | null>(null);

  if (!game) {
    return (
      <SetupScreen
        settings={DEFAULT_SETTINGS}
        onStart={(counts: SetupCounts) =>
          setGame(newGame(counts, NAMES.slice(0, counts.n), PAIR, randomSeed()))
        }
      />
    );
  }

  return <Game initial={game} pair={PAIR} onNewSetup={() => setGame(null)} />;
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: c.bg },
});
