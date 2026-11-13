import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExtractionPanel } from '../ExtractionPanel';
import type { SavedVocabItem } from '../../types';

describe('ExtractionPanel', () => {
  const savedVocab: SavedVocabItem[] = [
    {
      id: 'v-pending',
      word: 'spring',
      meaning: '갑자기 꺼내다',
      pos: 'v',
      example: 'She sprang it on me.',
      explanation: '① 의미 ② 연어',
      extracted: false,
    },
    {
      id: 'v-done',
      word: 'already',
      meaning: '이미',
      pos: 'adv',
      example: 'Already done.',
      explanation: '① 의미 ② 연어',
      extracted: true,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => 'blob:mock');
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    }
  });

  it('exports only pending (unextracted) vocab items matching the 단어/표현 (N) tab count', async () => {
    let exportedBody: { items?: Array<{ word?: string }> } | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/export/csv') && init?.body) {
        exportedBody = JSON.parse(String(init.body));
        return new Response('Word,Meaning\nspring,갑자기 꺼내다\n', { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ExtractionPanel
        subtitles={[]}
        sourceName="Demo"
        ankiConnected={true}
        starredSubtitles={new Set()}
        editedText={{}}
        editedTranslation={{}}
        savedVocab={savedVocab}
        onEditSentence={vi.fn()}
        onEditTranslation={vi.fn()}
        onRemoveStarredSentence={vi.fn()}
        onMarkSentenceExtracted={vi.fn()}
        onUpdateVocab={vi.fn()}
        onRemoveVocab={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /단어\/표현 \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /\.csv/ }));

    await waitFor(() => {
      expect(exportedBody).not.toBeNull();
    });
    expect(exportedBody?.items).toHaveLength(1);
    expect(exportedBody?.items?.[0]?.word).toBe('spring');
  });
});
