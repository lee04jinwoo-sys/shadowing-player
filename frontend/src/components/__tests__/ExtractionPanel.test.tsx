import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExtractionPanel } from '../ExtractionPanel';
import type { SavedVocabItem, SubtitleItem } from '../../types';

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
        extractedSubtitles={new Set()}
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

  describe('sentence tab hides already-extracted sentences', () => {
    const subtitles = [
      { index: 0, start_ms: 0, end_ms: 1000, text_en: 'First line.', text_kr: '' },
      { index: 1, start_ms: 1000, end_ms: 2000, text_en: 'Second line.', text_kr: '' },
      { index: 2, start_ms: 2000, end_ms: 3000, text_en: 'Third line.', text_kr: '' },
    ] as unknown as SubtitleItem[];

    const renderPanel = (extracted: number[]) =>
      render(
        <ExtractionPanel
          subtitles={subtitles}
          sourceName="Demo"
          ankiConnected={true}
          starredSubtitles={new Set([0, 1, 2])}
          extractedSubtitles={new Set(extracted)}
          editedText={{}}
          editedTranslation={{}}
          savedVocab={[]}
          onEditSentence={vi.fn()}
          onEditTranslation={vi.fn()}
          onRemoveStarredSentence={vi.fn()}
          onMarkSentenceExtracted={vi.fn()}
          onUpdateVocab={vi.fn()}
          onRemoveVocab={vi.fn()}
          onToast={vi.fn()}
        />,
      );

    it('lists only pending sentences and counts them in the tab', () => {
      renderPanel([1]);
      expect(screen.getByRole('button', { name: /문장 \(2\)/ })).toBeTruthy();
      expect(screen.queryByDisplayValue('Second line.')).toBeNull();
      expect(screen.getByDisplayValue('First line.')).toBeTruthy();
      expect(screen.getByDisplayValue('Third line.')).toBeTruthy();
    });

    it('bulk send skips sentences that were already extracted', async () => {
      const sent: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          if (url.startsWith('/api/anki/add-sentence') && init?.body) {
            sent.push(JSON.parse(String(init.body)).sentence);
          }
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }),
      );
      renderPanel([1]);
      fireEvent.click(screen.getByRole('button', { name: /문장 전체 Anki 전송/ }));
      await waitFor(() => expect(sent).toHaveLength(2));
      expect(sent.sort()).toEqual(['First line.', 'Third line.']);
    });
  });
});
