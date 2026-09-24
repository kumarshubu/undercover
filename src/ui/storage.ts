/**
 * Small JSON files in the app's own documents folder — the word list, the
 * player names and the leaderboard. Reads never throw: a missing or damaged
 * file reads as null, and each caller falls back to its default.
 */

import { File, Paths } from 'expo-file-system';

const file = (name: string) => new File(Paths.document, name);

export function readJson(name: string): unknown {
  try {
    const f = file(name);
    return f.exists ? JSON.parse(f.textSync()) : null;
  } catch {
    return null;
  }
}

export function writeJson(name: string, data: unknown): void {
  const f = file(name);
  if (!f.exists) f.create();
  f.write(JSON.stringify(data));
}

export function removeJson(name: string): void {
  const f = file(name);
  if (f.exists) f.delete();
}
