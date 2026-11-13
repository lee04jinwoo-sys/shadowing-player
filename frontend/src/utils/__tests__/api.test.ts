import { describe, it, expect, vi, afterEach } from 'vitest';
import { addVocabCardToAnki } from '../../api';

describe('api error handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts detail error message when addVocabCardToAnki receives HTTP error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'Anki gateway error' }), { status: 500 })),
    );

    const res = await addVocabCardToAnki({
      word: 'resilient',
      meaning: '회복력 있는',
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('Anki gateway error');
  });

  it('returns structured failure object when addVocabCardToAnki encounters a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Failed to fetch');
      }),
    );

    const res = await addVocabCardToAnki({
      word: 'resilient',
      meaning: '회복력 있는',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Failed to fetch');
  });
});
