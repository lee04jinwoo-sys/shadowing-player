import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Download, Loader2, MessageSquare, Send, Table2, Trash2 } from 'lucide-react';
import type { ExportItemPayload, ExtractionTab, SavedVocabItem, SubtitleItem } from '../types';
import { formatTime } from '../utils/subtitles';
import { addSentenceToAnki, addVocabCardToAnki, exportApkg, exportCsv } from '../api';

interface ExtractionPanelProps {
  subtitles: SubtitleItem[];
  sourceName: string;
  ankiConnected: boolean;
  starredSubtitles: Set<number>;
  extractedSubtitles: Set<number>;
  editedText: Record<number, string>;
  editedTranslation: Record<number, string>;
  savedVocab: SavedVocabItem[];
  onEditSentence: (idx: number, text: string) => void;
  onEditTranslation: (idx: number, translation: string) => void;
  onRemoveStarredSentence: (idx: number) => void;
  onMarkSentenceExtracted: (idx: number) => void;
  onUpdateVocab: (id: string, updates: Partial<SavedVocabItem>) => void;
  onRemoveVocab: (id: string) => void;
  onToast: (msg: string, tone?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const ExtractionPanel: React.FC<ExtractionPanelProps> = ({
  subtitles,
  sourceName,
  ankiConnected,
  starredSubtitles,
  extractedSubtitles,
  editedText,
  editedTranslation,
  savedVocab,
  onEditSentence,
  onEditTranslation,
  onRemoveStarredSentence,
  onMarkSentenceExtracted,
  onUpdateVocab,
  onRemoveVocab,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<ExtractionTab>('sentences');
  const [exportingKind, setExportingKind] = useState<'apkg' | 'csv' | 'anki' | null>(null);
  const [bulkProgressText, setBulkProgressText] = useState<string | null>(null);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const bulkTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (bulkTimerRef.current !== null) {
        window.clearTimeout(bulkTimerRef.current);
        bulkTimerRef.current = null;
      }
    };
  }, []);

  // 이미 Anki로 보낸 문장은 대기 목록에서 뺀다 (단어 탭의 pendingVocab과 같은 규칙).
  const sortedStarred = Array.from(starredSubtitles)
    .filter((idx) => !extractedSubtitles.has(idx))
    .sort((a, b) => a - b);
  const pendingVocab = savedVocab.filter((v) => !v.extracted);

  const buildSentenceExportItems = (): ExportItemPayload[] =>
    sortedStarred.map((idx) => {
      const sub = subtitles[idx];
      return {
        sentence: editedText[idx] ?? sub?.text_en ?? '',
        translation: editedTranslation[idx] ?? sub?.text_kr ?? '',
        item_type: 'sentence',
        source: sourceName,
        start_ms: sub?.start_ms,
        end_ms: sub?.end_ms,
      };
    });

  const buildVocabExportItems = (): ExportItemPayload[] =>
    pendingVocab.map((v) => ({
      word: v.word,
      meaning: v.meaning,
      pos: v.pos,
      example: v.example,
      explanation: v.explanation,
      item_type: 'vocab',
      source: sourceName,
    }));

  const handleExportFile = async (format: 'apkg' | 'csv') => {
    const isSentences = activeTab === 'sentences';
    const items = isSentences ? buildSentenceExportItems() : buildVocabExportItems();
    if (items.length === 0) return;

    const deckName = isSentences ? 'Shadowing Sentence Deck' : 'Shadowing Vocabulary Deck';
    setExportingKind(format);
    try {
      if (format === 'apkg') await exportApkg(items, deckName);
      else await exportCsv(items, deckName);
      onToast(`${format.toUpperCase()} 파일 다운로드를 시작했습니다.`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : '내보내기 실패', 'error');
    } finally {
      setExportingKind(null);
    }
  };

