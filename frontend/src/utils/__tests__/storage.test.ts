import { describe, it, expect } from 'vitest';
import {
  loadPersistedStore,
  saveEpisodeLists,
  toggleEpisodeCompletion,
  addYouTubeToHistory,
  getYouTubeHistory,
  saveLastWatched,
  getLastWatched,
  upsertSavedVocab,
  updateSavedVocabItem,
  deleteSavedVocabItem,
  getSavedVocab,
  getThemePref,
  saveThemePref,
} from '../storage';

describe('localStorage persistence compatibility', () => {
  it('reads legacy localStorage keys cleanly and survives malformed JSON', () => {
    localStorage.setItem('shadowing_starred', JSON.stringify({ ep1: [1, 3] }));
    localStorage.setItem('shadowing_edits', JSON.stringify({ ep1: { 1: 'Edited line' } }));
    localStorage.setItem('shadowing_translations', JSON.stringify({ ep1: { 1: '수정된 뜻' } }));
    localStorage.setItem('shadowing_extracted', JSON.stringify({ ep1: [2] }));
    localStorage.setItem('shadowing_completed_eps', JSON.stringify(['ep0']));

    const store = loadPersistedStore();
    expect(store.starred.ep1).toEqual([1, 3]);
    expect(store.edits.ep1[1]).toBe('Edited line');
    expect(store.translations.ep1[1]).toBe('수정된 뜻');
    expect(store.extracted.ep1).toEqual([2]);
    expect(store.completedEpisodes).toEqual(['ep0']);

    localStorage.setItem('shadowing_starred', '{bad-json');
    expect(loadPersistedStore().starred).toEqual({});
  });

  it('persists episode lists, completion toggles, YouTube history, last watched, and vocab CRUD', () => {
    saveEpisodeLists('ep2', [0, 4], { 0: 'Line A' }, { 0: '문장 A' }, [5]);
    expect(JSON.parse(localStorage.getItem('shadowing_starred') || '{}').ep2).toEqual([0, 4]);

    expect(toggleEpisodeCompletion('ep2')).toBe(true);
    expect(toggleEpisodeCompletion('ep2')).toBe(false);

    addYouTubeToHistory('abc12345678', 'Test Video');
    expect(getYouTubeHistory()[0].id).toBe('abc12345678');

    saveLastWatched('ep2', 12340, 'local');
    expect(getLastWatched()).toEqual({ epKey: 'ep2', timeMs: 12340, sourceMode: 'local' });

    const created = upsertSavedVocab({
      word: 'catch up',
      meaning: '따라잡다',
      pos: 'idiom',
      example: 'Let us catch up soon.',
      explanation: '설명',
      extracted: false,
    });
    expect(getSavedVocab()).toHaveLength(1);

    updateSavedVocabItem(created.id, { extracted: true });
    expect(getSavedVocab()[0].extracted).toBe(true);

    deleteSavedVocabItem(created.id);
    expect(getSavedVocab()).toHaveLength(0);
  });

  it('saves and retrieves theme preference', () => {
    saveThemePref('light');
    expect(getThemePref()).toBe('light');
    saveThemePref('dark');
    expect(getThemePref()).toBe('dark');
  });
});
