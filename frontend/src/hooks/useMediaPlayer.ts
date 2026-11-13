import { useCallback, useEffect, useRef, useState } from 'react';
import type { SidebarMode, SubtitleItem, YTPlayerInstance } from '../types';
import { saveLastWatched } from '../utils/storage';
import { findActiveSubtitleIndex, isShortSubtitle } from '../utils/subtitles';

interface UseMediaPlayerOptions {
  activeSourceType: 'local' | 'youtube';
  activeMediaKey: string;
  sidebarMode: SidebarMode;
  subtitles: SubtitleItem[];
  onSubtitleAdvanceInDictation: () => void;
}

/**
 * Unifies HTML5 <video> and YouTube IFrame playback synchronization,
 * A-B subtitle looping, dictation auto-pause, playback speed, and seek navigation.
 */
export function useMediaPlayer({
  activeSourceType,
  activeMediaKey,
  sidebarMode,
  subtitles,
  onSubtitleAdvanceInDictation,
}: UseMediaPlayerOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [abLoopActive, setAbLoopActive] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [activeSubIndex, setActiveSubIndex] = useState<number>(-1);
  const [progressIndex, setProgressIndex] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const pendingYtSeekRef = useRef<number | null>(null);
  const pendingYtVideoIdRef = useRef<string | null>(null);
  const pendingHtml5SeekCleanupRef = useRef<(() => void) | null>(null);
  const ytInitTimerRef = useRef<number | null>(null);
  const seekLockUntilRef = useRef<number>(0);
  const hasPausedForShadowingRef = useRef<boolean>(false);

  // Real-time mirrors prevent stale closures inside 60fps RAF / 33ms YouTube poll loops.
  const adapterRef = useRef<'html5' | 'youtube'>('html5');
  const subtitlesRef = useRef<SubtitleItem[]>([]);
  const activeSubIndexRef = useRef<number>(-1);
  const abLoopActiveRef = useRef<boolean>(false);
  const sidebarModeRef = useRef<SidebarMode>('listening');
  const activeMediaKeyRef = useRef<string>('');
  const activeSourceTypeRef = useRef<'local' | 'youtube'>('local');
  const playbackSpeedRef = useRef<number>(1.0);
  const currentTimeMsRef = useRef<number>(0);

  adapterRef.current = activeSourceType === 'youtube' ? 'youtube' : 'html5';
  subtitlesRef.current = subtitles;
  activeSubIndexRef.current = activeSubIndex;
  abLoopActiveRef.current = abLoopActive;
  sidebarModeRef.current = sidebarMode;
  activeMediaKeyRef.current = activeMediaKey;
  activeSourceTypeRef.current = activeSourceType;
  playbackSpeedRef.current = playbackSpeed;

  const resetPlaybackState = useCallback(() => {
    setIsPlaying(false);
    setActiveSubIndex(-1);
    activeSubIndexRef.current = -1;
    setProgressIndex(0);
    setCurrentTimeMs(0);
    currentTimeMsRef.current = 0;
    hasPausedForShadowingRef.current = false;
  }, []);

  const syncResumeIndex = useCallback((subs: SubtitleItem[], resumeMs?: number) => {
    if (!resumeMs || resumeMs <= 0 || subs.length === 0) return;
    const idx = findActiveSubtitleIndex(subs, resumeMs);
    if (idx >= 0) {
      activeSubIndexRef.current = idx;
      setActiveSubIndex(idx);
      setProgressIndex(idx + 1);
    }
  }, []);

  const adapterPlay = useCallback(() => {
    if (adapterRef.current === 'youtube') {
      ytPlayerRef.current?.playVideo();
    } else {
      void videoRef.current?.play()?.catch(() => null);
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
    currentTimeMsRef.current = clampedMs;
    setCurrentTimeMs(clampedMs);
  }, []);

  const applyPlaybackSpeed = useCallback((speed: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, Number(speed.toFixed(1))));
    setPlaybackSpeed(clamped);
    playbackSpeedRef.current = clamped;
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

  const seekToSubtitle = useCallback(
    (idx: number) => {
      const list = subtitlesRef.current;
      if (idx < 0 || idx >= list.length) return;

      hasPausedForShadowingRef.current = false;
      activeSubIndexRef.current = idx;
      setActiveSubIndex(idx);
      setProgressIndex(idx + 1);

      if (sidebarModeRef.current === 'dictation') {
        onSubtitleAdvanceInDictation();
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
    [adapterSeekMs, adapterPlay, onSubtitleAdvanceInDictation],
  );

  const handlePrevSubtitle = useCallback(() => {
    const list = subtitlesRef.current;
    if (list.length === 0) return;

    const idx = activeSubIndexRef.current;
    if (idx > 0) {
      const curSub = list[idx];
      if (curSub && currentTimeMsRef.current - curSub.start_ms > 1000) {
        seekToSubtitle(idx);
      } else {
        seekToSubtitle(idx - 1);
      }
      return;
    }
    seekToSubtitle(0);
  }, [seekToSubtitle]);

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

  const destroyYoutubePlayer = useCallback(() => {
    pendingYtVideoIdRef.current = null;
    pendingYtSeekRef.current = null;
    if (ytInitTimerRef.current !== null) {
      window.clearTimeout(ytInitTimerRef.current);
      ytInitTimerRef.current = null;
    }
    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.destroy();
      } catch {
        // Ignore player teardown errors during rapid source switches
      }
      ytPlayerRef.current = null;
    }
    if (ytHostRef.current) {
      ytHostRef.current.innerHTML = '';
    }
  }, []);

  const clearHtml5Video = useCallback(() => {
    pendingHtml5SeekCleanupRef.current?.();
    pendingHtml5SeekCleanupRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
  }, []);

  const loadHtml5Video = useCallback((epKey: string, isAvi: boolean, resumeMs?: number) => {
    pendingHtml5SeekCleanupRef.current?.();
    pendingHtml5SeekCleanupRef.current = null;

    const vid = videoRef.current;
    if (!vid) return;
    if (isAvi) {
      vid.removeAttribute('src');
      vid.load();
      return;
    }
    vid.src = `/api/video/${encodeURIComponent(epKey)}`;
    vid.playbackRate = playbackSpeedRef.current;
    if (resumeMs && resumeMs > 0) {
      const applyResumeSeek = () => {
        vid.playbackRate = playbackSpeedRef.current;
        vid.currentTime = resumeMs / 1000;
        currentTimeMsRef.current = resumeMs;
        setCurrentTimeMs(resumeMs);
        pendingHtml5SeekCleanupRef.current = null;
      };
      if (vid.readyState >= 1) {
        applyResumeSeek();
      } else {
        vid.addEventListener('loadedmetadata', applyResumeSeek, { once: true });
        pendingHtml5SeekCleanupRef.current = () => {
          vid.removeEventListener('loadedmetadata', applyResumeSeek);
        };
      }
    }
  }, []);

  const mountOrLoadYoutubePlayer = useCallback((videoId: string, resumeMs?: number) => {
    const MAX_YT_INIT_ATTEMPTS = 50;
    pendingYtVideoIdRef.current = videoId;
    pendingYtSeekRef.current = resumeMs ?? null;
    if (ytInitTimerRef.current !== null) {
      window.clearTimeout(ytInitTimerRef.current);
      ytInitTimerRef.current = null;
    }

    if (ytPlayerRef.current) {
      ytPlayerRef.current.loadVideoById(videoId);
      return;
    }

    let attempts = 0;
    const initWhenReady = () => {
      if (!pendingYtVideoIdRef.current) return;
      const targetId = pendingYtVideoIdRef.current;
      if (!window.YT?.Player || !ytHostRef.current) {
        attempts += 1;
        if (attempts >= MAX_YT_INIT_ATTEMPTS) {
          ytInitTimerRef.current = null;
          return;
        }
        ytInitTimerRef.current = window.setTimeout(initWhenReady, 120);
        return;
      }
      ytInitTimerRef.current = null;

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
                currentTimeMsRef.current = targetSeek;
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
  }, []);

  const handleTimeTick = useCallback(
    (timeMs: number) => {
      currentTimeMsRef.current = timeMs;
      setCurrentTimeMs(timeMs);

      const list = subtitlesRef.current;
      if (list.length === 0) return;

      const curIdx = activeSubIndexRef.current;
      const abActive = abLoopActiveRef.current;

      if (abActive && curIdx >= 0 && curIdx < list.length && Date.now() >= seekLockUntilRef.current) {
        const targetSub = list[curIdx];
        if (timeMs >= targetSub.end_ms - 100 || timeMs < targetSub.start_ms - 300) {
          adapterSeekMs(targetSub.start_ms, 400);
          return;
        }
      }

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

      if (Date.now() < seekLockUntilRef.current) return;

      const foundIdx = findActiveSubtitleIndex(list, timeMs);
      if (foundIdx !== -1 && foundIdx !== curIdx) {
        if (abActive && curIdx >= 0) return;

        hasPausedForShadowingRef.current = false;
        activeSubIndexRef.current = foundIdx;
        setActiveSubIndex(foundIdx);
        setProgressIndex(foundIdx + 1);

        if (sidebarModeRef.current === 'dictation') {
          onSubtitleAdvanceInDictation();
        }

        if (activeMediaKeyRef.current) {
          saveLastWatched(activeMediaKeyRef.current, timeMs, activeSourceTypeRef.current);
        }
      }
    },
    [adapterSeekMs, adapterPause, onSubtitleAdvanceInDictation],
  );

  // HTML5 video listener + 60fps RAF loop
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

  // Cleanup pending metadata seek listeners and YouTube init timers on unmount
  useEffect(() => {
    return () => {
      pendingHtml5SeekCleanupRef.current?.();
      pendingHtml5SeekCleanupRef.current = null;
      if (ytInitTimerRef.current !== null) {
        window.clearTimeout(ytInitTimerRef.current);
        ytInitTimerRef.current = null;
      }
    };
  }, []);

  return {
    videoRef,
    ytHostRef,
    isPlaying,
    currentTimeMs,
    abLoopActive,
    setAbLoopActive,
    playbackSpeed,
    activeSubIndex,
    progressIndex,
    activeSubIndexRef,
    playbackSpeedRef,
    resetPlaybackState,
    syncResumeIndex,
    adapterPause,
    applyPlaybackSpeed,
    togglePlay,
    seekToSubtitle,
    handlePrevSubtitle,
    handleNextSubtitle,
    destroyYoutubePlayer,
    clearHtml5Video,
    loadHtml5Video,
    mountOrLoadYoutubePlayer,
  };
}