  const handleExtractSingleSentence = async (idx: number) => {
    if (!ankiConnected) {
      onToast('서버 Anki에 연결되어 있지 않습니다. 상단 연결 상태를 확인하세요.', 'warn');
      return;
    }
    const sub = subtitles[idx];
    const sentence = (editedText[idx] ?? sub?.text_en ?? '').trim();
    const translation = (editedTranslation[idx] ?? sub?.text_kr ?? '').trim();
    if (!sentence) return;

    const cardId = `sent-${idx}`;
    setBusyCardId(cardId);
    try {
      const res = await addSentenceToAnki(sentence, translation);
      if (res.success || res.duplicate) {
        onMarkSentenceExtracted(idx);
        onToast('문장이 Anki에 저장되었습니다.', 'success');
      } else {
        onToast(res.error || 'Anki 전송 실패', 'error');
      }
    } catch {
      onToast('Anki 전송 중 오류가 발생했습니다.', 'error');
    } finally {
      setBusyCardId(null);
    }
  };

  const handleExtractSingleVocab = async (v: SavedVocabItem) => {
    if (!ankiConnected) {
      onToast('서버 Anki에 연결되어 있지 않습니다.', 'warn');
      return;
    }
    if (!v.word.trim() || !v.meaning.trim()) {
      onToast('단어와 뜻을 먼저 입력해 주세요.', 'warn');
      return;
    }

    setBusyCardId(v.id);
    try {
      const res = await addVocabCardToAnki({
        word: v.word.trim(),
        meaning: v.meaning.trim(),
        explanation: v.explanation.trim(),
        example: v.example.trim(),
        pos: v.pos || '',
      });
      if (res.success || res.duplicate) {
        onUpdateVocab(v.id, { extracted: true, note_id: res.note_id });
        onToast(`'${v.word}' 단어가 Anki에 등록되었습니다.`, 'success');
      } else {
        onToast(res.error || '단어 전송 실패', 'error');
      }
    } catch {
      onToast('단어 전송 중 오류가 발생했습니다.', 'error');
    } finally {
      setBusyCardId(null);
    }
  };

  const handleBulkExportSentences = async () => {
    if (sortedStarred.length === 0) return;
    if (!ankiConnected) {
      onToast('서버 Anki에 연결되어 있지 않습니다.', 'warn');
      return;
    }
    setExportingKind('anki');
    const total = sortedStarred.length;
    let completed = 0;
    let succeeded = 0;
    setBulkProgressText(`문장 전송 중... (0/${total})`);

    const CHUNK = 4;
    for (let i = 0; i < sortedStarred.length; i += CHUNK) {
      const chunk = sortedStarred.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map(async (idx) => {
          const sub = subtitles[idx];
          const sentence = (editedText[idx] ?? sub?.text_en ?? '').trim();
          const translation = (editedTranslation[idx] ?? sub?.text_kr ?? '').trim();
          if (sentence) {
            try {
              const res = await addSentenceToAnki(sentence, translation);
              if (res.success || res.duplicate || res.note_id) {
                succeeded += 1;
                onMarkSentenceExtracted(idx);
              }
            } catch {
              // continue batch
            }
          }
          completed += 1;
          setBulkProgressText(`문장 전송 중... (${completed}/${total})`);
        }),
      );
    }

