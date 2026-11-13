import type { DiffWordItem } from '../types';

function normalizeWords(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export function compareStrings(correct: string, typed: string): DiffWordItem[] {
  const correctWords = normalizeWords(correct);
  const typedWords = normalizeWords(typed);

  let correctIdx = 0;
  let typedIdx = 0;
  const result: DiffWordItem[] = [];

  while (correctIdx < correctWords.length || typedIdx < typedWords.length) {
    if (correctIdx < correctWords.length && typedIdx < typedWords.length) {
      if (correctWords[correctIdx] === typedWords[typedIdx]) {
        result.push({ word: correctWords[correctIdx], status: 'correct' });
        correctIdx++;
        typedIdx++;
      } else {
        const lookAheadIdx = correctWords.slice(correctIdx).indexOf(typedWords[typedIdx]);
        if (lookAheadIdx !== -1) {
          for (let k = 0; k < lookAheadIdx; k++) {
            result.push({ word: correctWords[correctIdx + k], status: 'missing' });
          }
          correctIdx += lookAheadIdx;
        } else {
          result.push({
            word: correctWords[correctIdx],
            status: 'wrong',
            typed: typedWords[typedIdx],
          });
          correctIdx++;
          typedIdx++;
        }
      }
    } else if (correctIdx < correctWords.length) {
      result.push({ word: correctWords[correctIdx], status: 'missing' });
      correctIdx++;
    } else {
      result.push({ word: typedWords[typedIdx], status: 'extra' });
      typedIdx++;
    }
  }

  return result;
}

export function evaluatePronunciation(
  correctText: string,
  typedText: string,
): { score: number; comparison: DiffWordItem[] } {
  const comparison = compareStrings(correctText, typedText);
  const correctCount = comparison.filter((item) => item.status === 'correct').length;
  const totalWords = comparison.filter((item) => item.status !== 'extra').length;
  const score = totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;

  return { score, comparison };
}
