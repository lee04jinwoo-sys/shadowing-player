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
import type {
  AnkiStatus,
  DictPopoverRequest,
  Episode,
  SavedVocabItem,
  SidebarMode,
  SourceMode,
  SubtitleItem,
  ThemeMode,
  ToastMessage,
  ToastTone,
  YouTubeHistoryItem,
  YTPlayerInstance,
} from './types';
import {
  addYouTubeToHistory,
  deleteSavedVocabItem,
  getLastWatched,
  getSavedSidebarWidth,
  getSavedTheme,
  getSavedVocab,
  getYouTubeHistory,
  loadPersistedStore,
  saveEpisodeLists,
  saveLastWatched,
  saveSidebarWidth,
  saveTheme,
  toggleEpisodeCompletion,
  updateSavedVocabItem,
  upsertSavedVocab,
} from './utils/storage';
import {
  findActiveSubtitleIndex,
  isShortSubtitle,
} from './utils/subtitles';

export default function App() {
  // Theme & shell layout
  const [theme, setTheme] = useState<ThemeMode>(() => getSavedTheme());
  const [sourceMode, setSourceMode] = useState<SourceMode>('local');
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('listening');
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => getSavedSidebarWidth(400));
  const [resizingSidebar, setResizingSidebar] = useState(false);

  // Modals & Popovers & Toasts
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dictRequest, setDictRequest] = useState<DictPopoverRequest | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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

  // Subtitles & learning state
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [subLoadingMsg, setSubLoadingMsg] = useState<string | null>(null);
  const [subErrorMsg, setSubErrorMsg] = useState<string | null>(null);
  const [subErrorHintQuery, setSubErrorHintQuery] = useState<string | null>(null);
  const [activeSubIndex, setActiveSubIndex] = useState<number>(-1);
  const [progressIndex, setProgressIndex] = useState<number>(0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [abLoopActive, setAbLoopActive] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [showEnOverlay, setShowEnOverlay] = useState(false);
  const [showKrOverlay, setShowKrOverlay] = useState(false);
  const [blurRevealed, setBlurRevealed] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [theaterControlsVisible, setTheaterControlsVisible] = useState(true);

  // Dictation state
  const [dictationInput, setDictationInput] = useState('');
  const [dictationChecked, setDictationChecked] = useState(false);

  // Persisted collections
  const [completedEpisodes, setCompletedEpisodes] = useState<Set<string>>(
    () => new Set(loadPersistedStore().completedEpisodes),
  );
  const [extractedByEpisode, setExtractedByEpisode] = useState<Record<string, number[]>>(
    () => loadPersistedStore().extracted,
  );
  const [starredSubtitles, setStarredSubtitles] = useState<Set<number>>(new Set());
  const [editedText, setEditedText] = useState<Record<number, string>>({});
  const [editedTranslation, setEditedTranslation] = useState<Record<number, string>>({});
  const [extractedSubtitles, setExtractedSubtitles] = useState<Set<number>>(new Set());
  const [savedVocab, setSavedVocab] = useState<SavedVocabItem[]>(() => getSavedVocab());

  // Refs for DOM & real-time playback callbacks (avoid stale closures in listeners/RAF)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const controlsHoverRef = useRef<HTMLDivElement | null>(null);
  const theaterHideTimerRef = useRef<number | null>(null);
  const pendingYtSeekRef = useRef<number | null>(null);
  const pendingYtVideoIdRef = useRef<string | null>(null);
  const seekLockUntilRef = useRef<number>(0);
  const hasPausedForShadowingRef = useRef<boolean>(false);
  const didInitialLoadRef = useRef<boolean>(false);

  // Mutable state mirrors for real-time timeupdate checks
  const adapterRef = useRef<'html5' | 'youtube'>('html5');
  const subtitlesRef = useRef<SubtitleItem[]>([]);
  const activeSubIndexRef = useRef<number>(-1);
  const abLoopActiveRef = useRef<boolean>(false);
  const sidebarModeRef = useRef<SidebarMode>('listening');
  const activeMediaKeyRef = useRef<string>('');
  const activeSourceTypeRef = useRef<'local' | 'youtube'>('local');
  const playbackSpeedRef = useRef<number>(1.0);

  adapterRef.current = activeSourceType === 'youtube' ? 'youtube' : 'html5';
  subtitlesRef.current = subtitles;
  activeSubIndexRef.current = activeSubIndex;
  abLoopActiveRef.current = abLoopActive;
  sidebarModeRef.current = sidebarMode;
  activeMediaKeyRef.current = activeMediaKey;
  activeSourceTypeRef.current = activeSourceType;
  playbackSpeedRef.current = playbackSpeed;

  // Sync theme attribute to <html>
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  const showToast = useCallback((text: string, tone: ToastTone = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

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

  // Low-level adapter helpers
  const adapterPlay = useCallback(() => {
    if (adapterRef.current === 'youtube') {
      ytPlayerRef.current?.playVideo();
    } else {
      void videoRef.current?.play().catch(() => null);
    }
  }, []);

  const adapterPause = useCallback(() => {
    if (adapterRef.current === 'youtube') {
      ytPlayerRef.current?.pauseVideo();
    } else {
      videoRef.current?.pause();
    }
  }, []);

  const adapterSeekMs = useCallback((ms: number, lockMs = 600) => {
    const clampedMs = Math.max(0, ms);
    seekLockUntilRef.current = Date.now() + lockMs;
    if (adapterRef.current === 'youtube') {
      ytPlayerRef.current?.seekTo(clampedMs / 1000, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = clampedMs / 1000;
    }
    setCurrentTimeMs(clampedMs);
  }, []);

  const applyPlaybackSpeed = useCallback((speed: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, Number(speed.toFixed(1))));
    setPlaybackSpeed(clamped);
    if (adapterRef.current === 'youtube') {
      ytPlayerRef.current?.setPlaybackRate(clamped);
    } else if (videoRef.current) {
      videoRef.current.playbackRate = clamped;
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (adapterRef.current === 'youtube') {
      const st = ytPlayerRef.current?.getPlayerState();
      if (st === window.YT?.PlayerState.PLAYING) {
        ytPlayerRef.current?.pauseVideo();
      } else {
        ytPlayerRef.current?.playVideo();
      }
      return;
    }

    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      void vid.play().catch(() => null);
    } else {
      vid.pause();
    }
  }, []);

  // Load persisted lists for an episode/video key
  const loadEpisodeCollections = useCallback((epKey: string) => {
    const store = loadPersistedStore();
    setStarredSubtitles(new Set(store.starred[epKey] || []));
    setEditedText(store.edits[epKey] || {});
    setEditedTranslation(store.translations[epKey] || {});
    setExtractedSubtitles(new Set(store.extracted[epKey] || []));
    setExtractedByEpisode(store.extracted);
    setCompletedEpisodes(new Set(store.completedEpisodes));
  }, []);

  const persistLists = useCallback(
    (
      epKey: string,
      starred: Set<number>,
      edits: Record<number, string>,
      trans: Record<number, string>,
      extracted: Set<number>,
    ) => {
      if (!epKey) return;
      const starredArr = Array.from(starred);
      const extractedArr = Array.from(extracted);
      saveEpisodeLists(epKey, starredArr, edits, trans, extractedArr);
      setExtractedByEpisode((prev) => ({ ...prev, [epKey]: extractedArr }));
    },
    [],
  );

  // Subtitle seeking & navigation
  const seekToSubtitle = useCallback(
    (idx: number) => {
      const list = subtitlesRef.current;
      if (idx < 0 || idx >= list.length) return;

      hasPausedForShadowingRef.current = false;
      setActiveSubIndex(idx);
      activeSubIndexRef.current = idx;
      setProgressIndex(idx + 1);

      if (sidebarModeRef.current === 'dictation') {
        setDictationInput('');
        setDictationChecked(false);
      }

      if (activeMediaKeyRef.current) {
        saveLastWatched(
          activeMediaKeyRef.current,
          list[idx].start_ms,
          activeSourceTypeRef.current,
        );
      }

      adapterSeekMs(list[idx].start_ms + 30, 800);
      adapterPlay();
    },
    [adapterSeekMs, adapterPlay],
  );

  const handlePrevSubtitle = useCallback(() => {
    const list = subtitlesRef.current;
    if (list.length === 0) return;

    const idx = activeSubIndexRef.current;
    if (idx > 0) {
      const curSub = list[idx];
      if (curSub && currentTimeMs - curSub.start_ms > 1000) {
        seekToSubtitle(idx);
      } else {
        seekToSubtitle(idx - 1);
      }
      return;
    }
    seekToSubtitle(0);
  }, [currentTimeMs, seekToSubtitle]);

  const handleNextSubtitle = useCallback(() => {
    const list = subtitlesRef.current;
    if (list.length === 0) return;

    let nextIdx = activeSubIndexRef.current + 1;
    if (sidebarModeRef.current === 'dictation') {
      while (nextIdx < list.length && isShortSubtitle(list[nextIdx])) {
        nextIdx++;
      }
    }

    if (nextIdx >= 0 && nextIdx < list.length) {
      seekToSubtitle(nextIdx);
    }
  }, [seekToSubtitle]);

  // Destroy YT player when switching back to local video
  const destroyYoutubePlayer = useCallback(() => {
    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.destroy();
      } catch {
        // ignore destroy errors
      }
      ytPlayerRef.current = null;
    }
    if (ytHostRef.current) {
      ytHostRef.current.innerHTML = '';
    }
  }, []);

  const mountOrLoadYoutubePlayer = useCallback(
    (videoId: string, resumeMs?: number) => {
      pendingYtVideoIdRef.current = videoId;
      pendingYtSeekRef.current = resumeMs ?? null;

      if (ytPlayerRef.current) {
        ytPlayerRef.current.loadVideoById(videoId);
        return;
      }

      const initWhenReady = () => {
        if (!pendingYtVideoIdRef.current) return;
        const targetId = pendingYtVideoIdRef.current;
        if (!window.YT?.Player || !ytHostRef.current) {
          window.setTimeout(initWhenReady, 120);
          return;
        }

        ytHostRef.current.innerHTML = '<div id="yt-iframe-target" class="w-full h-full"></div>';
        ytPlayerRef.current = new window.YT.Player('yt-iframe-target', {
          videoId: targetId,
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 1,
            modestbranding: 1,
            rel: 0,
            iv_load_policy: 3,
            cc_load_policy: 0,
            playsinline: 1,
          },
          events: {
            onReady: (ev) => {
              ev.target.setPlaybackRate(playbackSpeedRef.current);
              if (pendingYtSeekRef.current && pendingYtSeekRef.current > 0) {
                const targetSeek = pendingYtSeekRef.current;
                pendingYtSeekRef.current = null;
                window.setTimeout(() => {
                  ev.target.seekTo(targetSeek / 1000, true);
                  setCurrentTimeMs(targetSeek);
                }, 400);
              }
            },
            onStateChange: (ev) => {
              const playing = ev.data === window.YT?.PlayerState.PLAYING;
              setIsPlaying(playing);
              if (playing && pendingYtSeekRef.current && pendingYtSeekRef.current > 0) {
                const targetSeek = pendingYtSeekRef.current;
                pendingYtSeekRef.current = null;
                ev.target.seekTo(targetSeek / 1000, true);
              }
            },
          },
        });
      };

      initWhenReady();
    },
    [],
  );

  // Select local episode
  const selectLocalEpisode = useCallback(
    async (epKey: string, epListOverride?: Episode[], resumeMs?: number) => {
      if (!epKey) return;
      const list = epListOverride ?? episodes;
      const ep = list.find((item) => item.ep_key === epKey);

      destroyYoutubePlayer();
      pendingYtVideoIdRef.current = null;

      setActiveSourceType('local');
      adapterRef.current = 'html5';
      setSelectedEpKey(epKey);
      setActiveMediaKey(epKey);
      setIsPlaying(false);
      setActiveSubIndex(-1);
      setProgressIndex(0);
      setCurrentTimeMs(0);
      setSubtitles([]);
      setDictationInput('');
      setDictationChecked(false);
      setSubErrorMsg(null);
      setSubErrorHintQuery(null);
      setSubLoadingMsg('자막을 불러오는 중...');
      loadEpisodeCollections(epKey);

      const isAvi = ep?.format?.toLowerCase() === 'avi' || epKey.toLowerCase().endsWith('.avi');
      setAviUnsupported(Boolean(isAvi));

      if (videoRef.current) {
        if (isAvi) {
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        } else {
          videoRef.current.src = `/api/video/${encodeURIComponent(epKey)}`;
          videoRef.current.playbackRate = playbackSpeedRef.current;
          if (resumeMs && resumeMs > 0) {
            window.setTimeout(() => {
              if (videoRef.current) {
                videoRef.current.currentTime = resumeMs / 1000;
                setCurrentTimeMs(resumeMs);
              }
            }, 800);
          }
        }
      }

      try {
        const subs = await fetchSubtitles(epKey);
        setSubtitles(subs);
        if (subs.length === 0) {
          setSubErrorMsg('자막 파일이 없거나 자막이 비어 있습니다. 상단 "온라인 자막"을 눌러 검색할 수 있습니다.');
        } else if (resumeMs && resumeMs > 0) {
          const idx = findActiveSubtitleIndex(subs, resumeMs);
          if (idx >= 0) {
            setActiveSubIndex(idx);
            setProgressIndex(idx + 1);
          }
        }
      } catch {
        setSubErrorMsg('자막을 불러오지 못했습니다.');
      } finally {
        setSubLoadingMsg(null);
      }
    },
    [episodes, destroyYoutubePlayer, loadEpisodeCollections],
  );

  // Load YouTube video & subtitles
  const loadYoutubeVideo = useCallback(
    async (rawUrl: string, resumeMs?: number) => {
      const trimmed = rawUrl.trim();
      if (!trimmed) {
        showToast('YouTube 링크 또는 영상 ID를 입력하세요.', 'warn');
        return;
      }

      setYoutubeLoading(true);
      setSubErrorMsg(null);
      setSubErrorHintQuery(null);
      setSubLoadingMsg('YouTube 영상 정보와 영어 자막을 가져오는 중...');

      try {
        const info = await fetchYouTubeInfo(trimmed);
        const videoId = info.video_id;
        const title = info.title || videoId;

        setSourceMode('youtube');
        setActiveSourceType('youtube');
        adapterRef.current = 'youtube';
        setAviUnsupported(false);
        setYoutubeUrl(`https://www.youtube.com/watch?v=${videoId}`);
        setYoutubeTitle(title);
        setActiveMediaKey(videoId);
        setActiveSubIndex(-1);
        setProgressIndex(0);
        setCurrentTimeMs(0);
        setSubtitles([]);
        setDictationInput('');
        setDictationChecked(false);
        loadEpisodeCollections(videoId);

        const nextHistory = addYouTubeToHistory(videoId, title);
        setYoutubeHistory(nextHistory);

        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
        }

        mountOrLoadYoutubePlayer(videoId, resumeMs);

        const subs = await fetchYouTubeSubtitles(videoId);
        setSubtitles(subs);
        if (subs.length === 0) {
          setSubErrorMsg(
            '이 영상에서 영어 자막(CC)을 찾지 못했습니다. 영어 자막이 포함된 다른 영상을 탐색해 보세요.',
          );
          setSubErrorHintQuery(title);
        } else if (resumeMs && resumeMs > 0) {
          const idx = findActiveSubtitleIndex(subs, resumeMs);
          if (idx >= 0) {
            setActiveSubIndex(idx);
            setProgressIndex(idx + 1);
          }
        }

        saveLastWatched(videoId, resumeMs ?? 0, 'youtube');
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'YouTube 영상을 불러오는 데 실패했습니다.';
        setSubErrorMsg(msg);
        setSubErrorHintQuery(trimmed.startsWith('http') ? 'TED-Ed english' : trimmed);
        showToast(msg, 'error');
      } finally {
        setYoutubeLoading(false);
        setSubLoadingMsg(null);
      }
    },
    [loadEpisodeCollections, mountOrLoadYoutubePlayer, showToast],
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

  // Real-time timeupdate handler shared by HTML5 <video> and YouTube polling
  const handleTimeTick = useCallback(
    (timeMs: number) => {
      setCurrentTimeMs(timeMs);

      const list = subtitlesRef.current;
      if (list.length === 0) return;

      const curIdx = activeSubIndexRef.current;
      const abActive = abLoopActiveRef.current;

      // 1. A-B Loop enforcement
      if (abActive && curIdx >= 0 && curIdx < list.length && Date.now() >= seekLockUntilRef.current) {
        const targetSub = list[curIdx];
        if (timeMs >= targetSub.end_ms - 100 || timeMs < targetSub.start_ms - 300) {
          adapterSeekMs(targetSub.start_ms, 400);
          return;
        }
      }

      // 2. Dictation auto-pause at end of current line (when A-B loop is off)
      if (
        !abActive &&
        sidebarModeRef.current === 'dictation' &&
        curIdx >= 0 &&
        curIdx < list.length &&
        Date.now() >= seekLockUntilRef.current
      ) {
        const targetSub = list[curIdx];
        if (timeMs >= targetSub.end_ms - 150 && !hasPausedForShadowingRef.current) {
          hasPausedForShadowingRef.current = true;
          adapterPause();
          return;
        }
      }

      // 3. Subtitle synchronization
      if (Date.now() < seekLockUntilRef.current) return;

      const foundIdx = findActiveSubtitleIndex(list, timeMs);
      if (foundIdx !== -1 && foundIdx !== curIdx) {
        if (abActive && curIdx >= 0) return;

        hasPausedForShadowingRef.current = false;
        activeSubIndexRef.current = foundIdx;
        setActiveSubIndex(foundIdx);
        setProgressIndex(foundIdx + 1);

        if (sidebarModeRef.current === 'dictation') {
          setDictationInput('');
          setDictationChecked(false);
        }

        if (activeMediaKeyRef.current) {
          saveLastWatched(activeMediaKeyRef.current, timeMs, activeSourceTypeRef.current);
        }
      }
    },
    [adapterSeekMs, adapterPause],
  );

  // HTML5 <video> events & 60fps RAF while playing
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      if (adapterRef.current !== 'html5') return;
      handleTimeTick(vid.currentTime * 1000);
    };

    vid.addEventListener('play', onPlay);
    vid.addEventListener('pause', onPause);
    vid.addEventListener('ended', onPause);
    vid.addEventListener('timeupdate', onTimeUpdate);
    vid.addEventListener('seeked', onTimeUpdate);

    let rafId = 0;
    const rafLoop = () => {
      if (adapterRef.current === 'html5' && !vid.paused) {
        handleTimeTick(vid.currentTime * 1000);
      }
      rafId = window.requestAnimationFrame(rafLoop);
    };
    rafId = window.requestAnimationFrame(rafLoop);

    return () => {
      window.cancelAnimationFrame(rafId);
      vid.removeEventListener('play', onPlay);
      vid.removeEventListener('pause', onPause);
      vid.removeEventListener('ended', onPause);
      vid.removeEventListener('timeupdate', onTimeUpdate);
      vid.removeEventListener('seeked', onTimeUpdate);
    };
  }, [handleTimeTick]);

  // YouTube polling loop (~33ms when playing)
  useEffect(() => {
    if (activeSourceType !== 'youtube') return;
    const id = window.setInterval(() => {
      const player = ytPlayerRef.current;
      if (!player) return;
      if (player.getPlayerState() === window.YT?.PlayerState.PLAYING) {
        handleTimeTick(player.getCurrentTime() * 1000);
      }
    }, 33);
    return () => window.clearInterval(id);
  }, [activeSourceType, handleTimeTick]);

  // Mode transitions (preserving exact legacy learning UX)
  const handleChangeSidebarMode = useCallback((mode: SidebarMode) => {
    setSidebarMode(mode);
    if (mode === 'listening') {
      setShowEnOverlay(false);
      setShowKrOverlay(false);
    } else if (mode === 'dictation') {
      setAbLoopActive(true);
    } else if (mode === 'anki') {
      setShowEnOverlay(true);
      setShowKrOverlay(true);
    }
  }, []);

  // Starred sentences & local edits
  const toggleStarSubtitle = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= subtitlesRef.current.length) return;
      setStarredSubtitles((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) {
          next.delete(idx);
        } else {
          next.add(idx);
        }
        persistLists(
          activeMediaKeyRef.current,
          next,
          editedText,
          editedTranslation,
          extractedSubtitles,
        );
        return next;
      });
    },
    [editedText, editedTranslation, extractedSubtitles, persistLists],
  );

  const handleEditSentence = useCallback(
    (idx: number, text: string) => {
      setEditedText((prev) => {
        const next = { ...prev, [idx]: text };
        persistLists(
          activeMediaKeyRef.current,
          starredSubtitles,
          next,
          editedTranslation,
          extractedSubtitles,
        );
        return next;
      });
    },
    [starredSubtitles, editedTranslation, extractedSubtitles, persistLists],
  );

  const handleEditTranslation = useCallback(
    (idx: number, trans: string) => {
      setEditedTranslation((prev) => {
        const next = { ...prev, [idx]: trans };
        persistLists(
          activeMediaKeyRef.current,
          starredSubtitles,
          editedText,
          next,
          extractedSubtitles,
        );
        return next;
      });
    },
    [starredSubtitles, editedText, extractedSubtitles, persistLists],
  );

  const handleMarkSentenceExtracted = useCallback(
    (idx: number) => {
      setExtractedSubtitles((prev) => {
        const next = new Set(prev);
        next.add(idx);
        persistLists(
          activeMediaKeyRef.current,
          starredSubtitles,
          editedText,
          editedTranslation,
          next,
        );
        return next;
      });
    },
    [starredSubtitles, editedText, editedTranslation, persistLists],
  );

  // Vocabulary CRUD wrappers
  const handleSaveVocabLocal = useCallback((item: Omit<SavedVocabItem, 'id'>) => {
    const saved = upsertSavedVocab(item);
    setSavedVocab(getSavedVocab());
    return saved;
  }, []);

  const handleUpdateVocab = useCallback((id: string, updates: Partial<SavedVocabItem>) => {
    const updated = updateSavedVocabItem(id, updates);
    setSavedVocab(updated);
  }, []);

  const handleRemoveVocab = useCallback((id: string) => {
    const updated = deleteSavedVocabItem(id);
    setSavedVocab(updated);
  }, []);

  // Sidebar resize drag
  useEffect(() => {
    if (!resizingSidebar) return;
    const handleMove = (e: MouseEvent) => {
      const nextWidth = Math.max(320, Math.min(560, window.innerWidth - e.clientX));
      setSidebarWidth(nextWidth);
    };
    const handleUp = () => {
      setResizingSidebar(false);
      saveSidebarWidth(sidebarWidth);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [resizingSidebar, sidebarWidth]);

  // Theater mode mouse hover reveal
  const handleTheaterMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!theaterMode) return;
      setTheaterControlsVisible(true);
      if (theaterHideTimerRef.current) {
        window.clearTimeout(theaterHideTimerRef.current);
      }
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

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName || '';
      const isEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        Boolean(target?.isContentEditable);

      if (e.code === 'Escape') {
        if (dictRequest) {
          setDictRequest(null);
          return;
        }
        if (shortcutsOpen) {
          setShortcutsOpen(false);
          return;
        }
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (theaterMode) {
          setTheaterMode(false);
        }
        return;
      }

      if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
        if (isEditable) return;
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      if (isEditable || settingsOpen || shortcutsOpen) return;

      switch (e.code) {
        case 'Space': {
          if (sourceMode === 'explore') return;
          e.preventDefault();
          togglePlay();
          break;
        }
        case 'ArrowLeft': {
          if (sourceMode === 'explore') return;
          e.preventDefault();
          handlePrevSubtitle();
          break;
        }
        case 'ArrowRight': {
          if (sourceMode === 'explore') return;
          e.preventDefault();
          handleNextSubtitle();
          break;
        }
        case 'KeyR': {
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          setAbLoopActive((prev) => !prev);
          break;
        }
        case 'KeyF': {
          if (e.metaKey || e.ctrlKey || e.altKey || sourceMode === 'explore') return;
          e.preventDefault();
          setTheaterMode((prev) => !prev);
          break;
        }
        case 'KeyV': {
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          setBlurRevealed((prev) => !prev);
          break;
        }
        case 'KeyA': {
          if (e.metaKey || e.ctrlKey || e.altKey || dictRequest) return;
          e.preventDefault();
          if (activeSubIndexRef.current >= 0) {
            toggleStarSubtitle(activeSubIndexRef.current);
          }
          break;
        }
        case 'Minus':
        case 'NumpadSubtract':
        case 'BracketLeft': {
          e.preventDefault();
          applyPlaybackSpeed(playbackSpeedRef.current - 0.1);
          break;
        }
        case 'Equal':
        case 'NumpadAdd':
        case 'BracketRight': {
          e.preventDefault();
          applyPlaybackSpeed(playbackSpeedRef.current + 0.1);
          break;
        }
        default: {
          if (e.key === 'ㄹ' && !e.metaKey && !e.ctrlKey && !e.altKey && sourceMode !== 'explore') {
            e.preventDefault();
            setTheaterMode((prev) => !prev);
          } else if (
            (e.key === 'ㅁ' || e.key === 'a' || e.key === 'A') &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.altKey &&
            !dictRequest
          ) {
            e.preventDefault();
            if (activeSubIndexRef.current >= 0) {
              toggleStarSubtitle(activeSubIndexRef.current);
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    dictRequest,
    shortcutsOpen,
    settingsOpen,
    theaterMode,
    sourceMode,
    togglePlay,
    handlePrevSubtitle,
    handleNextSubtitle,
    toggleStarSubtitle,
    applyPlaybackSpeed,
  ]);

  // Derived values
  const activeSubtitle =
    activeSubIndex >= 0 && activeSubIndex < subtitles.length
      ? subtitles[activeSubIndex]
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
    () => savedVocab.filter((v) => !v.extracted).length,
    [savedVocab],
  );
  const pendingCount = starredSubtitles.size + pendingVocabCount;

  const handleChangeSource = useCallback(
    (mode: SourceMode) => {
      setSourceMode(mode);
      if (mode === 'local') {
        if (activeSourceType === 'youtube' && selectedEpKey) {
          void selectLocalEpisode(selectedEpKey);
        } else {
          setActiveSourceType('local');
        }
      } else if (mode === 'youtube') {
        if (activeSourceType !== 'youtube' && youtubeHistory.length > 0) {
          void loadYoutubeVideo(youtubeHistory[0].id);
        } else {
          setActiveSourceType('youtube');
        }
      }
    },
    [activeSourceType, selectedEpKey, selectLocalEpisode, youtubeHistory, loadYoutubeVideo],
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

  const handleToggleEpisodeComplete = useCallback(
    (epKey: string) => {
      const done = toggleEpisodeCompletion(epKey);
      setCompletedEpisodes((prev) => {
        const next = new Set(prev);
        if (done) next.add(epKey);
        else next.delete(epKey);
        return next;
      });
      showToast(done ? '에피소드를 학습 완료로 표시했습니다.' : '학습 완료 표시를 해제했습니다.', 'info');
    },
    [showToast],
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-canvas text-ink overflow-hidden select-none sm:select-auto">
      {!theaterMode && (
        <Header
          sourceMode={sourceMode}
          onChangeSource={handleChangeSource}
          activeTitle={activeTitle}
          ankiStatus={ankiStatus}
          ankiChecking={ankiChecking}
          onRecheckAnki={() => void refreshAnki()}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        />
      )}

      {!theaterMode && sourceMode !== 'explore' && (
        <MediaContextBar
          sourceMode={sourceMode}
          episodes={episodes}
          selectedEpKey={selectedEpKey}
          completedEpisodes={completedEpisodes}
          extractedByEpisode={extractedByEpisode}
          onSelectEpisode={(key) => void selectLocalEpisode(key)}
          onRefreshEpisodes={() => {
            void reloadEpisodes(true).then(() =>
              showToast('로컬 미디어 목록을 새로고침했습니다.', 'info'),
            );
          }}
          onSearchOnlineSubtitles={handleSearchOnlineSubtitles}
          onToggleEpisodeComplete={handleToggleEpisodeComplete}
          youtubeUrl={youtubeUrl}
          onChangeYoutubeUrl={setYoutubeUrl}
          onLoadYoutube={(url) => void loadYoutubeVideo(url)}
          youtubeLoading={youtubeLoading}
          youtubeHistory={youtubeHistory}
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
        {!theaterMode && sourceMode === 'explore' ? (
          <ExploreView
            pendingSearchQuery={pendingExploreQuery}
            onConsumePendingQuery={() => setPendingExploreQuery(null)}
            onSelectVideo={(url) => void loadYoutubeVideo(url)}
            onOpenSettings={() => setSettingsOpen(true)}
            subscriptionsVersion={subscriptionsVersion}
            onToast={showToast}
          />
        ) : (
          <>
            <VideoStage
              adapter={activeSourceType === 'youtube' ? 'youtube' : 'html5'}
              hasMedia={Boolean(activeMediaKey)}
              aviUnsupported={aviUnsupported}
              videoRef={videoRef}
              ytHostRef={ytHostRef}
              activeSubtitle={activeSubtitle}
              activeSubIndex={activeSubIndex}
              totalSubtitles={subtitles.length}
              progressIndex={progressIndex}
              currentTimeMs={currentTimeMs}
              isPlaying={isPlaying}
              abLoopActive={abLoopActive}
              playbackSpeed={playbackSpeed}
              showEnOverlay={showEnOverlay}
              showKrOverlay={showKrOverlay}
              dictationModeActive={sidebarMode === 'dictation'}
              theaterMode={theaterMode}
              theaterControlsVisible={theaterControlsVisible}
              savedVocab={savedVocab}
              onTogglePlay={togglePlay}
              onPrev={handlePrevSubtitle}
              onNext={handleNextSubtitle}
              onToggleABLoop={() => setAbLoopActive((prev) => !prev)}
              onChangeSpeed={applyPlaybackSpeed}
              onToggleEnOverlay={() => setShowEnOverlay((prev) => !prev)}
              onToggleKrOverlay={() => setShowKrOverlay((prev) => !prev)}
              onToggleTheater={() => setTheaterMode((prev) => !prev)}
              onSeekToSubtitle={seekToSubtitle}
              onLookupWord={(req) => setDictRequest(req)}
              controlsHoverRef={controlsHoverRef}
            />

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
                    activeSubIndex={activeSubIndex}
                    playbackSpeed={playbackSpeed}
                    blurRevealed={blurRevealed}
                    starredSubtitles={starredSubtitles}
                    extractedSubtitles={extractedSubtitles}
                    savedVocab={savedVocab}
                    loadingMessage={subLoadingMsg}
                    errorMessage={subErrorMsg}
                    errorHintQuery={subErrorHintQuery}
                    onExploreHint={(query) => {
                      setPendingExploreQuery(query);
                      setSourceMode('explore');
                    }}
                    onSwitchToLocal={() => handleChangeSource('local')}
                    onToggleBlur={() => setBlurRevealed((prev) => !prev)}
                    onToggleStar={toggleStarSubtitle}
                    onSeekToSubtitle={seekToSubtitle}
                    onLookupWord={(req) => setDictRequest(req)}
                  />
                )}

                {sidebarMode === 'dictation' && (
                  <DictationPanel
                    activeSubIndex={activeSubIndex}
                    activeSubtitle={activeSubtitle}
                    dictationInput={dictationInput}
                    dictationChecked={dictationChecked}
                    isStarred={activeSubIndex >= 0 && starredSubtitles.has(activeSubIndex)}
                    onChangeInput={setDictationInput}
                    onCheckedChange={setDictationChecked}
                    onNextSubtitle={handleNextSubtitle}
                    onReplaySubtitle={() => {
                      if (activeSubIndexRef.current >= 0) {
                        seekToSubtitle(activeSubIndexRef.current);
                      }
                    }}
                    onToggleStar={() => toggleStarSubtitle(activeSubIndexRef.current)}
                    onPauseVideo={adapterPause}
                    onToast={showToast}
                  />
                )}

                {sidebarMode === 'anki' && (
                  <ExtractionPanel
                    subtitles={subtitles}
                    sourceName={sourceNameForAnki}
                    ankiConnected={ankiStatus.connected}
                    starredSubtitles={starredSubtitles}
                    editedText={editedText}
                    editedTranslation={editedTranslation}
                    savedVocab={savedVocab}
                    onEditSentence={handleEditSentence}
                    onEditTranslation={handleEditTranslation}
                    onRemoveStarredSentence={toggleStarSubtitle}
                    onMarkSentenceExtracted={handleMarkSentenceExtracted}
                    onUpdateVocab={handleUpdateVocab}
                    onRemoveVocab={handleRemoveVocab}
                    onToast={showToast}
                  />
                )}
              </Sidebar>
            )}
          </>
        )}
      </main>

      <DictPopover
        request={dictRequest}
        ankiConnected={ankiStatus.connected}
        savedVocab={savedVocab}
        onClose={() => setDictRequest(null)}
        onLookupPhrase={(req) => setDictRequest(req)}
        onSaveVocabLocal={handleSaveVocabLocal}
        onToast={showToast}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onEpisodesReload={() => void reloadEpisodes(true)}
        onSubscriptionsRefresh={() => setSubscriptionsVersion((v) => v + 1)}
        onToast={showToast}
      />

      <ShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <ToastContainer toasts={toasts} />
    </div>
  );
}