    setBulkProgressText(`완료 (${succeeded}/${total} 문장 전송)`);
    onToast(`${succeeded}/${total} 문장을 Anki에 저장했습니다.`, succeeded > 0 ? 'success' : 'error');
    if (bulkTimerRef.current !== null) window.clearTimeout(bulkTimerRef.current);
    bulkTimerRef.current = window.setTimeout(() => {
      bulkTimerRef.current = null;
      setBulkProgressText(null);
      setExportingKind(null);
    }, 1500);
  };

  const handleBulkExportVocab = async () => {
    if (pendingVocab.length === 0) return;
    if (!ankiConnected) {
      onToast('서버 Anki에 연결되어 있지 않습니다.', 'warn');
      return;
    }
    setExportingKind('anki');
    const total = pendingVocab.length;
    let completed = 0;
    let succeeded = 0;
    setBulkProgressText(`단어 전송 중... (0/${total})`);

    const CHUNK = 4;
    for (let i = 0; i < pendingVocab.length; i += CHUNK) {
      const chunk = pendingVocab.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map(async (v) => {
          try {
            const res = await addVocabCardToAnki({
              word: v.word,
              meaning: v.meaning,
              explanation: v.explanation || '',
              example: v.example || '',
              pos: v.pos || '',
            });
            if (res.success || res.duplicate || res.note_id) {
              succeeded += 1;
              onUpdateVocab(v.id, { extracted: true, note_id: res.note_id });
            }
          } catch {
            // continue batch
          }
          completed += 1;
          setBulkProgressText(`단어 전송 중... (${completed}/${total})`);
        }),
      );
    }

    setBulkProgressText(`완료 (${succeeded}/${total} 단어 전송)`);
    onToast(`${succeeded}/${total} 단어를 Anki에 저장했습니다.`, succeeded > 0 ? 'success' : 'error');
    if (bulkTimerRef.current !== null) window.clearTimeout(bulkTimerRef.current);
    bulkTimerRef.current = window.setTimeout(() => {
      bulkTimerRef.current = null;
      setBulkProgressText(null);
      setExportingKind(null);
    }, 1500);
  };

  const hasCurrentItems =
    activeTab === 'sentences' ? sortedStarred.length > 0 : pendingVocab.length > 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Sub-Tabs */}
      <div className="px-3.5 pt-2.5 pb-2 border-b border-line space-y-2">
        <div className="grid grid-cols-2 rounded-lg bg-surface-3 p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('sentences')}
            className={`inline-flex items-center justify-center gap-1.5 h-7 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'sentences'
                ? 'bg-card text-ink font-semibold card-surface'
                : 'text-ink-3 hover:text-ink'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="num">문장 ({sortedStarred.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('words')}
            className={`inline-flex items-center justify-center gap-1.5 h-7 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'words'
                ? 'bg-card text-ink font-semibold card-surface'
                : 'text-ink-3 hover:text-ink'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="num">단어/표현 ({pendingVocab.length})</span>
          </button>
        </div>

        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            disabled={!hasCurrentItems || exportingKind !== null}
            onClick={() => handleExportFile('apkg')}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md hover:bg-surface-3 text-[11px] font-medium text-ink-2 hover:text-ink disabled:opacity-40 cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>{exportingKind === 'apkg' ? '생성 중' : '.apkg'}</span>
          </button>

          <button
            type="button"
            disabled={!hasCurrentItems || exportingKind !== null}
            onClick={() => handleExportFile('csv')}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md hover:bg-surface-3 text-[11px] font-medium text-ink-2 hover:text-ink disabled:opacity-40 cursor-pointer"
          >
            <Table2 className="w-3 h-3" />
            <span>{exportingKind === 'csv' ? '생성 중' : '.csv'}</span>
          </button>

          <button
            type="button"
            disabled={!hasCurrentItems || exportingKind !== null}
            onClick={activeTab === 'sentences' ? handleBulkExportSentences : handleBulkExportVocab}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-40 text-accent-ink text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
          >
            {exportingKind === 'anki' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{activeTab === 'sentences' ? '문장 전체 Anki 전송' : '단어 전체 Anki 전송'}</span>
          </button>
        </div>
      </div>

      {/* Scrollable Card Queue */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {activeTab === 'sentences' ? (
          sortedStarred.length === 0 ? (
            <div className="py-12 px-4 text-center text-xs text-ink-3 leading-relaxed">
              보관된 문장이 없습니다.
              <br />
              자막 목록 또는 말하기 모드에서 <strong className="text-ink-2">보관 (A)</strong>을 눌러 문장을 모아보세요.
            </div>
          ) : (
            sortedStarred.map((idx) => {
              const sub = subtitles[idx];
              const sentenceVal = editedText[idx] ?? sub?.text_en ?? '';
              const transVal = editedTranslation[idx] ?? sub?.text_kr ?? '';
              const timeStr =
                sub && sub.start_ms !== undefined && sub.end_ms !== undefined
                  ? `${formatTime(sub.start_ms)} ~ ${formatTime(sub.end_ms)}`
                  : `문장 #${idx + 1}`;
              const isBusy = busyCardId === `sent-${idx}`;

              return (
                <div
                  key={idx}
                  className="card-surface rounded-xl bg-canvas/55 border border-line p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="num font-mono text-[11px] text-ink-3">{timeStr}</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleExtractSingleSentence(idx)}
                        className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-good/15 hover:bg-good/25 border border-good/30 text-good text-[11px] font-medium cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3 h-3" />
                        <span>{isBusy ? '추출 중' : '개별 추출'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveStarredSentence(idx)}
                        className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-danger/10 hover:bg-danger/20 border border-danger/25 text-danger text-[11px] font-medium cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>삭제</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    value={sentenceVal}
                    onChange={(e) => onEditSentence(idx, e.target.value)}
                    placeholder="영어 문장"
                    className="w-full rounded-lg bg-surface border border-line px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent resize-y"
                  />

                  <input
                    type="text"
                    value={transVal}
                    onChange={(e) => onEditTranslation(idx, e.target.value)}
                    placeholder="한국어 뜻 (비어있으면 Anki 전송 시 AI 자동 번역)"
                    className="w-full h-8 rounded-lg bg-surface border border-line px-2.5 text-xs text-good placeholder:text-ink-3 outline-none focus:border-accent"
                  />
                </div>
              );
            })
          )
        ) : pendingVocab.length === 0 ? (
          <div className="py-12 px-4 text-center text-xs text-ink-3 leading-relaxed">
            보관된 단어/표현이 없습니다.
            <br />
            자막에서 단어를 클릭해 <strong className="text-ink-2">보관 (A)</strong>을 눌러보세요.
          </div>
        ) : (
          pendingVocab.map((v) => {
            const isBusy = busyCardId === v.id;
            return (
              <div
                key={v.id}
                className="card-surface rounded-xl bg-canvas/55 border border-line p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={v.word}
                    onChange={(e) => onUpdateVocab(v.id, { word: e.target.value })}
                    placeholder="단어/표현"
                    className="flex-1 min-w-0 h-7 px-2 rounded-md bg-surface border border-line text-[13px] font-semibold text-ink outline-none focus:border-accent"
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleExtractSingleVocab(v)}
                      className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent text-[11px] font-medium cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" />
                      <span>{isBusy ? '전송 중' : 'Anki 전송'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveVocab(v.id)}
                      className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-danger/10 hover:bg-danger/20 border border-danger/25 text-danger text-[11px] font-medium cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>삭제</span>
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={v.meaning}
                  onChange={(e) => onUpdateVocab(v.id, { meaning: e.target.value })}
                  placeholder="뜻/해석"
                  className="w-full h-8 rounded-lg bg-surface border border-line px-2.5 text-xs font-medium text-good outline-none focus:border-accent"
                />

                <textarea
                  rows={2}
                  value={v.explanation}
                  onChange={(e) => onUpdateVocab(v.id, { explanation: e.target.value })}
                  placeholder="2단계 설명 (뜻·뉘앙스 / 콜로케이션)"
                  className="w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-xs text-ink-2 outline-none focus:border-accent resize-y"
                />

                <input
                  type="text"
                  value={v.example}
                  onChange={(e) => onUpdateVocab(v.id, { example: e.target.value })}
                  placeholder="예문"
                  className="w-full h-7 rounded-lg bg-surface border border-line px-2.5 text-[11px] italic text-ink-3 outline-none focus:border-accent"
                />
              </div>
            );
          })
        )}
      </div>

      {bulkProgressText && (
        <div className="px-4 py-2.5 border-t border-line bg-surface-2 text-center text-xs font-medium text-accent">
          {bulkProgressText}
        </div>
      )}
    </div>
  );
};
