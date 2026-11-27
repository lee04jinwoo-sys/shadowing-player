import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookmarkPlus,
  Check,
  Loader2,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { addVocabCardToAnki, lookupWord } from '../api';
import type {
  DictLookupResult,
  DictPopoverRequest,
  SavedVocabItem,
  ToastTone,
} from '../types';

interface DictPopoverProps {
  request: DictPopoverRequest | null;
  ankiConnected: boolean;
  savedVocab: SavedVocabItem[];
  onClose: () => void;
  onLookupPhrase: (req: DictPopoverRequest) => void;
  onSaveVocabLocal: (item: Omit<SavedVocabItem, 'id'>) => SavedVocabItem;
  onToast: (msg: string, tone?: ToastTone) => void;
}

function cleanLookupWord(raw: string): string {
  return raw.replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '').trim();
}

function getPosBadgeClass(pos: string): string {
  const lower = pos.trim().toLowerCase();
  if (lower.startsWith('n')) return 'text-info bg-info/12 border-info/30';
  if (lower.startsWith('v')) return 'text-good bg-good/12 border-good/30';
  if (lower.startsWith('adj') || lower.startsWith('형')) {
    return 'text-warn bg-warn/12 border-warn/30';
  }
  if (lower.startsWith('adv') || lower.startsWith('부')) {
    return 'text-accent bg-accent/12 border-accent/30';
  }
  if (lower.includes('idiom') || lower.includes('phrase') || lower.includes('숙')) {
    return 'text-accent bg-accent/15 border-accent/35';
  }
  return 'text-ink-2 bg-surface-2 border-line';
}

function clearTokenSelection(): void {
  document.querySelectorAll('.word-token.token-selected').forEach((el) => {
    el.classList.remove('token-selected');
  });
}

