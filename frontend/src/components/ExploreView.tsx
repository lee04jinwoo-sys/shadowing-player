import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Compass,
  Link2,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Tv,
  UserCheck,
} from 'lucide-react';
import {
  fetchChannelVideos,
  fetchUserSubscriptions,
  searchYouTube,
} from '../api';
import type {
  ToastTone,
  YouTubeChannel,
  YouTubeVideoCard,
} from '../types';

interface ExploreViewProps {
  pendingSearchQuery?: string | null;
  onConsumePendingQuery?: () => void;
  onSelectVideo: (videoUrl: string) => void;
  onOpenSettings: () => void;
  subscriptionsVersion: number;
  onToast: (msg: string, tone?: ToastTone) => void;
}

const CURATION_TAGS: { label: string; query: string }[] = [
  { label: 'TED-Ed 지식', query: 'TED-Ed english' },
  { label: '미드 모던패밀리', query: 'Modern Family english clip' },
  { label: '미드 프렌즈', query: 'Friends english clip' },
  { label: '코난 쇼', query: 'Conan OBrien english talk show' },
  { label: '일상 회화', query: 'Daily english conversation speaking' },
  { label: 'BBC 6분 영어', query: 'BBC 6 Minute English' },
  { label: '영화 명장면', query: 'Movie english clip shadowing' },
  { label: '명연설', query: 'Steve Jobs speech english' },
];

