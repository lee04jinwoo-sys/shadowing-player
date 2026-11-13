import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  checkAnkiConnection,
  fetchEpisodeList,
  fetchSubtitles,
  fetchSubtitlesOnline,
  fetchYouTubeInfo,
  fetchYouTubeSubtitles,
} from './api';
import { DictPopover } from './components/DictPopover';
import { DictationPanel } from './components/DictationPanel';
import { ExploreView } from './components/ExploreView';
import { ExtractionPanel } from './components/ExtractionPanel';
import { Header } from './components/Header';
import { ListeningPanel } from './components/ListeningPanel';
import { MediaContextBar } from './components/MediaContextBar';
import { SettingsModal } from './components/SettingsModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Sidebar } from './components/Sidebar';
import { ToastContainer } from './components/ToastContainer';
import { VideoStage } from './components/VideoStage';
import { useEpisodeCollections } from './hooks/useEpisodeCollections';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useMediaPlayer } from './hooks/useMediaPlayer';
import { useToast } from './hooks/useToast';
import type {
  AnkiStatus,
  DictPopoverRequest,
  Episode,
  SidebarMode,
  SourceMode,
  SubtitleItem,
  ThemeMode,
  YouTubeHistoryItem,
} from './types';
import {
  addYouTubeToHistory,
  getLastWatched,
  getSavedSidebarWidth,
  getSavedTheme,
  getYouTubeHistory,
  saveLastWatched,
  saveSidebarWidth,
  saveTheme,
} from './utils/storage';

