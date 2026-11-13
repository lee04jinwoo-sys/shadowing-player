import React, { useEffect, useRef } from 'react';
import { Eye, EyeOff, Play, Star } from 'lucide-react';
import type { DictPopoverRequest, SavedVocabItem, SubtitleItem } from '../types';
import { formatTime } from '../utils/subtitles';
import { WordTokens } from './WordTokens';

interface ListeningPanelProps {
  subtitles: SubtitleItem[];
  activeSubIndex: number;
  playbackSpeed: number;
  blurRevealed: boolean;
  starredSubtitles: Set<number>;
  extractedSubtitles: Set<number>;
  savedVocab: SavedVocabItem[];
  loadingMessage: string | null;
  errorMessage: string | null;
  errorHintQuery: string | null;
  onExploreHint: (query: string) => void;
  onSwitchToLocal: () => void;
  onToggleBlur: () => void;
  onToggleStar: (idx: number) => void;
  onSeekToSubtitle: (idx: number) => void;
  onLookupWord: (req: DictPopoverRequest) => void;
}

export const ListeningPanel: React.FC<ListeningPanelProps> = ({
  subtitles,
  activeSubIndex,
  playbackSpeed,
  blurRevealed,
  starredSubtitles,
  extractedSubtitles,
  savedVocab,
  loadingMessage,
  errorMessage,
  errorHintQuery,
  onExploreHint,
  onSwitchToLocal,
  onToggleBlur,
  onToggleStar,
  onSeekToSubtitle,
  onLookupWord,
}) => {
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (activeSubIndex < 0) return;
    const container = listRef.current;
    const row = rowRefs.current[activeSubIndex];
    if (!container || !row) return;

    const targetTop = row.offsetTop - container.clientHeight / 2 + row.offsetHeight / 2;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: playbackSpeed > 1.2 ? 'auto' : 'smooth',
    });
  }, [activeSubIndex, playbackSpeed]);

  const activeIsStarred = activeSubIndex >= 0 && starredSubtitles.has(activeSubIndex);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Sub-header toolbar */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-line bg-surface-2/30">
        <span className="num text-[11px] font-medium text-ink-3">
          자막 {subtitles.length > 0 ? `${subtitles.length}줄` : '목록'}
        </span>

        <div className="flex items-center gap-1">
          {activeSubIndex >= 0 && (
            <button
              type="button"
              onClick={() => onToggleStar(activeSubIndex)}
              title="현재 문장 보관/해제 (A)"
              className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                activeIsStarred
                  ? 'bg-warn/15 text-warn'
                  : 'text-ink-2 hover:text-ink hover:bg-surface-2'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${activeIsStarred ? 'fill-current' : ''}`} />
              <span>{activeIsStarred ? '보관됨' : '보관 (A)'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleBlur}
            title={
              blurRevealed
                ? '전체 자막 블러 토글 (단축키: V) — 현재 보임 상태'
                : '전체 자막 블러 토글 (단축키: V) — 현재 가림 상태 (마우스 올리면 표시)'
            }
            className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              blurRevealed
                ? 'bg-accent/15 text-accent'
                : 'text-ink-2 hover:text-ink hover:bg-surface-2'
            }`}
          >
            {blurRevealed ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{blurRevealed ? '자막 보임 (V)' : '자막 숨김 (V)'}</span>
          </button>
        </div>
      </div>

      {/* Subtitle list */}
      <div
        ref={listRef}
        className={`flex-1 overflow-y-auto divide-y divide-line/60 ${
          !blurRevealed ? 'listening-blurred' : ''
        }`}
      >
        {loadingMessage && (
          <div className="space-y-2.5 p-3.5">
            <div className="text-center text-xs text-ink-3 py-1">{loadingMessage}</div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-line bg-surface-2/40 p-3 space-y-2"
              >
                <div className="skeleton h-3 w-12 rounded" />
                <div className="skeleton h-4 w-5/6 rounded" />
                <div className="skeleton h-3 w-3/5 rounded" />
              </div>
            ))}
          </div>
        )}

        {!loadingMessage && errorMessage && (
          <div className="space-y-3 py-8 px-4">
            <div className="text-center text-xs font-medium text-danger">{errorMessage}</div>
            {errorHintQuery && (
              <div className="p-3.5 rounded-xl bg-surface-2/60 border border-line text-center space-y-2.5">
                <p className="text-xs text-ink-2 leading-relaxed">
                  내 컴퓨터의 로컬 영상을 보려면 상단{' '}
                  <button
                    type="button"
                    onClick={onSwitchToLocal}
                    className="font-semibold text-accent underline underline-offset-2 cursor-pointer"
                  >
                    로컬
                  </button>{' '}
                  탭을 선택하세요.
                </p>
                <button
                  type="button"
                  onClick={() => onExploreHint(errorHintQuery)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent hover:bg-accent-hover text-accent-ink text-xs font-semibold cursor-pointer"
                >
                  <span>&apos;{errorHintQuery}&apos; 유튜브 탐색하기</span>
                </button>
              </div>
            )}
          </div>
        )}

        {!loadingMessage && !errorMessage && subtitles.length === 0 && (
          <div className="py-12 px-4 text-center text-xs text-ink-3 leading-relaxed">
            에피소드 또는 유튜브 영상을 불러오면 자막 목록이 여기에 표시됩니다.
          </div>
        )}

        {!loadingMessage &&
          !errorMessage &&
          subtitles.map((sub, idx) => {
            const isActive = idx === activeSubIndex;
            const isExtracted = extractedSubtitles.has(idx);
            const isStarred = starredSubtitles.has(idx);

            const leftAccentClass = isActive
              ? 'border-l-[3px] border-l-accent bg-accent/[0.08]'
              : isExtracted
                ? 'border-l-[3px] border-l-good hover:bg-surface-2/50'
                : isStarred
                  ? 'border-l-[3px] border-l-warn hover:bg-surface-2/50'
                  : 'border-l-[3px] border-l-transparent hover:bg-surface-2/50';

            return (
              <div
                key={`${sub.start_ms}-${idx}`}
                ref={(el) => {
                  rowRefs.current[idx] = el;
                }}
                tabIndex={0}
                onKeyDown={(e) => {
                  if ((e.target as HTMLElement).closest('.word-token')) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSeekToSubtitle(idx);
                  }
                }}
                onClick={(e) => {
                  const sel = window.getSelection();
                  if (sel && sel.toString().trim().length > 0) return;
                  if ((e.target as HTMLElement).closest('.word-token')) return;
                  onSeekToSubtitle(idx);
                }}
                className={`subtitle-row group relative grid grid-cols-[52px_1fr] gap-2.5 px-3 py-2.5 transition-colors cursor-pointer ${leftAccentClass}`}
              >
                <div className="pt-0.5 flex flex-col items-start gap-1">
                  <span
                    className={`num font-mono text-[11px] font-medium ${
                      isActive ? 'text-accent' : 'text-ink-3'
                    }`}
                  >
                    {formatTime(sub.start_ms)}
                  </span>
                  {isExtracted && (
                    <span className="text-[10px] font-semibold text-good leading-none">
                      추출
                    </span>
                  )}
                  {!isExtracted && isStarred && (
                    <span className="text-[10px] font-semibold text-warn leading-none">
                      보관
                    </span>
                  )}
                </div>

                <div className="min-w-0 pr-12">
                  <div className="sub-text-en text-[14px] font-medium leading-snug text-ink">
                    <WordTokens
                      text={sub.text_en}
                      contextSentence={sub.text_en}
                      scopeKey={`sub-${idx}`}
                      savedVocab={savedVocab}
                      onLookupWord={onLookupWord}
                    />
                  </div>

                  {sub.text_kr && (
                    <div className="sub-text-kr mt-1 text-xs leading-snug text-ink-2">
                      {sub.text_kr}
                    </div>
                  )}
                </div>

                <div className="absolute right-2.5 top-2 flex items-center gap-0.5 opacity-75 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(idx);
                    }}
                    title="이 문장 보관/해제"
                    className={`grid h-6 w-6 place-items-center rounded-md transition-colors cursor-pointer ${
                      isStarred
                        ? 'bg-warn/15 text-warn'
                        : 'text-ink-3 hover:text-ink hover:bg-surface-3'
                    }`}
                  >
                    <Star className={`w-3 h-3 ${isStarred ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeekToSubtitle(idx);
                    }}
                    title="이 구간 재생"
                    className="grid h-6 w-6 place-items-center rounded-md text-ink-3 hover:text-ink hover:bg-surface-3 cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
