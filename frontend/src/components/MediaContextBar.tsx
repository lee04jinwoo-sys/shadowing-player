import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Globe,
  History,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';
import type { Episode, SourceMode, YouTubeHistoryItem } from '../types';

interface MediaContextBarProps {
  sourceMode: Exclude<SourceMode, 'explore'>;
  episodes: Episode[];
  selectedEpKey: string;
  completedEpisodes: Set<string>;
  extractedByEpisode: Record<string, number[]>;
  onSelectEpisode: (epKey: string) => void;
  onRefreshEpisodes: () => void;
  onSearchOnlineSubtitles: (epKey: string) => Promise<boolean>;
  onToggleEpisodeComplete: (epKey: string) => void;
  youtubeUrl: string;
  onChangeYoutubeUrl: (val: string) => void;
  onLoadYoutube: (url: string) => void;
  youtubeLoading: boolean;
  youtubeHistory: YouTubeHistoryItem[];
}

export const MediaContextBar: React.FC<MediaContextBarProps> = ({
  sourceMode,
  episodes,
  selectedEpKey,
  completedEpisodes,
  extractedByEpisode,
  onSelectEpisode,
  onRefreshEpisodes,
  onSearchOnlineSubtitles,
  onToggleEpisodeComplete,
  youtubeUrl,
  onChangeYoutubeUrl,
  onLoadYoutube,
  youtubeLoading,
  youtubeHistory,
}) => {
  const [subSearchState, setSubSearchState] = useState<'idle' | 'loading' | 'done' | 'fail'>('idle');
  const [epMenuOpen, setEpMenuOpen] = useState(false);
  const [histMenuOpen, setHistMenuOpen] = useState(false);

  const epMenuRef = useRef<HTMLDivElement | null>(null);
  const histMenuRef = useRef<HTMLDivElement | null>(null);

  const activeEpisode = episodes.find((ep) => ep.ep_key === selectedEpKey) ?? null;
  const isCompleted = Boolean(selectedEpKey && completedEpisodes.has(selectedEpKey));

  useEffect(() => {
    if (!epMenuOpen && !histMenuOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (epMenuOpen && epMenuRef.current && target && !epMenuRef.current.contains(target)) {
        setEpMenuOpen(false);
      }
      if (histMenuOpen && histMenuRef.current && target && !histMenuRef.current.contains(target)) {
        setHistMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEpMenuOpen(false);
        setHistMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [epMenuOpen, histMenuOpen]);

  const handleOnlineSearch = async () => {
    if (!selectedEpKey || subSearchState === 'loading') return;
    setSubSearchState('loading');
    const ok = await onSearchOnlineSubtitles(selectedEpKey);
    setSubSearchState(ok ? 'done' : 'fail');
    window.setTimeout(() => setSubSearchState('idle'), 2200);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-surface px-3.5 py-2 shrink-0">
      {sourceMode === 'local' ? (
        <>
          <div ref={epMenuRef} className="relative flex-1 min-w-[200px] max-w-xl">
            <button
              type="button"
              aria-label="에피소드 선택"
              aria-haspopup="listbox"
              aria-expanded={epMenuOpen}
              onClick={() => setEpMenuOpen((v) => !v)}
              className="w-full h-8 px-2.5 rounded-lg bg-surface-2/80 hover:bg-surface-2 flex items-center justify-between gap-2 text-left text-xs transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 min-w-0">
                {activeEpisode ? (
                  <>
                    <span className="num font-mono text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-accent/15 text-accent shrink-0">
                      {activeEpisode.ep_key.toUpperCase()}
                    </span>
                    <span className="truncate font-medium text-ink">
                      {activeEpisode.video_filename}
                    </span>
                    <span className="font-mono text-[10px] text-ink-3 uppercase shrink-0 hidden sm:inline">
                      {activeEpisode.format}
                    </span>
                    {isCompleted && (
                      <span
                        title="학습 완료됨"
                        className="w-1.5 h-1.5 rounded-full bg-good shrink-0"
                      />
                    )}
                  </>
                ) : (
                  <span className="text-ink-3">
                    {episodes.length === 0 ? '등록된 에피소드가 없습니다' : '에피소드를 선택하세요'}
                  </span>
                )}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-ink-3 shrink-0 transition-transform ${
                  epMenuOpen ? 'rotate-180 text-accent' : ''
                }`}
              />
            </button>

            {epMenuOpen && (
              <div
                role="listbox"
                aria-label="에피소드 목록"
                className="absolute left-0 top-full mt-1.5 z-50 w-full min-w-[280px] max-h-72 overflow-y-auto rounded-xl bg-surface-2 border border-line-strong shadow-2xl p-1 divide-y divide-line/50"
              >
                {episodes.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-ink-3">
                    설정에서 로컬 영상 폴더를 지정해 주세요.
                  </div>
                ) : (
                  episodes.map((ep) => {
                    const selected = ep.ep_key === selectedEpKey;
                    const done = completedEpisodes.has(ep.ep_key);
                    const extCount = extractedByEpisode[ep.ep_key]?.length || 0;
                    return (
                      <button
                        key={ep.ep_key}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          onSelectEpisode(ep.ep_key);
                          setEpMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                          selected
                            ? 'bg-accent/15 text-ink'
                            : 'text-ink-2 hover:bg-surface-3 hover:text-ink'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-3.5 shrink-0 flex items-center justify-center">
                            {selected && <Check className="w-3.5 h-3.5 text-accent" />}
                          </span>
                          <span className="num font-mono text-[10.5px] font-semibold text-accent shrink-0">
                            {ep.ep_key.toUpperCase()}
                          </span>
                          <span className="truncate font-medium">{ep.video_filename}</span>
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {done && (
                            <span className="px-1.5 py-0.5 rounded bg-good/15 text-good text-[10px] font-semibold">
                              완료
                            </span>
                          )}
                          {extCount > 0 && (
                            <span className="num px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[10px] font-semibold">
                              추출 {extCount}
                            </span>
                          )}
                          <span className="font-mono text-[10px] text-ink-3 uppercase">
                            {ep.format}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onRefreshEpisodes}
            aria-label="에피소드 목록 새로고침"
            title="로컬 폴더 다시 스캔"
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {selectedEpKey && (
            <div className="flex items-center gap-1 ml-auto">
              <button
                type="button"
                onClick={handleOnlineSearch}
                disabled={subSearchState === 'loading'}
                title="온라인에서 자막을 자동으로 검색하여 다운로드합니다"
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  subSearchState === 'done'
                    ? 'bg-good/15 text-good'
                    : subSearchState === 'fail'
                      ? 'bg-danger/15 text-danger'
                      : 'text-ink-2 hover:text-ink hover:bg-surface-2'
                }`}
              >
                {subSearchState === 'loading' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Globe className="w-3.5 h-3.5" />
                )}
                <span>
                  {subSearchState === 'loading'
                    ? '검색 중...'
                    : subSearchState === 'done'
                      ? '자막 완료'
                      : subSearchState === 'fail'
                        ? '검색 실패'
                        : '온라인 자막 검색'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onToggleEpisodeComplete(selectedEpKey)}
                title="이 에피소드 학습 완료 상태를 전환합니다"
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isCompleted
                    ? 'bg-good/15 text-good'
                    : 'text-ink-2 hover:text-ink hover:bg-surface-2'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isCompleted ? '완료됨' : '완료 표시'}</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => onChangeYoutubeUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && youtubeUrl.trim()) {
                  e.preventDefault();
                  onLoadYoutube(youtubeUrl.trim());
                }
              }}
              placeholder="유튜브 링크(URL) 또는 Video ID를 붙여넣으세요..."
              className="flex-1 h-8 px-3 rounded-lg bg-surface-2 border border-line text-[13px] text-ink placeholder:text-ink-3 outline-none focus:border-accent transition-colors"
            />
            <button
              type="button"
              disabled={youtubeLoading || !youtubeUrl.trim()}
              onClick={() => youtubeUrl.trim() && onLoadYoutube(youtubeUrl.trim())}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-45 text-accent-ink text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              {youtubeLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{youtubeLoading ? '불러오는 중' : '불러오기'}</span>
            </button>
          </div>

          <div ref={histMenuRef} className="relative">
            <button
              type="button"
              aria-label="최근 유튜브 영상"
              aria-haspopup="listbox"
              aria-expanded={histMenuOpen}
              onClick={() => setHistMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-surface-2/80 hover:bg-surface-2 text-xs font-medium text-ink-2 hover:text-ink transition-colors whitespace-nowrap cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-ink-3" />
              <span className="num">최근 영상 ({youtubeHistory.length})</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-ink-3 transition-transform ${
                  histMenuOpen ? 'rotate-180 text-accent' : ''
                }`}
              />
            </button>

            {histMenuOpen && (
              <div
                role="listbox"
                aria-label="최근 유튜브 기록"
                className="absolute right-0 top-full mt-1.5 z-50 w-72 max-h-64 overflow-y-auto rounded-xl bg-surface-2 border border-line-strong shadow-2xl p-1 divide-y divide-line/50"
              >
                {youtubeHistory.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-ink-3">
                    최근 시청한 YouTube 영상이 없습니다.
                  </div>
                ) : (
                  youtubeHistory.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => {
                        const url = `https://www.youtube.com/watch?v=${item.id}`;
                        onChangeYoutubeUrl(url);
                        onLoadYoutube(url);
                        setHistMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors cursor-pointer"
                    >
                      <Play className="w-3 h-3 text-accent shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
