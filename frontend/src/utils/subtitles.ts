import type { SavedVocabItem, SubtitleItem, WordTokenSegment } from '../types';

export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function isShortSubtitle(sub?: SubtitleItem): boolean {
  if (!sub || !sub.text_en) return true;
  const words = sub.text_en.trim().split(/\s+/).filter(Boolean);
  return words.length < 3;
}

export function findActiveSubtitleIndex(subtitles: SubtitleItem[], timeMs: number): number {
  let low = 0;
  let high = subtitles.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const sub = subtitles[mid];

    if (timeMs >= sub.start_ms && timeMs < sub.end_ms) {
      return mid;
    }
    if (timeMs < sub.start_ms) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  if (low > 0 && timeMs === subtitles[low - 1].end_ms) {
    return low - 1;
  }
  return -1;
}

export function tokenizeEnglishSubtitle(text: string, savedVocab: SavedVocabItem[]): WordTokenSegment[] {
  if (!text) return [];

  const extractedWords = new Set<string>();
  const starredWords = new Set<string>();
  const extractedPhrases: string[] = [];
  const starredPhrases: string[] = [];

  for (const item of savedVocab) {
    if (!item.word) continue;
    const clean = item.word.toLowerCase().replace(/^[^\w\s'-]+|[^\w\s'-]+$/g, '').trim();
    if (!clean) continue;
    if (item.extracted) {
      if (clean.includes(' ')) extractedPhrases.push(clean);
      else extractedWords.add(clean);
    } else {
      if (clean.includes(' ')) starredPhrases.push(clean);
      else starredWords.add(clean);
    }
  }

  const cleanText = text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  const lowerText = cleanText.toLowerCase();
  const matchedExtractedPhrases = extractedPhrases.filter((p) => lowerText.includes(p));
  const matchedStarredPhrases = starredPhrases.filter((p) => lowerText.includes(p));

  return cleanText.split(/(\s+|[^\w\s'-]+)/).filter((part) => part.length > 0).map((part) => {
    const trimmed = part.trim();
    const isWord = /^[a-zA-Z0-9'-]+$/.test(trimmed) && trimmed.length > 0;
    if (!isWord) {
      return { text: part, word: '', isWord: false, status: 'plain' };
    }

    const lower = trimmed.toLowerCase();
    const isExtracted =
      extractedWords.has(lower) ||
      matchedExtractedPhrases.some((p) => p.split(/\s+/).includes(lower));
    if (isExtracted) {
      return { text: part, word: trimmed, isWord: true, status: 'extracted' };
    }

    const isStarred =
      starredWords.has(lower) ||
      matchedStarredPhrases.some((p) => p.split(/\s+/).includes(lower));
    if (isStarred) {
      return { text: part, word: trimmed, isWord: true, status: 'starred' };
    }

    return { text: part, word: trimmed, isWord: true, status: 'plain' };
  });
}
