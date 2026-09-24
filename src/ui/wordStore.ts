/**
 * Uploading and keeping the word list on the phone.
 *
 * The picked file is parsed once, at upload, and the pairs are saved as JSON
 * in the app's own documents folder. The original file can then be moved or
 * deleted without breaking the next game, and a bad upload never replaces a
 * good list — nothing is saved unless at least one pair was read.
 */

import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { parseWordList, type ParseResult, type WordList } from '../engine/wordlist';
import { readJson, removeJson, writeJson } from './storage';

/** A word list of this size is ~50,000 pairs; anything bigger is not one. */
export const MAX_FILE_BYTES = 1_000_000;

export type UploadOutcome =
  | { kind: 'canceled' }
  | { kind: 'failed'; message: string }
  | { kind: 'empty'; name: string; result: ParseResult }
  | { kind: 'loaded'; list: WordList; result: ParseResult };

const SAVED = 'wordlist.json';

const isWordList = (v: unknown): v is WordList =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as WordList).name === 'string' &&
  Array.isArray((v as WordList).pairs) &&
  (v as WordList).pairs.length > 0 &&
  (v as WordList).pairs.every(
    (p) => typeof p?.civilianWord === 'string' && typeof p?.undercoverWord === 'string',
  );

/** The saved list, or null for the built-in words. Never throws. */
export function loadWordList(): WordList | null {
  const data = readJson(SAVED);
  return isWordList(data) ? data : null;
}

export function clearWordList(): void {
  removeJson(SAVED);
}

/** Open the Files picker and import whatever text file the host chooses. */
export async function uploadWordList(): Promise<UploadOutcome> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({ type: 'text/*', copyToCacheDirectory: true });
  } catch {
    return { kind: 'failed', message: "Couldn't open the file picker." };
  }
  if (picked.canceled || !picked.assets?.length) return { kind: 'canceled' };
  const { uri, name, size } = picked.assets[0];
  return importWordFile(uri, name, size);
}

/** Read, parse and — if it holds any pairs — save a word-list file. */
export async function importWordFile(
  uri: string,
  fileName: string,
  size?: number,
): Promise<UploadOutcome> {
  if (size !== undefined && size > MAX_FILE_BYTES) {
    return { kind: 'failed', message: 'That file is too big to be a word list (over 1 MB).' };
  }
  let text: string;
  try {
    text = await new File(uri).text();
  } catch {
    return { kind: 'failed', message: "Couldn't read that file." };
  }

  const name = fileName.replace(/\.[^.]+$/, '') || 'Word list';
  const result = parseWordList(text);
  if (result.pairs.length === 0) return { kind: 'empty', name, result };

  const list: WordList = { name, pairs: result.pairs };
  try {
    writeJson(SAVED, list);
  } catch {
    return { kind: 'failed', message: "Couldn't save the word list on this phone." };
  }
  return { kind: 'loaded', list, result };
}
