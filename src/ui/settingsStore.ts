/**
 * The game rules the host picked in Settings, kept on the phone. Only the
 * choices Settings offers are saved; everything else stays at the defaults.
 */

import { DEFAULT_SETTINGS, type Settings } from '../engine/types';
import { readJson, writeJson } from './storage';

const FILE = 'settings.json';

export type SavedSettings = Pick<Settings, 'votingMode' | 'allowAbstain'>;

export function loadSettings(): Settings {
  const data = readJson(FILE) as Partial<SavedSettings> | null;
  const votingMode =
    data?.votingMode === 'secretBallot' || data?.votingMode === 'groupTap'
      ? data.votingMode
      : DEFAULT_SETTINGS.votingMode;
  const allowAbstain =
    typeof data?.allowAbstain === 'boolean' ? data.allowAbstain : DEFAULT_SETTINGS.allowAbstain;
  return { ...DEFAULT_SETTINGS, votingMode, allowAbstain };
}

export function saveSettings(settings: Settings): void {
  try {
    const saved: SavedSettings = {
      votingMode: settings.votingMode,
      allowAbstain: settings.allowAbstain,
    };
    writeJson(FILE, saved);
  } catch {
    // The choice still applies for this session; it just won't be remembered.
  }
}
