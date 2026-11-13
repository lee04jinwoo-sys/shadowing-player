import { describe, it, expect } from 'vitest';
import {
  findActiveSubtitleIndex,
  formatTime,
  isShortSubtitle,
  tokenizeEnglishSubtitle,
} from '../subtitles';
import type { SubtitleItem, SavedVocabItem } from '../../types';

const sampleSubs: SubtitleItem[] = [
  { start_ms: 1000, end_ms: 3000, text_en: 'Hello there, friend.', text_kr: '안녕 친구.' },
  { start_ms: 4000, end_ms: 7000, text_en: 'I need to figure out this problem.', text_kr: '이 문제를 풀어야 해.' },
];

describe('subtitles utilities', () => {
  it('finds active subtitle index using binary search and end_ms fallback', () => {
    expect(findActiveSubtitleIndex(sampleSubs, 500)).toBe(-1);
    expect(findActiveSubtitleIndex(sampleSubs, 1000)).toBe(0);
    expect(findActiveSubtitleIndex(sampleSubs, 2999)).toBe(0);
    expect(findActiveSubtitleIndex(sampleSubs, 3000)).toBe(0);
    expect(findActiveSubtitleIndex(sampleSubs, 3500)).toBe(-1);
    expect(findActiveSubtitleIndex(sampleSubs, 4500)).toBe(1);
    expect(findActiveSubtitleIndex(sampleSubs, 8000)).toBe(-1);
  });

  it('formats milliseconds as mm:ss', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(65000)).toBe('01:05');
    expect(formatTime(605000)).toBe('10:05');
  });

  it('detects short subtitles with fewer than 3 words', () => {
    expect(isShortSubtitle({ start_ms: 0, end_ms: 1000, text_en: 'Hey you!' })).toBe(true);
    expect(isShortSubtitle({ start_ms: 0, end_ms: 1000, text_en: 'Got it right.' })).toBe(false);
    expect(isShortSubtitle(undefined)).toBe(true);
  });

  it('tokenizes English subtitles and marks extracted/starred words and phrases', () => {
    const vocab: SavedVocabItem[] = [
      { id: '1', word: 'figure out', meaning: '알아내다', pos: 'idiom', example: '', explanation: '', extracted: true },
      { id: '2', word: 'problem', meaning: '문제', pos: 'n', example: '', explanation: '', extracted: false },
    ];
    const tokens = tokenizeEnglishSubtitle('I need to figure out this problem.', vocab);
    const wordTokens = tokens.filter((t) => t.isWord);

    expect(wordTokens.map((t) => t.word)).toEqual(['I', 'need', 'to', 'figure', 'out', 'this', 'problem']);
    expect(wordTokens.find((t) => t.word === 'figure')?.status).toBe('extracted');
    expect(wordTokens.find((t) => t.word === 'out')?.status).toBe('extracted');
    expect(wordTokens.find((t) => t.word === 'problem')?.status).toBe('starred');
    expect(wordTokens.find((t) => t.word === 'need')?.status).toBe('plain');
  });
});
