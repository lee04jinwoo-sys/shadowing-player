import React, { useMemo, useState } from 'react';
import { Check, Loader2, Play, RefreshCw, Search } from 'lucide-react';
import type { Episode, SourceMode, YouTubeHistoryItem } from '../types';

interface LibrarySidebarProps {
  sourceMode: Exclude<SourceMode, 'explore'>;
  episodes: Episode[];
  selectedEpKey: string;
  activeMediaKey?: string;
  completedEpisodes: Set<string>;
  extractedByEpisode: Record<string, number[]>;
  onSelectEpisode: (epKey: string) => void;
  onRefreshEpisodes: () => void;
  youtubeUrl: string;
  onChangeYoutubeUrl: (val: string) => void;
  onLoadYoutube: (url: string) => void;
  youtubeLoading: boolean;
  youtubeHistory: YouTubeHistoryItem[];
}

const cardClass = (active: boolean) =>
  `w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
    active
      ? 'bg-card border-line-strong card-surface'
      : 'border-transparent text-ink-2 hover:bg-surface-3/70'
  }`;

/** Left rail: the episode library (local) or URL form + history (YouTube), Daily English Essay style. */
export const LibrarySidebar: React.FC<LibrarySidebarProps> = ({
  sourceMode,
  episodes,
  selectedEpKey,
  activeMediaKey,
  completedEpisodes,
  extractedByEpisode,
  onSelectEpisode,
  onRefreshEpisodes,
  youtubeUrl,
  onChangeYoutubeUrl,
  onLoadYoutube,
  youtubeLoading,
  youtubeHistory,
}) => {
  const [query, setQuery] = useState('');

  const filteredEpisodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return episodes;
    return episodes.filter(
      (ep) => ep.ep_key.toLowerCase().includes(q) || ep.video_filename.toLowerCase().includes(q),
    );
  }, [episodes, query]);

  const loadHistoryItem = (id: string) => {
    const url = `https://www.youtube.com/watch?v=${id}`;
    onChangeYoutubeUrl(url);
    onLoadYoutube(url);
  };

  // lg 이상: 12px 가장자리 띠만 자리를 차지하고, 마우스가 닿거나 안에 포커스가 있으면
  // 목록이 영상 위로 슬라이드해 나온다(레이아웃은 밀리지 않음). 벗어나면 약간 지연 후 들어간다.
  return (
    <div className="group relative shrink-0 lg:w-3 lg:h-full lg:bg-rail lg:border-r lg:border-line z-30">
      <span
        aria-hidden="true"
        className="hidden lg:block absolute left-1/2 top-1/2 h-10 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong transition-opacity duration-200 group-hover:opacity-0 group-focus-within:opacity-0"
      />
      <aside
        aria-label="미디어 라이브러리"
        data-testid="library-sidebar"
        className="flex flex-col bg-rail border-b border-line max-h-60 min-h-0 select-none lg:absolute lg:inset-y-0 lg:left-0 lg:w-72 lg:max-h-none lg:border-b-0 lg:border-r lg:shadow-xl lg:-translate-x-full lg:opacity-0 lg:pointer-events-none lg:group-hover:translate-x-0 lg:group-hover:opacity-100 lg:group-hover:pointer-events-auto lg:group-focus-within:translate-x-0 lg:group-focus-within:opacity-100 lg:group-focus-within:pointer-events-auto lg:transition-[translate,opacity] lg:duration-200 lg:ease-out lg:delay-200 lg:group-hover:delay-0 lg:group-focus-within:delay-0 motion-reduce:transition-none"
      >
        {sourceMode === 'local' ? (
          <>
            <div className="p-3 border-b border-line space-y-2 shrink-0">
              <div className="flex items-center justify-between px-1 text-xs font-medium text-ink-3">
                <span className="num">에피소드 목록 ({episodes.length})</span>
                <button
                  type="button"
                  onClick={onRefreshEpisodes}
                  aria-label="에피소드 목록 새로고침"
                  title="로컬 폴더 다시 스캔"
                  className="grid h-6 w-6 place-items-center rounded-md text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-ink-3 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="에피소드 검색..."
                  className="w-full pl-8 pr-3 py-1.5 bg-card border border-line rounded-md text-xs text-ink placeholder:text-ink-3 outline-none focus:border-ink-3 transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
              {episodes.length === 0 ? (
                <div className="text-center py-10 px-4 text-xs text-ink-3 leading-relaxed">
                  등록된 에피소드가 없습니다.
                  <br />
                  설정에서 로컬 영상 폴더를 지정해 주세요.
                </div>
              ) : filteredEpisodes.length === 0 ? (
                <div className="text-center py-10 px-4 text-xs text-ink-3">일치하는 에피소드가 없습니다.</div>
              ) : (
                filteredEpisodes.map((ep) => {
                  const selected = ep.ep_key === selectedEpKey;
                  const done = completedEpisodes.has(ep.ep_key);
                  const extCount = extractedByEpisode[ep.ep_key]?.length || 0;
                  return (
                    <button
                      key={ep.ep_key}
                      type="button"
                      aria-current={selected}
                      onClick={() => onSelectEpisode(ep.ep_key)}
                      className={cardClass(selected)}
                    >
                      <span className="flex items-center gap-1.5 text-[11px]">
                        <span className="num font-mono font-semibold text-ink">{ep.ep_key.toUpperCase()}</span>
                        <span className="px-1.5 rounded bg-surface-3 text-ink-2 text-[10px] uppercase">
                          {ep.format}
                        </span>
                        {done && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 rounded bg-good/15 text-good text-[10px] font-semibold">
                            <Check className="w-2.5 h-2.5" />
                            완료
                          </span>
                        )}
                        {extCount > 0 && (
                          <span className="num px-1.5 rounded bg-warn/15 text-warn text-[10px] font-semibold">
                            추출 {extCount}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs font-medium text-ink line-clamp-2">
                        {ep.video_filename}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <>
            <div className="p-3 border-b border-line space-y-2 shrink-0">
              <div className="px-1 text-xs font-medium text-ink-3">YouTube 링크</div>
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
                placeholder="URL 또는 Video ID를 붙여넣으세요..."
                className="w-full px-3 py-1.5 bg-card border border-line rounded-md text-xs text-ink placeholder:text-ink-3 outline-none focus:border-ink-3 transition-colors"
              />
              <button
                type="button"
                disabled={youtubeLoading || !youtubeUrl.trim()}
                onClick={() => youtubeUrl.trim() && onLoadYoutube(youtubeUrl.trim())}
                className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-45 text-accent-ink text-xs font-semibold transition-colors cursor-pointer"
              >
                {youtubeLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>{youtubeLoading ? '불러오는 중' : '불러오기'}</span>
              </button>
            </div>

            <div className="px-4 pt-3 pb-1 text-xs font-medium text-ink-3 num shrink-0">
              최근 영상 ({youtubeHistory.length})
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
              {youtubeHistory.length === 0 ? (
                <div className="text-center py-10 px-4 text-xs text-ink-3">
                  최근 시청한 YouTube 영상이 없습니다.
                </div>
              ) : (
                youtubeHistory.map((item) => {
                  const selected = Boolean(activeMediaKey && item.id === activeMediaKey);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={selected}
                      onClick={() => loadHistoryItem(item.id)}
                      className={cardClass(selected)}
                    >
                      <span className="block text-xs font-medium text-ink line-clamp-2">
                        {item.title}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
};