export const ExploreView: React.FC<ExploreViewProps> = ({
  pendingSearchQuery,
  onConsumePendingQuery,
  onSelectVideo,
  onOpenSettings,
  subscriptionsVersion,
  onToast,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [activeTag, setActiveTag] = useState<string>(CURATION_TAGS[0].query);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [resultLabel, setResultLabel] = useState<string>('TED-Ed 지식 추천');

  const [videos, setVideos] = useState<YouTubeVideoCard[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [subsAuthenticated, setSubsAuthenticated] = useState(false);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);

  const hasInitialLoadedRef = useRef(false);

  const runSearch = useCallback(
    async (rawQuery: string, label?: string) => {
      const q = rawQuery.trim();
      if (!q) return;

      if (q.includes('youtube.com') || q.includes('youtu.be')) {
        onSelectVideo(q);
        return;
      }

      setActiveChannelId(null);
      setLoadingVideos(true);
      setVideoError(null);
      setResultLabel(label || `'${q}' 검색 결과`);

      try {
        const list = await searchYouTube(q, 16);
        setVideos(list);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'YouTube 검색에 실패했습니다.';
        setVideoError(msg);
        onToast(msg, 'error');
      } finally {
        setLoadingVideos(false);
      }
    },
    [onSelectVideo, onToast],
  );

  const loadSubscriptions = useCallback(async () => {
    setLoadingSubs(true);
    try {
      const res = await fetchUserSubscriptions();
      setSubsAuthenticated(Boolean(res.authenticated));
      setChannels(res.channels || []);
    } catch {
      setSubsAuthenticated(false);
      setChannels([]);
    } finally {
      setLoadingSubs(false);
    }
  }, []);

  useEffect(() => {
    void loadSubscriptions();
  }, [subscriptionsVersion, loadSubscriptions]);

  useEffect(() => {
    if (pendingSearchQuery && pendingSearchQuery.trim()) {
      const query = pendingSearchQuery.trim();
      setSearchInput(query);
      setActiveTag('');
      hasInitialLoadedRef.current = true;
      onConsumePendingQuery?.();
      void runSearch(query, `'${query}' 추천 검색`);
      return;
    }

    if (!hasInitialLoadedRef.current) {
      hasInitialLoadedRef.current = true;
      void runSearch(CURATION_TAGS[0].query, `${CURATION_TAGS[0].label} 추천`);
    }
  }, [pendingSearchQuery, onConsumePendingQuery, runSearch]);

  const handleSelectChannel = async (channel: YouTubeChannel) => {
    setActiveTag('');
    setActiveChannelId(channel.channel_id);
    setLoadingVideos(true);
    setVideoError(null);
    setResultLabel(`${channel.title} 채널 최신 영상`);

    try {
      const list = await fetchChannelVideos(channel.channel_id, channel.title, 16);
      setVideos(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '채널 영상 목록 조회 실패';
      setVideoError(msg);
      onToast(msg, 'error');
    } finally {
      setLoadingVideos(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;
    setActiveTag('');
    void runSearch(q);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Search Header */}
        <section className="rounded-2xl bg-surface border border-line p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Compass className="w-4 h-4 text-accent" />
                <span>YouTube 쉐도잉 탐색</span>
              </div>
              <p className="text-xs text-ink-3 mt-0.5">
                영어 자막이 포함된 영상을 검색하거나 URL을 붙여넣어 바로 학습을 시작하세요.
              </p>
            </div>
            <span className="num text-[11px] font-mono text-ink-3">
              {loadingVideos ? '불러오는 중...' : `${videos.length}개 영상`}
            </span>
          </div>

          <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="유튜브 영상 검색 (예: TED-Ed, Modern Family) 또는 URL 붙여넣기..."
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-canvas border border-line text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loadingVideos}
              className="h-10 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors cursor-pointer shrink-0 disabled:opacity-60"
            >
              검색
            </button>
          </form>

          {/* Curation Tag Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {CURATION_TAGS.map((tag) => {
              const selected = activeTag === tag.query && !activeChannelId;
              return (
                <button
                  key={tag.query}
                  type="button"
                  onClick={() => {
                    setActiveTag(tag.query);
                    setSearchInput(tag.query);
                    void runSearch(tag.query, `${tag.label} 추천`);
                  }}
                  className={`h-8 px-3 rounded-full text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer shrink-0 ${
                    selected
                      ? 'bg-accent/15 text-accent border-accent/40'
                      : 'bg-canvas text-ink-2 border-line hover:text-ink hover:border-line-strong'
                  }`}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Subscriptions Strip */}
        <section className="rounded-2xl bg-surface border border-line px-4 py-3">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
              <Tv className="w-3.5 h-3.5 text-accent" />
              <span>내 YouTube 구독 채널</span>
              {subsAuthenticated && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-good/12 text-good text-[10px] font-medium">
                  <UserCheck className="w-3 h-3" />
                  연동됨 ({channels.length})
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void loadSubscriptions()}
              disabled={loadingSubs}
              className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loadingSubs ? 'animate-spin' : ''}`} />
              <span>새로고침</span>
            </button>
          </div>

          {!subsAuthenticated ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas border border-line px-3.5 py-2.5">
              <span className="text-xs text-ink-2">
                Google 계정을 연동하면 구독 중인 영어 채널 목록과 최신 영상을 바로 탐색할 수 있습니다.
              </span>
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-2 hover:bg-line text-ink text-xs font-medium border border-line transition-colors cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5 text-accent" />
                <span>Google 계정 연동하기</span>
              </button>
            </div>
          ) : channels.length === 0 ? (
            <p className="text-xs text-ink-3 py-1">표시할 구독 채널이 없습니다.</p>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
              {channels.map((ch) => {
                const selected = activeChannelId === ch.channel_id;
                return (
                  <button
                    key={ch.channel_id}
                    type="button"
                    onClick={() => void handleSelectChannel(ch)}
                    className={`inline-flex items-center gap-2 h-8 pl-1.5 pr-3 rounded-full border text-xs font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                      selected
                        ? 'bg-accent/15 text-accent border-accent/40'
                        : 'bg-canvas text-ink-2 border-line hover:text-ink hover:border-line-strong'
                    }`}
                  >
                    {ch.thumbnail ? (
                      <img
                        src={ch.thumbnail}
                        alt=""
                        className="w-5 h-5 rounded-full object-cover bg-surface-2"
                      />
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-surface-2 inline-flex items-center justify-center text-[10px] text-ink-3">
                        {ch.title.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="max-w-[160px] truncate">{ch.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Results Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-3">
              {resultLabel}
            </h2>
          </div>

          {loadingVideos ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-ink-3">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
              <span className="text-xs">영상을 검색하고 있습니다...</span>
            </div>
          ) : videoError ? (
            <div className="rounded-2xl bg-danger/10 border border-danger/25 px-4 py-6 text-center text-xs text-danger">
              {videoError}
            </div>
          ) : videos.length === 0 ? (
            <div className="rounded-2xl bg-surface border border-line px-4 py-16 text-center text-xs text-ink-3">
              검색 결과가 없습니다. 다른 키워드나 큐레이션 태그를 선택해 보세요.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">
              {videos.map((card) => (
                <button
                  key={card.video_id}
                  type="button"
                  onClick={() =>
                    onSelectVideo(`https://www.youtube.com/watch?v=${card.video_id}`)
                  }
                  className="group flex flex-col text-left rounded-2xl bg-surface border border-line hover:border-accent/50 overflow-hidden transition-all hover:-translate-y-0.5 cursor-pointer"
                >
                  <div className="relative aspect-video w-full bg-surface-2 overflow-hidden">
                    <img
                      src={card.thumbnail}
                      alt={card.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-white text-xs font-medium shadow-lg">
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>학습 시작</span>
                      </span>
                    </div>
                    {card.duration_str && (
                      <span className="num absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/80 text-white font-mono text-[10.5px] font-medium">
                        {card.duration_str}
                      </span>
                    )}
                  </div>
                  <div className="p-3.5 space-y-1 flex-1 flex flex-col justify-between">
                    <h3 className="text-[13px] font-medium text-ink leading-snug line-clamp-2 group-hover:text-accent transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-[11px] text-ink-3 truncate pt-1">
                      {card.channel}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
