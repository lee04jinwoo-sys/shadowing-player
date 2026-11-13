import { useCallback, useEffect, useRef, useState } from 'react';
import type { SavedVocabItem } from '../types';
import {
  deleteSavedVocabItem,
  getSavedVocab,
  loadPersistedStore,
  saveEpisodeLists,
  toggleEpisodeCompletion,
  updateSavedVocabItem,
  upsertSavedVocab,
} from '../utils/storage';

interface EpisodeLearningState {
  key: string;
  starred: Set<number>;
  edits: Record<number, string>;
  translations: Record<number, string>;
  extracted: Set<number>;
}

const EMPTY_EPISODE_STATE: EpisodeLearningState = {
  key: '',
  starred: new Set(),
  edits: {},
  translations: {},
  extracted: new Set(),
};

/**
 * Manages per-episode learning annotations (starred lines, edits, translations,
 * extracted flags), episode completion badges, and the shared vocabulary queue.
 * Persistence happens inside a commit effect so functional state updaters remain pure.
 */
export function useEpisodeCollections() {
  const initialStore = loadPersistedStore();
  const [completedEpisodes, setCompletedEpisodes] = useState<Set<string>>(
    () => new Set(initialStore.completedEpisodes),
  );
  const [extractedByEpisode, setExtractedByEpisode] = useState<Record<string, number[]>>(
    () => initialStore.extracted,
  );
  const [episodeState, setEpisodeState] = useState<EpisodeLearningState>(EMPTY_EPISODE_STATE);
  const [savedVocab, setSavedVocab] = useState<SavedVocabItem[]>(() => getSavedVocab());

  const dirtyRef = useRef(false);

  const loadEpisodeCollections = useCallback((epKey: string) => {
    dirtyRef.current = false;
    if (!epKey) {
      setEpisodeState(EMPTY_EPISODE_STATE);
      return;
    }
    const store = loadPersistedStore();
    setEpisodeState({
      key: epKey,
      starred: new Set(store.starred[epKey] || []),
      edits: store.edits[epKey] || {},
      translations: store.translations[epKey] || {},
      extracted: new Set(store.extracted[epKey] || []),
    });
    setExtractedByEpisode(store.extracted);
    setCompletedEpisodes(new Set(store.completedEpisodes));
  }, []);

  useEffect(() => {
    if (!episodeState.key || !dirtyRef.current) return;
    const starredArr = Array.from(episodeState.starred);
    const extractedArr = Array.from(episodeState.extracted);

    saveEpisodeLists(
      episodeState.key,
      starredArr,
      episodeState.edits,
      episodeState.translations,
      extractedArr,
    );

    setExtractedByEpisode((prev) => ({
      ...prev,
      [episodeState.key]: extractedArr,
    }));
  }, [episodeState]);

  const toggleStarSubtitle = useCallback((idx: number) => {
    if (idx < 0) return;
    dirtyRef.current = true;
    setEpisodeState((prev) => {
      if (!prev.key) return prev;
      const nextStarred = new Set(prev.starred);
      if (nextStarred.has(idx)) {
        nextStarred.delete(idx);
      } else {
        nextStarred.add(idx);
      }
      return { ...prev, starred: nextStarred };
    });
  }, []);

  const handleEditSentence = useCallback((idx: number, text: string) => {
    dirtyRef.current = true;
    setEpisodeState((prev) => {
      if (!prev.key) return prev;
      return {
        ...prev,
        edits: { ...prev.edits, [idx]: text },
      };
    });
  }, []);

  const handleEditTranslation = useCallback((idx: number, translation: string) => {
    dirtyRef.current = true;
    setEpisodeState((prev) => {
      if (!prev.key) return prev;
      return {
        ...prev,
        translations: { ...prev.translations, [idx]: translation },
      };
    });
  }, []);

  const handleMarkSentenceExtracted = useCallback((idx: number) => {
    dirtyRef.current = true;
    setEpisodeState((prev) => {
      if (!prev.key) return prev;
      const nextExtracted = new Set(prev.extracted);
      nextExtracted.add(idx);
      return { ...prev, extracted: nextExtracted };
    });
  }, []);

  const handleToggleEpisodeComplete = useCallback((epKey: string): boolean => {
    const done = toggleEpisodeCompletion(epKey);
    setCompletedEpisodes((prev) => {
      const next = new Set(prev);
      if (done) next.add(epKey);
      else next.delete(epKey);
      return next;
    });
    return done;
  }, []);

  const handleSaveVocabLocal = useCallback((item: Omit<SavedVocabItem, 'id'>) => {
    const saved = upsertSavedVocab(item);
    setSavedVocab(getSavedVocab());
    return saved;
  }, []);

  const handleUpdateVocab = useCallback((id: string, updates: Partial<SavedVocabItem>) => {
    const updated = updateSavedVocabItem(id, updates);
    setSavedVocab(updated);
  }, []);

  const handleRemoveVocab = useCallback((id: string) => {
    const updated = deleteSavedVocabItem(id);
    setSavedVocab(updated);
  }, []);

  return {
    completedEpisodes,
    extractedByEpisode,
    starredSubtitles: episodeState.starred,
    editedText: episodeState.edits,
    editedTranslation: episodeState.translations,
    extractedSubtitles: episodeState.extracted,
    savedVocab,
    loadEpisodeCollections,
    toggleStarSubtitle,
    handleEditSentence,
    handleEditTranslation,
    handleMarkSentenceExtracted,
    handleToggleEpisodeComplete,
    handleSaveVocabLocal,
    handleUpdateVocab,
    handleRemoveVocab,
  };
}
