import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Game, randomSeed } from './src/ui/Game';
import { LeaderboardScreen } from './src/ui/LeaderboardScreen';
import { SettingsScreen } from './src/ui/SettingsScreen';
import { SetupScreen } from './src/ui/SetupScreen';
import { loadWordList } from './src/ui/wordStore';
import { loadLeaderboard, loadRoster, saveLeaderboard, saveRoster } from './src/ui/playerStore';
import { loadSettings, saveSettings } from './src/ui/settingsStore';
import { newGame } from './src/engine/engine';
import { BUILT_IN_PAIRS } from './src/engine/builtinWords';
import { recordGame, type Leaderboard, type PlayerResult } from './src/engine/leaderboard';
import { pickPair, recentWindow, type WordList } from './src/engine/wordlist';
import type { GameState, Settings, SetupCounts, WordPair } from './src/engine/types';
import { c } from './src/ui/theme';

/** Starting names, until the table types its own — those are then remembered. */
const NAMES = ['Ankit','Rajiv','Abhishek','Shubham','Ken','Karan','Gus','Hal','Ivy','Jo','Kit','Lou','Max','Nel','Oz','Pia','Quin','Rae','Sam','Tay'];

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
  const [inSettings, setInSettings] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [lastCounts, setLastCounts] = useState<SetupCounts | undefined>(undefined);
  const [wordList, setWordList] = useState<WordList | null>(loadWordList);
  const [roster, setRoster] = useState<string[]>(() => loadRoster() ?? NAMES);
  const [board, setBoard] = useState<Leaderboard>(loadLeaderboard);
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const changeSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  // Pairs played recently are kept out of the draw, so a night of games at
  // the same table doesn't see the same pair twice.
  const pairs = wordList?.pairs ?? BUILT_IN_PAIRS;
  const recent = useRef<WordPair[]>([]);
  const nextPair = useCallback(() => {
    const pair = pickPair(pairs, Math.random(), recent.current);
    const keep = recentWindow(pairs.length);
    recent.current = keep > 0 ? [...recent.current, pair].slice(-keep) : [];
    return pair;
  }, [pairs]);

  const onGameOver = useCallback((results: PlayerResult[]) => {
    setBoard((b) => recordGame(b, results));
  }, []);

  // Save whenever the board changes — but not the copy just loaded from disk.
  const loadedBoard = useRef(board);
  useEffect(() => {
    if (board !== loadedBoard.current) saveLeaderboard(board);
  }, [board]);

  const start = (counts: SetupCounts, names: string[]) => {
    // Remember every seat, including ones beyond today's table size.
    const merged = [...names, ...roster.slice(names.length)];
    setRoster(merged);
    saveRoster(merged);
    setLastCounts(counts);
    setGame(newGame(counts, names, nextPair(), randomSeed(), settings));
  };

  let view;
  if (game) {
    view = (
      <Game
        initial={game}
        nextPair={nextPair}
        onNewSetup={() => setGame(null)}
        onGameOver={onGameOver}
        onShowLeaderboard={() => setShowBoard(true)}
      />
    );
  } else if (inSettings) {
    view = (
      <SettingsScreen
        wordList={wordList}
        builtInCount={BUILT_IN_PAIRS.length}
        onChange={setWordList}
        settings={settings}
        onSettingsChange={changeSettings}
        onDone={() => setInSettings(false)}
      />
    );
  } else {
    view = (
      <SetupScreen
        settings={settings}
        initial={lastCounts}
        names={roster}
        onOpenSettings={() => setInSettings(true)}
        onOpenLeaderboard={() => setShowBoard(true)}
        onStart={start}
      />
    );
  }

  return (
    <>
      {view}
      {/* A sheet over whatever is showing, so a game in progress stays alive. */}
      <Modal
        visible={showBoard}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowBoard(false)}
      >
        <View style={s.fill}>
          <LeaderboardScreen
            board={board}
            onReset={() => setBoard({})}
            onDone={() => setShowBoard(false)}
          />
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: c.bg },
});
