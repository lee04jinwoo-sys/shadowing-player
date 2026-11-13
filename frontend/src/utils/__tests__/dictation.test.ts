import { describe, it, expect } from 'vitest';
import { compareStrings, evaluatePronunciation } from '../dictation';

describe('dictation comparison and pronunciation scoring', () => {
  it('ignores punctuation and casing on exact matches', () => {
    const diff = compareStrings('Hello, world! How are you?', 'hello world how are you');
    expect(diff.every((d) => d.status === 'correct')).toBe(true);
  });

  it('detects wrong, missing, and extra words accurately', () => {
    const diff = compareStrings('I really like coffee today', 'I like tea today please');
    expect(diff).toEqual([
      { word: 'i', status: 'correct' },
      { word: 'really', status: 'missing' },
      { word: 'like', status: 'correct' },
      { word: 'coffee', status: 'wrong', typed: 'tea' },
      { word: 'today', status: 'correct' },
      { word: 'please', status: 'extra' },
    ]);
  });

  it('calculates pronunciation match percentage excluding extra words from denominator', () => {
    const res = evaluatePronunciation('one two three four', 'one two five four');
    expect(res.score).toBe(75);
  });
});
