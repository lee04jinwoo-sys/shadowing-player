import React, { useState } from 'react';
import { CheckCircle2, Globe, Loader2, Play, RefreshCw } from 'lucide-react';
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
  const isCompleted = Boolean(selectedEpKey && completedEpisodes.has(selectedEpKey));

  const handleOnlineSearch = async () => {
    if (!selectedEpKey || subSearchState === 'loading') return;
    setSubSearchState('loading');
    const ok = await onSearchOnlineSubtitles(selectedEpKey);
    setSubSearchState(ok ? 'done' : 'fail');
    window.setTimeout(() => setSubSearchState('idle'), 2200);
  };

  return (
    <div className="card-surface flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2">
      {sourceMode === 'local' ? (
        <>
          <select
            aria-label="에피소드 선택"
            value={selectedEpKey}
            onChange={(e) => onSelectEpisode(e.target.value)}
            className="flex-1 min-w-[200px] max-w-lg h-9 px-3 rounded-xl bg-surface-2 border border-line text-[13px] font-medium text-ink outline-none focus:border-accent transition-colors cursor-pointer"
          >
            <option value="">
              {episodes.length === 0 ? '등록된 에피소드가 없습니다' : '에피소드를 선택하세요'}
            </option>
            {episodes.map((ep) => {
              const done = completedEpisodes.has(ep.ep_key);
              const hasExt = (extractedByEpisode[ep.ep_key]?.length || 0) > 0;
              const prefix = `${done ? '[완료] ' : ''}${hasExt ? '[추출] ' : ''}`;
              return (
                <option key={ep.ep_key} value={ep.ep_key}>
                  {`${prefix}${ep.ep_key.toUpperCase()} — ${ep.video_filename} (${ep.format.toUpperCase()})`}
                </option>
              );
            })}
          </select>

          <button
            type="button"
            onClick={onRefreshEpisodes}
            aria-label="에피소드 목록 새로고침"
            title="로컬 폴더 다시 스캔"
            className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 hover:bg-line border border-line text-ink-2 hover:text-ink transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {selectedEpKey && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleOnlineSearch}
                disabled={subSearchState === 'loading'}
                title="온라인에서 자막을 자동으로 검색하여 다운로드합니다"
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  subSearchState === 'done'
                    ? 'bg-good/15 border-good/40 text-good'
                    : subSearchState === 'fail'
                      ? 'bg-danger/15 border-danger/40 text-danger'
                      : 'bg-surface-2 hover:bg-line border-line text-ink-2 hover:text-ink'
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
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isCompleted
                    ? 'bg-good/15 border-good/40 text-good'
                    : 'bg-surface-2 hover:bg-line border-line text-ink-2 hover:text-ink'
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
              className="flex-1 h-9 px-3.5 rounded-xl bg-surface-2 border border-line text-[13px] text-ink placeholder:text-ink-3 outline-none focus:border-accent transition-colors"
            />
            <button
              type="button"
              disabled={youtubeLoading || !youtubeUrl.trim()}
              onClick={() => youtubeUrl.trim() && onLoadYoutube(youtubeUrl.trim())}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-45 text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              {youtubeLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{youtubeLoading ? '불러오는 중' : '불러오기'}</span>
            </button>
          </div>

          <select
            aria-label="최근 유튜브 영상"
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              const url = `https://www.youtube.com/watch?v=${id}`;
              onChangeYoutubeUrl(url);
              onLoadYoutube(url);
            }}
            className="h-9 px-3 rounded-xl bg-surface-2 border border-line text-xs font-medium text-ink-2 max-w-[210px] outline-none focus:border-accent cursor-pointer"
          >
            <option value="">최근 영상 ({youtubeHistory.length})</option>
            {youtubeHistory.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title.length > 32 ? `${item.title.slice(0, 32)}...` : item.title}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
};