export const DictPopover: React.FC<DictPopoverProps> = ({
  request,
  ankiConnected,
  savedVocab,
  onClose,
  onLookupPhrase,
  onSaveVocabLocal,
  onToast,
}) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const requestSeqRef = useRef(0);
  const activePromiseRef = useRef<Promise<DictLookupResult> | null>(null);
  const savedVocabRef = useRef<SavedVocabItem[]>(savedVocab);
  savedVocabRef.current = savedVocab;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<DictLookupResult | null>(null);

  const [editWord, setEditWord] = useState('');
  const [editPhonetic, setEditPhonetic] = useState('');
  const [editPos, setEditPos] = useState('');
  const [editMeaning, setEditMeaning] = useState('');
  const [editExplanation, setEditExplanation] = useState('');
  const [editExample, setEditExample] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedMode, setSavedMode] = useState<'none' | 'local' | 'anki'>('none');
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 16, top: 16 });

  const cleanWord = request ? cleanLookupWord(request.word) : '';
  const isActive = Boolean(request && cleanWord.length >= 2);

  const handleClose = useCallback(() => {
    clearTokenSelection();
    onClose();
  }, [onClose]);

  const updatePosition = useCallback(() => {
    if (!request) return;
    const popWidth = 344;
    const measuredHeight = popoverRef.current?.offsetHeight || 320;
    const margin = 12;

    let left = request.anchorRect.left;
    let top = request.anchorRect.bottom + 8;

    if (left + popWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - popWidth - margin);
    }
    if (left < margin) left = margin;

    if (top + measuredHeight > window.innerHeight - margin) {
      top = Math.max(margin, request.anchorRect.top - measuredHeight - 8);
    }
    if (top < margin) top = margin;

    setCoords({ left, top });
  }, [request]);

  useLayoutEffect(() => {
    if (!isActive) return;
    updatePosition();
  }, [isActive, loading, result, errorMsg, savedMode, updatePosition]);

  useEffect(() => {
    if (!request) {
      clearTokenSelection();
      return;
    }
    const word = cleanLookupWord(request.word);
    if (word.length < 2) {
      handleClose();
      return;
    }

    const seq = ++requestSeqRef.current;
    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    setEditWord(word);
    setEditPhonetic('');
    setEditPos('');
    setEditMeaning('');
    setEditExplanation('');
    setEditExample(request.context || '');

    const existing = savedVocabRef.current.find(
      (v) => v.word.toLowerCase() === word.toLowerCase(),
    );
    setSavedMode(existing ? (existing.extracted ? 'anki' : 'local') : 'none');

    const promise = lookupWord(word, request.context);
    activePromiseRef.current = promise;

    promise
      .then((res) => {
        if (seq !== requestSeqRef.current) return;
        const resolvedWord = res.lemma || res.word || word;
        setResult(res);
        setEditWord(resolvedWord);
        setEditPhonetic(res.phonetic || '');
        setEditPos(res.pos || '');
        setEditMeaning(res.meaning || '');
        setEditExplanation(res.explanation || '');
        setEditExample(res.example || request.context || '');

        const match = savedVocabRef.current.find(
          (v) => v.word.toLowerCase() === resolvedWord.toLowerCase(),
        );
        if (match) {
          setSavedMode(match.extracted ? 'anki' : 'local');
        }
      })
      .catch((err: unknown) => {
        if (seq !== requestSeqRef.current) return;
        setErrorMsg(err instanceof Error ? err.message : '사전 조회에 실패했습니다.');
      })
      .finally(() => {
        if (seq === requestSeqRef.current) {
          setLoading(false);
          activePromiseRef.current = null;
        }
      });
  }, [request, handleClose]);

  const handleSpeak = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onToast('이 브라우저는 음성 합성(TTS)을 지원하지 않습니다.', 'warn');
      return;
    }
    const targetWord = editWord.trim() || cleanWord;
    if (!targetWord) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(targetWord);
    utter.lang = 'en-US';
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
  }, [editWord, cleanWord, onToast]);

  const handleSave = useCallback(async () => {
    if (!isActive || saving) return;
    setSaving(true);

    let wordVal = editWord.trim() || cleanWord;
    let meaningVal = editMeaning.trim();
    let posVal = editPos.trim();
    let explanationVal = editExplanation.trim();
    let exampleVal = editExample.trim();

    if (activePromiseRef.current) {
      try {
        const res = await activePromiseRef.current;
        wordVal = res.lemma || res.word || wordVal;
        if (!meaningVal) meaningVal = res.meaning || '';
        if (!posVal) posVal = res.pos || '';
        if (!explanationVal) explanationVal = res.explanation || '';
        if (!exampleVal) exampleVal = res.example || '';
      } catch {
        // Proceed with whatever the user has even if lookup failed
      }
    }

    if (!wordVal) {
      setSaving(false);
      return;
    }

    onSaveVocabLocal({
      word: wordVal,
      meaning: meaningVal,
      pos: posVal,
      example: exampleVal,
      explanation: explanationVal,
      extracted: false,
    });

    if (ankiConnected) {
      try {
        const res = await addVocabCardToAnki({
          word: wordVal,
          meaning: meaningVal,
          pos: posVal,
          example: exampleVal,
          explanation: explanationVal,
        });
        if (res.success) {
          onSaveVocabLocal({
            word: wordVal,
            meaning: meaningVal,
            pos: posVal,
            example: exampleVal,
            explanation: explanationVal,
            extracted: true,
            note_id: res.note_id ?? null,
          });
          setSavedMode('anki');
          onToast(
            res.duplicate
              ? `'${wordVal}' Anki 중복 카드 확인 — 보관 완료`
              : `'${wordVal}' Anki 카드 생성 및 보관 완료`,
            'success',
          );
        } else {
          setSavedMode('local');
          onToast(`Anki 전송 실패 (${res.error || '오류'}) — 로컬 대기열에 보관됨`, 'warn');
        }
      } catch {
        setSavedMode('local');
        onToast('Anki 연결 오류 — 추출 대기열에 보관됨', 'warn');
      }
    } else {
      setSavedMode('local');
      onToast(`'${wordVal}' 로컬 보관 완료 (추출 탭 대기열에 추가됨)`, 'info');
    }

    setSaving(false);
  }, [
    isActive,
    saving,
    editWord,
    cleanWord,
    editMeaning,
    editPos,
    editExplanation,
    editExample,
    ankiConnected,
    onSaveVocabLocal,
    onToast,
  ]);

  useEffect(() => {
    if (!isActive) return;

    const handleDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (target.closest('.word-token')) return;
      handleClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

      const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
      const isEditing =
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        (document.activeElement as HTMLElement | null)?.isContentEditable;
      if (isEditing) return;

      if (
        (e.code === 'KeyA' || e.key === 'a' || e.key === 'A' || e.key === 'ㅁ') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        void handleSave();
      }
    };

    const handleScrollClose = (e: Event) => {
      const target = e.target as Node | null;
      if (target && popoverRef.current?.contains(target)) return;
      handleClose();
    };

    document.addEventListener('mousedown', handleDocMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleScrollClose, true);
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleScrollClose, true);
    };
  }, [isActive, handleClose, handleSave, updatePosition]);

  if (!isActive || !request) return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="단어 사전 팝오버"
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
      className="fixed z-[8500] w-[344px] max-w-[calc(100vw-24px)] rounded-2xl bg-surface border border-line-strong shadow-2xl overflow-hidden text-ink"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3.5 pt-3 pb-2.5 border-b border-line bg-surface-2/60">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={editWord}
              onChange={(e) => setEditWord(e.target.value)}
              aria-label="표제어"
              className="min-w-0 flex-1 bg-transparent text-base font-semibold tracking-tight text-ink border-b border-transparent focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSpeak}
              title="발음 듣기"
              aria-label="발음 듣기"
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-ink-2 hover:text-accent hover:bg-surface border border-transparent hover:border-line transition-colors cursor-pointer shrink-0"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <input
              type="text"
              value={editPhonetic}
              onChange={(e) => setEditPhonetic(e.target.value)}
              placeholder="/발음기호/"
              aria-label="발음기호"
              className="w-28 bg-transparent font-mono text-[11px] text-ink-3 border-b border-transparent focus:border-accent focus:outline-none"
            />
            <input
              type="text"
              value={editPos}
              onChange={(e) => setEditPos(e.target.value)}
              placeholder="품사"
              aria-label="품사"
              className={`w-20 px-1.5 py-0.5 rounded-md border text-[10.5px] font-medium text-center focus:outline-none ${getPosBadgeClass(editPos)}`}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          title="닫기 (Esc)"
          aria-label="사전 닫기"
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="px-3.5 py-3 space-y-2.5 max-h-[340px] overflow-y-auto">
        {loading && !result && (
          <div className="flex items-center gap-2 py-4 text-xs text-ink-2 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
            <span>AI 문맥 사전 조회 중...</span>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-lg bg-danger/10 border border-danger/25 px-3 py-2 text-xs text-danger">
            {errorMsg}
          </div>
        )}

        {(!loading || result) && (
          <>
            <div>
              <label className="block text-[10.5px] font-medium text-ink-3 mb-1">
                문맥 핵심 뜻 (클릭해 수정 가능)
              </label>
              <input
                type="text"
                value={editMeaning}
                onChange={(e) => setEditMeaning(e.target.value)}
                placeholder="핵심 의미 입력"
                className="w-full px-2.5 py-1.5 rounded-lg bg-canvas border border-line text-sm font-medium text-ink focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10.5px] font-medium text-ink-3 mb-1">
                예문
              </label>
              <textarea
                rows={2}
                value={editExample}
                onChange={(e) => setEditExample(e.target.value)}
                placeholder="예문"
                className="w-full px-2.5 py-1.5 rounded-lg bg-canvas border border-line text-xs text-ink-2 leading-relaxed italic resize-none focus:border-accent focus:outline-none"
              />
            </div>

            {result?.related_phrase?.phrase && (
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() =>
                    onLookupPhrase({
                      word: result.related_phrase!.phrase,
                      context: request.context,
                      anchorRect: request.anchorRect,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/12 border border-accent/30 text-[11px] text-accent hover:bg-accent/20 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span className="font-medium">{result.related_phrase.phrase}</span>
                  {result.related_phrase.meaning && (
                    <span className="text-ink-2 truncate max-w-[140px]">
                      — {result.related_phrase.meaning}
                    </span>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-t border-line bg-surface-2/40">
        <span className="text-[11px] text-ink-3">
          {savedMode === 'anki'
            ? 'Anki 전송됨'
            : savedMode === 'local'
              ? '추출 대기열 보관됨'
              : ankiConnected
                ? '저장 시 Anki 즉시 전송'
                : '오프라인 — 대기열에 저장'}
        </span>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            savedMode === 'anki'
              ? 'bg-good/15 text-good border border-good/35 hover:bg-good/20'
              : savedMode === 'local'
                ? 'bg-warn/15 text-warn border border-warn/35 hover:bg-warn/20'
                : 'bg-accent text-accent-ink font-semibold hover:bg-accent-hover'
          } disabled:opacity-60`}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : savedMode !== 'none' ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <BookmarkPlus className="w-3.5 h-3.5" />
          )}
          <span>
            {saving
              ? '저장 중...'
              : savedMode === 'anki'
                ? '다시 보관 (A)'
                : savedMode === 'local'
                  ? 'Anki 재전송 (A)'
                  : '보관 (A)'}
          </span>
        </button>
      </div>
    </div>,
    document.body,
  );
};
