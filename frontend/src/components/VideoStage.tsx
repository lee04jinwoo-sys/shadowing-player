import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Film,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
} from 'lucide-react';
import type { DictPopoverRequest, SavedVocabItem, SubtitleItem } from '../types';
import { formatTime } from '../utils/subtitles';
import { WordTokens } from './WordTokens';

interface VideoStageProps {
  adapter: 'html5' | 'youtube';
  hasMedia: boolean;
  aviUnsupported: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  ytHostRef: React.RefObject<HTMLDivElement | null>;
  subtitles?: SubtitleItem[];
  starredSubtitles?: Set<number>;
  extractedSubtitles?: Set<number>;
  mediaTitle?: string;
  activeSubtitle: SubtitleItem | null;
  activeSubIndex: number;
  totalSubtitles: number;
  progressIndex: number;
  currentTimeMs: number;
  isPlaying: boolean;
  abLoopActive: boolean;
  playbackSpeed: number;
  showEnOverlay: boolean;
  showKrOverlay: boolean;
  dictationModeActive: boolean;
  theaterMode: boolean;
  theaterControlsVisible: boolean;
  savedVocab: SavedVocabItem[];
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleABLoop: () => void;
  onChangeSpeed: (speed: number) => void;
  onToggleEnOverlay: () => void;
  onToggleKrOverlay: () => void;
  onToggleTheater: () => void;
  onSeekToSubtitle: (idx: number) => void;
  onLookupWord: (req: DictPopoverRequest) => void;
  controlsHoverRef: React.RefObject<HTMLDivElement | null>;
}

const MAX_CUE_TICKS = 96;

