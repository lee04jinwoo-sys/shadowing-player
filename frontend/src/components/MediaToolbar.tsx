import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Globe, Loader2 } from 'lucide-react';

interface MediaToolbarProps {
  title?: string;
  /** Local episode key. Absent for YouTube, which hides the episode-only actions. */
  epKey?: string;
  completed: boolean;
  onSearchOnlineSubtitles: (epKey: string) => Promise<boolean>;
  onToggleComplete: (epKey: string) => void;
}

/** Slim bar above the video: serif title plus per-episode actions. */
export const MediaToolbar: React.FC<MediaToolbarProps> = ({
  title,
  epKey,
  completed,
  onSearchOnlineSubtitles,
  onToggleComplete,
}) => {
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'done' | 'fail'>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleSearch = async () => {
    if (!epKey || searchState === 'loading') return;
    setSearchState('loading');
    const ok = await onSearchOnlineSubtitles(epKey);
    setSearchState(ok ? 'done' : 'fail');
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setSearchState('idle');
    }, 2200);
  };

  const pillBase =
    'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-colors whitespace-nowrap cursor-pointer';

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-line shrink-0">
      <h2
        title={title}
        className="text-[15px] font-semibold text-ink truncate min-w-0 flex-1"
      >
        {title || '영상을 선택하세요'}
      </h2>

      {epKey && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSearch}
            disabled={searchState === 'loading'}
            title="온라인에서 자막을 자동으로 검색하여 다운로드합니다"
            className={`${pillBase} ${
              searchState === 'done'
                ? 'border-good/40 bg-good/10 text-good'
                : searchState === 'fail'
                  ? 'border-danger/40 bg-danger/10 text-danger'
                  : 'border-line bg-card text-ink-2 hover:text-ink hover:border-line-strong'
            }`}
          >
            {searchState === 'loading' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Globe className="w-3.5 h-3.5" />
            )}
            <span>
              {searchState === 'loading'
                ? '검색 중...'
                : searchState === 'done'
                  ? '자막 완료'
                  : searchState === 'fail'
                    ? '검색 실패'
                    : '온라인 자막 검색'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onToggleComplete(epKey)}
            title="이 에피소드 학습 완료 상태를 전환합니다"
            className={`${pillBase} ${
              completed
                ? 'border-good/40 bg-good/10 text-good'
                : 'border-line bg-card text-ink-2 hover:text-ink hover:border-line-strong'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{completed ? '완료됨' : '완료 표시'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