export default function App() {
  const { toasts, showToast } = useToast();
  const collections = useEpisodeCollections();

  // Theme & shell layout
  const [theme, setTheme] = useState<ThemeMode>(() => getSavedTheme());
  const [sourceMode, setSourceMode] = useState<SourceMode>('local');
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('listening');
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => getSavedSidebarWidth(400));
  const [resizingSidebar, setResizingSidebar] = useState(false);

  // Modals & Popovers
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dictRequest, setDictRequest] = useState<DictPopoverRequest | null>(null);

  // Anki health
  const [ankiStatus, setAnkiStatus] = useState<AnkiStatus>({
    connected: false,
    reason: 'player_down',
  });
  const [ankiChecking, setAnkiChecking] = useState(false);

  // Media catalog & active episode
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedEpKey, setSelectedEpKey] = useState<string>('');
  const [activeMediaKey, setActiveMediaKey] = useState<string>('');
  const [activeSourceType, setActiveSourceType] = useState<'local' | 'youtube'>('local');
  const [aviUnsupported, setAviUnsupported] = useState(false);

  // YouTube & Explore
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeTitle, setYoutubeTitle] = useState('');
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeHistory, setYoutubeHistory] = useState<YouTubeHistoryItem[]>(() =>
    getYouTubeHistory(),
  );
  const [pendingExploreQuery, setPendingExploreQuery] = useState<string | null>(null);
  const [subscriptionsVersion, setSubscriptionsVersion] = useState(0);

  // Subtitles & overlay UI
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [subLoadingMsg, setSubLoadingMsg] = useState<string | null>(null);
  const [subErrorMsg, setSubErrorMsg] = useState<string | null>(null);
  const [subErrorHintQuery, setSubErrorHintQuery] = useState<string | null>(null);
  const [showEnOverlay, setShowEnOverlay] = useState(false);
  const [showKrOverlay, setShowKrOverlay] = useState(false);
  const [blurRevealed, setBlurRevealed] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [theaterControlsVisible, setTheaterControlsVisible] = useState(true);

  // Dictation input state
  const [dictationInput, setDictationInput] = useState('');
  const [dictationChecked, setDictationChecked] = useState(false);

  const controlsHoverRef = useRef<HTMLDivElement | null>(null);
  const theaterHideTimerRef = useRef<number | null>(null);
  const didInitialLoadRef = useRef(false);
  const mediaLoadSeqRef = useRef(0);
  const latestSidebarWidthRef = useRef(sidebarWidth);
  latestSidebarWidthRef.current = sidebarWidth;

  const clearDictationLine = useCallback(() => {
    setDictationInput('');
    setDictationChecked(false);
  }, []);

  const player = useMediaPlayer({
    activeSourceType,
    activeMediaKey,
    sidebarMode,
    subtitles,
    onSubtitleAdvanceInDictation: clearDictationLine,
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  const refreshAnki = useCallback(async () => {
    setAnkiChecking(true);
    try {
      const res = await checkAnkiConnection();
      setAnkiStatus(res);
    } finally {
      setAnkiChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshAnki();
    const timer = window.setInterval(() => {
      void refreshAnki();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refreshAnki]);

  const selectLocalEpisode = useCallback(
    async (epKey: string, epListOverride?: Episode[], resumeMs?: number) => {
      if (!epKey) return;
      const seq = ++mediaLoadSeqRef.current;
      const list = epListOverride ?? episodes;
      const ep = list.find((item) => item.ep_key === epKey);

      player.destroyYoutubePlayer();
      player.resetPlaybackState();

      setActiveSourceType('local');
      setSelectedEpKey(epKey);
      setActiveMediaKey(epKey);
      setSubtitles([]);
      clearDictationLine();
      setSubErrorMsg(null);
      setSubErrorHintQuery(null);
      setSubLoadingMsg('자막을 불러오는 중...');
      collections.loadEpisodeCollections(epKey);

      const isAvi = ep?.format?.toLowerCase() === 'avi' || epKey.toLowerCase().endsWith('.avi');
      setAviUnsupported(Boolean(isAvi));
      player.loadHtml5Video(epKey, Boolean(isAvi), resumeMs);

      try {
        const subs = await fetchSubtitles(epKey);
        if (seq !== mediaLoadSeqRef.current) return;
        setSubtitles(subs);
        if (subs.length === 0) {
          setSubErrorMsg(
            '자막 파일이 없거나 자막이 비어 있습니다. 상단 "온라인 자막 검색"을 눌러 검색할 수 있습니다.',
          );
        } else {
          player.syncResumeIndex(subs, resumeMs);
        }
      } catch {
        if (seq !== mediaLoadSeqRef.current) return;
        setSubErrorMsg('자막을 불러오지 못했습니다.');
      } finally {
        if (seq === mediaLoadSeqRef.current) {
          setSubLoadingMsg(null);
        }
      }
    },
    [episodes, player, collections, clearDictationLine],
  );

  const loadYoutubeVideo = useCallback(
    async (rawUrl: string, resumeMs?: number) => {
      const trimmed = rawUrl.trim();
      if (!trimmed) {
        showToast('YouTube 링크 또는 영상 ID를 입력하세요.', 'warn');
        return;
      }

      const seq = ++mediaLoadSeqRef.current;
      setYoutubeLoading(true);
      setSubErrorMsg(null);
      setSubErrorHintQuery(null);
      setSubLoadingMsg('YouTube 영상 정보와 영어 자막을 가져오는 중...');

      try {
        const info = await fetchYouTubeInfo(trimmed);
        if (seq !== mediaLoadSeqRef.current) return;
        const videoId = info.video_id;
        const title = info.title || videoId;

        player.clearHtml5Video();
        player.resetPlaybackState();

        setSourceMode('youtube');
        setActiveSourceType('youtube');
        setAviUnsupported(false);
        setYoutubeUrl(`https://www.youtube.com/watch?v=${videoId}`);
        setYoutubeTitle(title);
        setActiveMediaKey(videoId);
        setSubtitles([]);
        clearDictationLine();
        collections.loadEpisodeCollections(videoId);

        setYoutubeHistory(addYouTubeToHistory(videoId, title));
        player.mountOrLoadYoutubePlayer(videoId, resumeMs);

        const subs = await fetchYouTubeSubtitles(videoId);
        if (seq !== mediaLoadSeqRef.current) return;
        setSubtitles(subs);
        if (subs.length === 0) {
          setSubErrorMsg(
            '이 영상에서 영어 자막(CC)을 찾지 못했습니다. 영어 자막이 포함된 다른 영상을 탐색해 보세요.',
          );
          setSubErrorHintQuery(title);
        } else {
          player.syncResumeIndex(subs, resumeMs);
        }

        saveLastWatched(videoId, resumeMs ?? 0, 'youtube');
      } catch (err: unknown) {
        if (seq !== mediaLoadSeqRef.current) return;
        const msg =
          err instanceof Error ? err.message : 'YouTube 영상을 불러오는 데 실패했습니다.';
        setSubErrorMsg(msg);
        setSubErrorHintQuery(trimmed.startsWith('http') ? 'TED-Ed english' : trimmed);
        showToast(msg, 'error');
      } finally {
        if (seq === mediaLoadSeqRef.current) {
          setYoutubeLoading(false);
          setSubLoadingMsg(null);
        }
      }
    },
    [player, collections, clearDictationLine, showToast],
  );

  const reloadEpisodes = useCallback(
    async (forceRefresh = false) => {
      try {
        const list = await fetchEpisodeList(forceRefresh);
        setEpisodes(list);
        return list;
      } catch {
        showToast('로컬 에피소드 목록을 불러오지 못했습니다.', 'error');
        return [];
      }
    },
    [showToast],
  );

  // Initial startup load
  useEffect(() => {
    if (didInitialLoadRef.current) return;
    didInitialLoadRef.current = true;

    const bootstrap = async () => {
      const list = await fetchEpisodeList(false).catch(() => []);
      setEpisodes(list);

      const last = getLastWatched();
      if (last && last.sourceMode === 'youtube' && last.epKey) {
        await loadYoutubeVideo(last.epKey, last.timeMs);
        return;
      }
      if (last && last.sourceMode === 'local' && list.some((e) => e.ep_key === last.epKey)) {
        await selectLocalEpisode(last.epKey, list, last.timeMs);
        return;
      }
      if (list.length > 0) {
        await selectLocalEpisode(list[0].ep_key, list);
      }
    };

    void bootstrap();
  }, [loadYoutubeVideo, selectLocalEpisode]);

  // Sidebar width resize drag
  useEffect(() => {
    if (!resizingSidebar) return;
    const handleMove = (e: MouseEvent) => {
      setSidebarWidth(Math.max(320, Math.min(560, window.innerWidth - e.clientX)));
    };
    const handleUp = () => {
      setResizingSidebar(false);
      saveSidebarWidth(latestSidebarWidthRef.current);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [resizingSidebar]);

  // Theater auto-hide floating bar
  const handleTheaterMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!theaterMode) return;
      setTheaterControlsVisible(true);
      if (theaterHideTimerRef.current) window.clearTimeout(theaterHideTimerRef.current);
      if (controlsHoverRef.current?.contains(e.target as Node)) return;
      theaterHideTimerRef.current = window.setTimeout(() => {
        setTheaterControlsVisible(false);
      }, 2500);
    },
    [theaterMode],
  );

  useEffect(() => {
    if (!theaterMode) {
      setTheaterControlsVisible(true);
      if (theaterHideTimerRef.current) window.clearTimeout(theaterHideTimerRef.current);
    }
  }, [theaterMode]);

  const handleAdvanceDictation = useCallback(() => {
    clearDictationLine();
    player.handleNextSubtitle();
  }, [clearDictationLine, player.handleNextSubtitle]);

  useKeyboardShortcuts({
    dictRequest,
    shortcutsOpen,
    settingsOpen,
    theaterMode,
    sourceMode,
    sidebarMode,
    dictationChecked,
    activeSubIndexRef: player.activeSubIndexRef,
    playbackSpeedRef: player.playbackSpeedRef,
    onCloseDict: () => setDictRequest(null),
    onToggleShortcuts: () => {
      setDictRequest(null);
      setShortcutsOpen((prev) => !prev);
    },
    onCloseShortcuts: () => setShortcutsOpen(false),
    onCloseSettings: () => setSettingsOpen(false),
    onToggleTheater: () => setTheaterMode((prev) => !prev),
    onExitTheater: () => setTheaterMode(false),
    onTogglePlay: player.togglePlay,
    onPrev: player.handlePrevSubtitle,
    onNext: player.handleNextSubtitle,
    onAdvanceDictation: handleAdvanceDictation,
    onToggleABLoop: () => player.setAbLoopActive((prev) => !prev),
    onToggleBlur: () => setBlurRevealed((prev) => !prev),
    onToggleStar: collections.toggleStarSubtitle,
    onChangeSpeed: player.applyPlaybackSpeed,
  });

  const handleChangeSidebarMode = useCallback(
    (mode: SidebarMode) => {
      setSidebarMode(mode);
      if (mode === 'listening') {
        setShowEnOverlay(false);
        setShowKrOverlay(false);
      } else if (mode === 'dictation') {
        player.setAbLoopActive(true);
      } else if (mode === 'anki') {
        setShowEnOverlay(true);
        setShowKrOverlay(true);
      }
    },
    [player],
  );

  const handleChangeSource = useCallback(
    (mode: SourceMode) => {
      setSourceMode(mode);
      if (mode === 'explore') {
        player.adapterPause();
      } else if (mode === 'local') {
        if (activeSourceType === 'youtube' || !activeMediaKey) {
          const targetKey = selectedEpKey || episodes[0]?.ep_key || '';
          if (targetKey) {
            void selectLocalEpisode(targetKey);
          } else {
            player.destroyYoutubePlayer();
            player.resetPlaybackState();
            setActiveSourceType('local');
            setActiveMediaKey('');
            setSubtitles([]);
            setSubErrorMsg(null);
            setSubErrorHintQuery(null);
            collections.loadEpisodeCollections('');
          }
        }
      } else if (mode === 'youtube') {
        if (activeSourceType !== 'youtube' || !activeMediaKey) {
          player.clearHtml5Video();
          if (youtubeHistory.length > 0) {
            void loadYoutubeVideo(youtubeHistory[0].id);
          } else {
            player.resetPlaybackState();
            setActiveSourceType('youtube');
            setActiveMediaKey('');
            setAviUnsupported(false);
            setSubtitles([]);
            setSubErrorMsg(null);
            setSubErrorHintQuery(null);
            collections.loadEpisodeCollections('');
          }
        }
      }
    },
    [
      activeSourceType,
      activeMediaKey,
      selectedEpKey,
      episodes,
      selectLocalEpisode,
      player,
      collections,
      youtubeHistory,
      loadYoutubeVideo,
    ],
  );

  const handleSearchOnlineSubtitles = useCallback(
    async (epKey: string): Promise<boolean> => {
      try {
        const res = await fetchSubtitlesOnline(epKey);
        if (res.success) {
          const subs = await fetchSubtitles(epKey);
          setSubtitles(subs);
          setSubErrorMsg(null);
          showToast('온라인 자막을 성공적으로 불러왔습니다.', 'success');
          return true;
        }
        showToast(res.error || '일치하는 자막을 찾지 못했습니다.', 'warn');
        return false;
      } catch {
        showToast('온라인 자막 검색 중 오류가 발생했습니다.', 'error');
        return false;
      }
    },
    [showToast],
  );

  const activeSubtitle =
    player.activeSubIndex >= 0 && player.activeSubIndex < subtitles.length
      ? subtitles[player.activeSubIndex]
      : null;

  const selectedEpisodeObj = useMemo(
    () => episodes.find((ep) => ep.ep_key === selectedEpKey) ?? null,
    [episodes, selectedEpKey],
  );

  const activeTitle =
    sourceMode === 'explore'
      ? 'YouTube 탐색'
      : activeSourceType === 'youtube'
        ? youtubeTitle || activeMediaKey || undefined
        : selectedEpisodeObj?.video_filename || selectedEpKey || undefined;

  const sourceNameForAnki =
    activeSourceType === 'youtube'
      ? youtubeTitle || activeMediaKey || 'YouTube'
      : selectedEpisodeObj?.video_filename || selectedEpKey || 'Local Video';

  const pendingVocabCount = useMemo(
    () => collections.savedVocab.filter((v) => !v.extracted).length,
    [collections.savedVocab],
  );
  const pendingCount = collections.starredSubtitles.size + pendingVocabCount;

  return (
    <div className="h-screen w-full flex flex-col bg-canvas text-ink overflow-hidden select-none sm:select-auto">
      {!theaterMode && (
        <Header
          sourceMode={sourceMode}
          onChangeSource={handleChangeSource}
          activeTitle={activeTitle}
          ankiStatus={ankiStatus}
          ankiChecking={ankiChecking}
          onRecheckAnki={() => void refreshAnki()}
          onOpenShortcuts={() => {
            setDictRequest(null);
            setShortcutsOpen(true);
          }}
          onOpenSettings={() => {
            setDictRequest(null);
            setSettingsOpen(true);
          }}
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        />
      )}

      <main
        data-testid="workspace-main"
        data-theater={theaterMode ? 'true' : 'false'}
        onMouseMove={handleTheaterMouseMove}
        className={
          theaterMode
            ? 'fixed inset-0 z-40 bg-black flex flex-col overflow-hidden'
            : 'flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden'
        }
      >
        {!theaterMode && sourceMode === 'explore' && (
          <ExploreView
            pendingSearchQuery={pendingExploreQuery}
            onConsumePendingQuery={() => setPendingExploreQuery(null)}
            onSelectVideo={(url) => void loadYoutubeVideo(url)}
            onOpenSettings={() => setSettingsOpen(true)}
            subscriptionsVersion={subscriptionsVersion}
            onToast={showToast}
          />
        )}

        <div
          className={!theaterMode && sourceMode === 'explore' ? 'hidden' : 'contents'}
          aria-hidden={!theaterMode && sourceMode === 'explore' ? true : undefined}
        >
          {/* Left Stage Column: Single Unified Hairline Studio Frame */}
          <div
            data-testid="stage-column"
            className={
              theaterMode
                ? 'flex-1 min-h-0 flex flex-col'
                : 'shrink-0 lg:shrink lg:flex-1 lg:min-h-0 flex flex-col p-2.5 sm:p-3.5 lg:p-4'
            }
          >
            <div
              className={
                theaterMode
                  ? 'flex-1 min-h-0 flex flex-col'
                  : 'card-surface lg:flex-1 lg:min-h-0 flex flex-col rounded-2xl border border-line bg-surface divide-y divide-line'
              }
            >
              {!theaterMode && (sourceMode === 'local' || sourceMode === 'youtube') && (
                <MediaContextBar
                  sourceMode={sourceMode}
                  episodes={episodes}
                  selectedEpKey={selectedEpKey}
                  activeMediaKey={activeMediaKey}
                  completedEpisodes={collections.completedEpisodes}
                  extractedByEpisode={collections.extractedByEpisode}
                  onSelectEpisode={(key) => void selectLocalEpisode(key)}
                  onRefreshEpisodes={() => {
                    void reloadEpisodes(true).then(() =>
                      showToast('로컬 미디어 목록을 새로고침했습니다.', 'info'),
                    );
                  }}
                  onSearchOnlineSubtitles={handleSearchOnlineSubtitles}
                  onToggleEpisodeComplete={(key) => {
                    const done = collections.handleToggleEpisodeComplete(key);
                    showToast(
                      done ? '에피소드를 학습 완료로 표시했습니다.' : '학습 완료 표시를 해제했습니다.',
                      'info',
                    );
                  }}
                  youtubeUrl={youtubeUrl}
                  onChangeYoutubeUrl={setYoutubeUrl}
                  onLoadYoutube={(url) => void loadYoutubeVideo(url)}
                  youtubeLoading={youtubeLoading}
                  youtubeHistory={youtubeHistory}
                />
              )}

                <VideoStage
                  adapter={activeSourceType === 'youtube' ? 'youtube' : 'html5'}
                  hasMedia={Boolean(activeMediaKey)}
                  aviUnsupported={aviUnsupported}
                  videoRef={player.videoRef}
                  ytHostRef={player.ytHostRef}
                  subtitles={subtitles}
                  starredSubtitles={collections.starredSubtitles}
                  extractedSubtitles={collections.extractedSubtitles}
                  mediaTitle={activeTitle}
                  activeSubtitle={activeSubtitle}
                  activeSubIndex={player.activeSubIndex}
                  totalSubtitles={subtitles.length}
                  progressIndex={player.progressIndex}
                  currentTimeMs={player.currentTimeMs}
                  isPlaying={player.isPlaying}
                  abLoopActive={player.abLoopActive}
                  playbackSpeed={player.playbackSpeed}
                  showEnOverlay={showEnOverlay}
                  showKrOverlay={showKrOverlay}
                  dictationModeActive={sidebarMode === 'dictation'}
                  theaterMode={theaterMode}
                  theaterControlsVisible={theaterControlsVisible}
                  savedVocab={collections.savedVocab}
                  onTogglePlay={player.togglePlay}
                  onPrev={player.handlePrevSubtitle}
                  onNext={player.handleNextSubtitle}
                  onToggleABLoop={() => player.setAbLoopActive((prev) => !prev)}
                  onChangeSpeed={player.applyPlaybackSpeed}
                  onToggleEnOverlay={() => setShowEnOverlay((prev) => !prev)}
                  onToggleKrOverlay={() => setShowKrOverlay((prev) => !prev)}
                  onToggleTheater={() => setTheaterMode((prev) => !prev)}
                  onSeekToSubtitle={player.seekToSubtitle}
                  onLookupWord={(req) => setDictRequest(req)}
                  controlsHoverRef={controlsHoverRef}
                />
              </div>
            </div>

            {!theaterMode && (
              <Sidebar
                width={sidebarWidth}
                onStartResize={(e) => {
                  e.preventDefault();
                  setResizingSidebar(true);
                }}
                activeMode={sidebarMode}
                onChangeMode={handleChangeSidebarMode}
                pendingCount={pendingCount}
              >
                {sidebarMode === 'listening' && (
                  <ListeningPanel
                    subtitles={subtitles}
                    activeSubIndex={player.activeSubIndex}
                    playbackSpeed={player.playbackSpeed}
                    blurRevealed={blurRevealed}
                    starredSubtitles={collections.starredSubtitles}
                    extractedSubtitles={collections.extractedSubtitles}
                    savedVocab={collections.savedVocab}
                    loadingMessage={subLoadingMsg}
                    errorMessage={subErrorMsg}
                    errorHintQuery={subErrorHintQuery}
                    onExploreHint={(query) => {
                      setPendingExploreQuery(query);
                      setSourceMode('explore');
                    }}
                    onSwitchToLocal={() => handleChangeSource('local')}
                    onToggleBlur={() => setBlurRevealed((prev) => !prev)}
                    onToggleStar={collections.toggleStarSubtitle}
                    onSeekToSubtitle={player.seekToSubtitle}
                    onLookupWord={(req) => setDictRequest(req)}
                  />
                )}

                {sidebarMode === 'dictation' && (
                  <DictationPanel
                    activeSubIndex={player.activeSubIndex}
                    activeSubtitle={activeSubtitle}
                    dictationInput={dictationInput}
                    dictationChecked={dictationChecked}
                    isStarred={
                      player.activeSubIndex >= 0 &&
                      collections.starredSubtitles.has(player.activeSubIndex)
                    }
                    onChangeInput={setDictationInput}
                    onCheckedChange={setDictationChecked}
                    onNextSubtitle={player.handleNextSubtitle}
                    onReplaySubtitle={() => {
                      if (player.activeSubIndexRef.current >= 0) {
                        player.seekToSubtitle(player.activeSubIndexRef.current);
                      }
                    }}
                    onToggleStar={() => collections.toggleStarSubtitle(player.activeSubIndexRef.current)}
                    onPauseVideo={player.adapterPause}
                    onToast={showToast}
                  />
                )}

                {sidebarMode === 'anki' && (
                  <ExtractionPanel
                    subtitles={subtitles}
                    sourceName={sourceNameForAnki}
                    ankiConnected={ankiStatus.connected}
                    starredSubtitles={collections.starredSubtitles}
                    editedText={collections.editedText}
                    editedTranslation={collections.editedTranslation}
                    savedVocab={collections.savedVocab}
                    onEditSentence={collections.handleEditSentence}
                    onEditTranslation={collections.handleEditTranslation}
                    onRemoveStarredSentence={collections.toggleStarSubtitle}
                    onMarkSentenceExtracted={collections.handleMarkSentenceExtracted}
                    onUpdateVocab={collections.handleUpdateVocab}
                    onRemoveVocab={collections.handleRemoveVocab}
                    onToast={showToast}
                  />
                )}
              </Sidebar>
            )}
        </div>
      </main>

      <DictPopover
        request={dictRequest}
        ankiConnected={ankiStatus.connected}
        savedVocab={collections.savedVocab}
        onClose={() => setDictRequest(null)}
        onLookupPhrase={(req) => setDictRequest(req)}
        onSaveVocabLocal={collections.handleSaveVocabLocal}
        onToast={showToast}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onEpisodesReload={() => void reloadEpisodes(true)}
        onSubscriptionsRefresh={() => setSubscriptionsVersion((v) => v + 1)}
        onToast={showToast}
      />

      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <ToastContainer toasts={toasts} />
    </div>
  );
}