export const VideoStage: React.FC<VideoStageProps> = ({
  adapter,
  hasMedia,
  aviUnsupported,
  videoRef,
  ytHostRef,
  subtitles = [],
  starredSubtitles = new Set<number>(),
  extractedSubtitles = new Set<number>(),
  mediaTitle,
  activeSubtitle,
  activeSubIndex,
  totalSubtitles,
  progressIndex,
  currentTimeMs,
  isPlaying,
  abLoopActive,
  playbackSpeed,
  showEnOverlay,
  showKrOverlay,
  dictationModeActive,
  theaterMode,
  theaterControlsVisible,
  savedVocab,
  onTogglePlay,
  onPrev,
  onNext,
  onToggleABLoop,
  onChangeSpeed,
  onToggleEnOverlay,
  onToggleKrOverlay,
  onToggleTheater,
  onSeekToSubtitle,
  onLookupWord,
  controlsHoverRef,
}) => {
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const [draggingProgress, setDraggingProgress] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{ idx: number; pct: number } | null>(null);

  const getIndexFromClientX = (clientX: number): { idx: number; pct: number } | null => {
    if (totalSubtitles <= 0 || !progressBarRef.current) return null;
    const rect = progressBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = Math.min(Math.floor(ratio * totalSubtitles), totalSubtitles - 1);
    return { idx, pct: ratio * 100 };
  };

  const seekFromClientX = (clientX: number) => {
    const pos = getIndexFromClientX(clientX);
    if (pos) onSeekToSubtitle(pos.idx);
  };
  const seekFromClientXRef = useRef(seekFromClientX);
  seekFromClientXRef.current = seekFromClientX;

  const handleSliderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (totalSubtitles <= 0) return;
    const baseIdx = activeSubIndex >= 0 ? activeSubIndex : Math.max(0, progressIndex - 1);
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      onSeekToSubtitle(Math.min(totalSubtitles - 1, baseIdx + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      onSeekToSubtitle(Math.max(0, baseIdx - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      onSeekToSubtitle(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      onSeekToSubtitle(totalSubtitles - 1);
    }
  };

  useEffect(() => {
    if (!draggingProgress) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX =
        'touches' in e && e.touches.length > 0 ? e.touches[0].clientX : (e as MouseEvent).clientX;
      seekFromClientXRef.current(clientX);
    };
    const handleUp = () => setDraggingProgress(false);

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove, { passive: true });
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchend', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchend', handleUp);
    };
  }, [draggingProgress]);

  const cueTicks = useMemo(() => {
    const total = subtitles.length;
    if (total <= 0) return [];
    const step = total <= MAX_CUE_TICKS ? 1 : Math.ceil(total / MAX_CUE_TICKS);
    const items: { idx: number; leftPct: number; status: 'extracted' | 'starred' | 'normal' }[] = [];

    for (let i = 0; i < total; i += step) {
      let status: 'extracted' | 'starred' | 'normal' = 'normal';
      const end = Math.min(total, i + step);
      for (let j = i; j < end; j += 1) {
        if (extractedSubtitles.has(j)) {
          status = 'extracted';
          break;
        }
        if (starredSubtitles.has(j)) {
          status = 'starred';
        }
      }
      const leftPct = total === 1 ? 50 : (i / (total - 1)) * 100;
      items.push({ idx: i, leftPct, status });
    }
    return items;
  }, [subtitles.length, starredSubtitles, extractedSubtitles]);

  const percentage =
    totalSubtitles > 0 ? Math.round((progressIndex / totalSubtitles) * 100) : 0;

  const showEnText = Boolean(showEnOverlay && activeSubtitle?.text_en && !dictationModeActive);
  const showKrText = Boolean(showKrOverlay && activeSubtitle?.text_kr);
  const showStandbyOverlay = Boolean(
    hasMedia && !aviUnsupported && !isPlaying && currentTimeMs < 500,
  );
  const hoveredSub =
    hoverPreview && hoverPreview.idx >= 0 && hoverPreview.idx < subtitles.length
      ? subtitles[hoverPreview.idx]
      : null;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {/* Cinema Video Viewport */}
      <div
        className={`relative flex-1 min-h-[240px] bg-stage overflow-hidden flex items-center justify-center ${
          theaterMode ? 'rounded-none border-none' : ''
        }`}
      >
        <video
          ref={videoRef}
          playsInline
          className={`w-full h-full object-contain ${
            adapter === 'html5' && hasMedia && !aviUnsupported ? 'block' : 'hidden'
          }`}
        />

        <div
          ref={ytHostRef}
          className={`w-full h-full ${adapter === 'youtube' ? 'block' : 'hidden'}`}
        />

        {!hasMedia && !aviUnsupported && (
          <div className="flex flex-col items-center gap-3 px-6 text-center max-w-md">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 border border-line text-accent">
              <Film className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink">
                에피소드 또는 YouTube 영상을 선택하세요
              </p>
              <p className="text-xs text-ink-3 leading-relaxed">
                상단에서 로컬 에피소드를 고르거나 YouTube URL을 불러와 바로 섀도잉을 시작할 수 있습니다.
              </p>
            </div>
          </div>
        )}

        {aviUnsupported && (
          <div className="flex flex-col items-center gap-3 px-6 text-center max-w-md">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-danger/15 border border-danger/30 text-danger">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <p className="text-base font-semibold text-danger">재생 불가능한 파일 형식 (.avi)</p>
            <p className="text-xs leading-relaxed text-ink-2">
              HTML5 브라우저는 .avi 재생을 지원하지 않습니다. 프로젝트 폴더 내{' '}
              <code className="px-1.5 py-0.5 rounded bg-surface-2 text-ink font-mono">
                convert_avi_to_mp4.py
              </code>
              를 실행해 MP4로 변환해 주세요.
            </p>
          </div>
        )}

        {/* Quiet Standby Launch Cue on Initial Idle Frame */}
        {showStandbyOverlay && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6">
            <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#0a0d14]/75 backdrop-blur-md px-6 py-5 text-center shadow-2xl max-w-sm">
              <button
                type="button"
                aria-label="영상 재생 시작"
                onClick={onTogglePlay}
                className="grid h-12 w-12 place-items-center rounded-full bg-accent hover:bg-accent-hover text-accent-ink shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current ml-0.5" />
              </button>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#eef1f6] truncate max-w-[260px]">
                  {mediaTitle || '재생 준비 완료'}
                </p>
                <p className="text-[11px] text-[#a7b0c0]">
                  <span className="font-mono text-accent">Space</span> 재생 ·{' '}
                  <span className="font-mono text-accent">← →</span> 문장 이동
                  {totalSubtitles > 0 && ` · 자막 ${totalSubtitles}줄`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Interactive Subtitle Overlays */}
        {(showEnText || showKrText) && (
          <div
            className={`absolute inset-x-[5%] z-20 flex flex-col items-center gap-1.5 text-center pointer-events-none transition-[bottom] duration-200 ${
              theaterMode && theaterControlsVisible ? 'bottom-24' : 'bottom-7'
            }`}
          >
            {showEnText && activeSubtitle && (
              <div
                id="overlay-en"
                className="pointer-events-auto inline-block max-w-[92%] rounded-xl bg-[#07090f]/80 backdrop-blur-md px-4 py-2 text-lg sm:text-[21px] font-semibold leading-snug text-white shadow-xl border border-white/10"
              >
                <WordTokens
                  text={activeSubtitle.text_en}
                  contextSentence={activeSubtitle.text_en}
                  scopeKey={`overlay-${activeSubIndex}`}
                  savedVocab={savedVocab}
                  onLookupWord={onLookupWord}
                />
              </div>
            )}
            {showKrText && activeSubtitle?.text_kr && (
              <div
                id="overlay-kr"
                className="inline-block max-w-[90%] rounded-lg bg-[#07090f]/70 backdrop-blur-md px-3.5 py-1.5 text-sm sm:text-[15px] text-slate-200 border border-white/10"
              >
                {activeSubtitle.text_kr}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Precision NLE Transport Dock */}
      <div
        ref={controlsHoverRef}
        className={
          theaterMode
            ? `absolute inset-x-0 bottom-0 z-30 px-6 sm:px-10 pt-8 pb-4 bg-gradient-to-t from-black/95 via-black/75 to-transparent backdrop-blur-sm transition-all duration-200 ${
                theaterControlsVisible
                  ? 'translate-y-0 opacity-100 pointer-events-auto'
                  : 'translate-y-full opacity-0 pointer-events-none'
              }`
            : 'border-t border-line bg-surface rounded-b-2xl px-4 py-2.5 shrink-0'
        }
      >
        {/* Row 1: NLE Cue-Tick Scrubber & Numeric Readout */}
        <div className="flex items-center gap-3 mb-2">
          <span className="num font-mono text-[11px] font-medium text-ink-3 w-11 shrink-0">
            {formatTime(currentTimeMs)}
          </span>

          <div
            ref={progressBarRef}
            role="slider"
            aria-label="대사 진행률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
            tabIndex={0}
            onKeyDown={handleSliderKeyDown}
            onMouseDown={(e) => {
              setDraggingProgress(true);
              seekFromClientX(e.clientX);
            }}
            onMouseMove={(e) => {
              const pos = getIndexFromClientX(e.clientX);
              if (pos) setHoverPreview(pos);
            }}
            onMouseLeave={() => setHoverPreview(null)}
            onTouchStart={(e) => {
              setDraggingProgress(true);
              if (e.touches.length > 0) seekFromClientX(e.touches[0].clientX);
            }}
            className="group relative flex-1 h-5 flex flex-col justify-center cursor-pointer"
          >
            {hoverPreview && totalSubtitles > 0 && (
              <div
                data-testid="scrubber-hover-tip"
                style={{ left: `${Math.max(8, Math.min(92, hoverPreview.pct))}%` }}
                className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 z-30 max-w-[260px] rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1 text-[11px] text-ink shadow-xl whitespace-nowrap truncate"
              >
                <span className="num font-mono font-semibold text-accent">
                  #{hoverPreview.idx + 1}
                </span>
                {hoveredSub && (
                  <span className="num font-mono text-ink-3 ml-1.5">
                    {formatTime(hoveredSub.start_ms)}
                  </span>
                )}
                {!dictationModeActive && hoveredSub?.text_en && (
                  <span className="text-ink-2 ml-1.5">· {hoveredSub.text_en}</span>
                )}
              </div>
            )}

            {/* Track + Progress Fill + Handle */}
            <div className="relative w-full h-1.5 group-hover:h-2 rounded-full bg-surface-2 overflow-visible transition-all">
              <div
                className="h-full bg-accent rounded-full transition-[width] duration-150 relative"
                style={{ width: `${percentage}%` }}
              >
                <span
                  aria-hidden="true"
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2.5 h-2.5 rounded-full bg-accent shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </div>
            </div>

            {/* Cue Tick Rail */}
            <div
              data-testid="cue-ticks-rail"
              aria-hidden="true"
              className="relative w-full h-1 mt-0.5 overflow-hidden"
            >
              {cueTicks.map((tick) => {
                const colorClass =
                  tick.status === 'extracted'
                    ? 'bg-good'
                    : tick.status === 'starred'
                      ? 'bg-accent'
                      : tick.idx === activeSubIndex
                        ? 'bg-ink'
                        : 'bg-line-strong';
                return (
                  <span
                    key={tick.idx}
                    style={{ left: `${tick.leftPct}%` }}
                    className={`absolute top-0 bottom-0 w-[2px] -translate-x-1/2 rounded-full ${colorClass}`}
                  />
                );
              })}
            </div>
          </div>

          <span className="num font-mono text-[11px] font-medium text-ink-2 shrink-0">
            {progressIndex} / {totalSubtitles} ({percentage}%)
          </span>
        </div>

        {/* Row 2: Hairline Transport Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              title="이전 대사 (←)"
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              title="재생 / 일시정지 (Space)"
              className="grid h-9 w-9 place-items-center rounded-full bg-accent hover:bg-accent-hover text-accent-ink shadow-xs transition-transform active:scale-95 cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              title="다음 대사 (→)"
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-line mx-1.5" />

            <button
              type="button"
              aria-pressed={abLoopActive}
              onClick={onToggleABLoop}
              title="현재 대사 구간 반복 토글 (R)"
              className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                abLoopActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-ink-2 hover:text-ink hover:bg-surface-2'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>구간 반복</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Video Subtitle Overlay Pills */}
            <div className="inline-flex items-center rounded-lg bg-surface-2 p-0.5 gap-0.5">
              <button
                type="button"
                aria-pressed={showEnOverlay}
                onClick={onToggleEnOverlay}
                title="영상 영어 자막 오버레이 토글"
                className={`h-6 px-2 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  showEnOverlay
                    ? 'bg-surface-3 text-accent shadow-[0_1px_0_var(--line-strong)_inset]'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                aria-pressed={showKrOverlay}
                onClick={onToggleKrOverlay}
                title="영상 한국어 자막 오버레이 토글"
                className={`h-6 px-2 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  showKrOverlay
                    ? 'bg-surface-3 text-accent shadow-[0_1px_0_var(--line-strong)_inset]'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                KR
              </button>
            </div>

            {/* Speed Control */}
            <div className="flex items-center gap-1.5 rounded-lg bg-surface-2/80 px-2.5 h-7">
              <span className="text-[11px] text-ink-3 font-medium">속도</span>
              <input
                type="range"
                aria-label="재생 속도"
                min="0.5"
                max="2.0"
                step="0.1"
                value={playbackSpeed}
                onChange={(e) => onChangeSpeed(Number.parseFloat(e.target.value))}
                className="studio-slider w-14 sm:w-16"
              />
              <button
                type="button"
                onClick={() => onChangeSpeed(1.0)}
                title="클릭하여 1.0x 초기화"
                className="num font-mono text-[11px] font-semibold text-ink-2 hover:text-accent w-9 text-right cursor-pointer"
              >
                {playbackSpeed.toFixed(1)}x
              </button>
            </div>

            <button
              type="button"
              aria-pressed={theaterMode}
              onClick={onToggleTheater}
              title={theaterMode ? '기본 화면 / 사이드바 열기 (F)' : '시어터 모드 / 사이드바 접기 (F)'}
              className={`grid h-8 w-8 place-items-center rounded-lg transition-colors cursor-pointer ${
                theaterMode
                  ? 'bg-accent/15 text-accent'
                  : 'text-ink-2 hover:text-ink hover:bg-surface-2'
              }`}
            >
              {theaterMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
