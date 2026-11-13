import type { LastWatchedState, SavedVocabItem, ThemeMode, YouTubeHistoryItem } from '../types';

const KEYS = {
  starred: 'shadowing_starred',
  edits: 'shadowing_edits',
  translations: 'shadowing_translations',
  extracted: 'shadowing_extracted',
  completedEps: 'shadowing_completed_eps',
  ytHistory: 'shadowing_youtube_history',
  lastWatched: 'shadowing_last_watched',
  savedVocab: 'shadowing_saved_vocab',
  theme: 'shadowing_theme',
  sidebarWidth: 'shadowing_sidebar_width',
} as const;

export interface PersistedStore {
  starred: Record<string, number[]>;
  edits: Record<string, Record<number, string>>;
  translations: Record<string, Record<number, string>>;
  extracted: Record<string, number[]>;
  completedEpisodes: string[];
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota or storage restriction errors
  }
}

export function loadPersistedStore(): PersistedStore {
  const rawStarred = readJson<unknown>(KEYS.starred, {});
  const starred =
    rawStarred && typeof rawStarred === 'object' && !Array.isArray(rawStarred)
      ? (rawStarred as Record<string, number[]>)
      : {};

  const rawEdits = readJson<unknown>(KEYS.edits, {});
  let edits: Record<string, Record<number, string>> = {};
  if (rawEdits && typeof rawEdits === 'object' && !Array.isArray(rawEdits)) {
    const obj = rawEdits as Record<string, unknown>;
    const firstKey = Object.keys(obj)[0];
    if (!firstKey || Number.isNaN(Number.parseInt(firstKey, 10))) {
      edits = obj as Record<string, Record<number, string>>;
    }
  }

  const rawTrans = readJson<unknown>(KEYS.translations, {});
  const translations =
    rawTrans && typeof rawTrans === 'object' && !Array.isArray(rawTrans)
      ? (rawTrans as Record<string, Record<number, string>>)
      : {};

  const rawExtracted = readJson<unknown>(KEYS.extracted, {});
  const extracted =
    rawExtracted && typeof rawExtracted === 'object' && !Array.isArray(rawExtracted)
      ? (rawExtracted as Record<string, number[]>)
      : {};

  const rawCompleted = readJson<unknown>(KEYS.completedEps, []);
  const completedEpisodes = Array.isArray(rawCompleted)
    ? rawCompleted.filter((item): item is string => typeof item === 'string')
    : [];

  return { starred, edits, translations, extracted, completedEpisodes };
}

export function saveEpisodeLists(
  epKey: string,
  starredIndices: number[],
  editsMap: Record<number, string>,
  translationsMap: Record<number, string>,
  extractedIndices: number[],
): void {
  const store = loadPersistedStore();
  store.starred[epKey] = starredIndices;
  store.edits[epKey] = editsMap;
  store.translations[epKey] = translationsMap;
  store.extracted[epKey] = extractedIndices;

  writeJson(KEYS.starred, store.starred);
  writeJson(KEYS.edits, store.edits);
  writeJson(KEYS.translations, store.translations);
  writeJson(KEYS.extracted, store.extracted);
}

export function toggleEpisodeCompletion(epKey: string): boolean {
  const store = loadPersistedStore();
  const set = new Set(store.completedEpisodes);
  if (set.has(epKey)) {
    set.delete(epKey);
  } else {
    set.add(epKey);
  }
  writeJson(KEYS.completedEps, Array.from(set));
  return set.has(epKey);
}

export function getYouTubeHistory(): YouTubeHistoryItem[] {
  const raw = readJson<unknown>(KEYS.ytHistory, []);
  return Array.isArray(raw) ? (raw as YouTubeHistoryItem[]) : [];
}

export function addYouTubeToHistory(videoId: string, title: string): YouTubeHistoryItem[] {
  const current = getYouTubeHistory().filter((v) => v.id !== videoId);
  const next: YouTubeHistoryItem[] = [{ id: videoId, title, addedAt: Date.now() }, ...current].slice(0, 20);
  writeJson(KEYS.ytHistory, next);
  return next;
}

export function saveLastWatched(epKey: string, timeMs: number, sourceMode: 'local' | 'youtube'): void {
  writeJson(KEYS.lastWatched, { epKey, timeMs, sourceMode } satisfies LastWatchedState);
}

export function getLastWatched(): LastWatchedState | null {
  const raw = readJson<unknown>(KEYS.lastWatched, null);
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<LastWatchedState>;
  if (!candidate.epKey || typeof candidate.timeMs !== 'number') return null;
  return {
    epKey: candidate.epKey,
    timeMs: candidate.timeMs,
    sourceMode: candidate.sourceMode === 'youtube' ? 'youtube' : 'local',
  };
}

export function getSavedVocab(): SavedVocabItem[] {
  const raw = readJson<unknown>(KEYS.savedVocab, []);
  return Array.isArray(raw) ? (raw as SavedVocabItem[]) : [];
}

export function upsertSavedVocab(
  item: Omit<SavedVocabItem, 'id'> & { id?: string },
): SavedVocabItem {
  const list = getSavedVocab();
  const cleanWord = (item.word || '').trim();
  const existingIdx = list.findIndex((v) => v.word.toLowerCase() === cleanWord.toLowerCase());

  let saved: SavedVocabItem;
  if (existingIdx !== -1) {
    saved = {
      ...list[existingIdx],
      ...item,
      word: cleanWord,
      updatedAt: Date.now(),
    };
    list[existingIdx] = saved;
  } else {
    saved = {
      id: item.id || `vocab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      ...item,
      word: cleanWord,
    };
    list.unshift(saved);
  }
  writeJson(KEYS.savedVocab, list);
  return saved;
}

export function updateSavedVocabItem(id: string, updates: Partial<SavedVocabItem>): SavedVocabItem[] {
  const list = getSavedVocab().map((v) =>
    v.id === id ? { ...v, ...updates, updatedAt: Date.now() } : v,
  );
  writeJson(KEYS.savedVocab, list);
  return list;
}

export function deleteSavedVocabItem(id: string): SavedVocabItem[] {
  const list = getSavedVocab().filter((v) => v.id !== id);
  writeJson(KEYS.savedVocab, list);
  return list;
}

export function getSavedTheme(): ThemeMode {
  try {
    const val = localStorage.getItem(KEYS.theme);
    return val === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function saveTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(KEYS.theme, theme);
  } catch {
    // ignore
  }
}

export function getSavedSidebarWidth(defaultWidth = 400): number {
  try {
    const raw = localStorage.getItem(KEYS.sidebarWidth);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed >= 320 && parsed <= 560) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return defaultWidth;
}

export function saveSidebarWidth(width: number): void {
  try {
    localStorage.setItem(KEYS.sidebarWidth, String(Math.round(width)));
  } catch {
    // ignore
  }
}
