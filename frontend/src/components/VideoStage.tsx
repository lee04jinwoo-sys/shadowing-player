import React, { useRef, useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  AlertTriangle,
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

export const VideoStage: React.FC<VideoStageProps> = ({
  adapter,
  hasMedia,
  aviUnsupported,
  videoRef,
  ytHostRef,
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

  const seekFromClientX = (clientX: number) => {
    if (totalSubtitles <= 0 || !progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = Math.min(Math.floor(ratio * totalSubtitles), totalSubtitles - 1);
    onSeekToSubtitle(idx);
  };

  useEffect(() => {
    if (!draggingProgress) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e && e.touches.length > 0 ? e.touches[0].clientX : (e as MouseEvent).clientX;
      seekFromClientX(clientX);
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
  });

  const percentage =
    totalSubtitles > 0 ? Math.round((progressIndex / totalSubtitles) * 100) : 0;

  const showEnText = Boolean(showEnOverlay && activeSubtitle?.text_en && !dictationModeActive);
  const showKrText = Boolean(showKrOverlay && activeSubtitle?.text_kr);

  return (
    <div
      className={`relative flex-1 min-h-0 flex flex-col ${
        theaterMode ? 'p-0 gap-0' : 'p-3 sm:p-4 lg:p-5 gap-3 sm:gap-4'
      }`}
    >
      {/* Video Viewport */}
      <div
        className={`relative flex-1 min-h-[240px] bg-black overflow-hidden flex items-center justify-center ${
          theaterMode ? 'rounded-none border-none' : 'rounded-2xl border border-line shadow-lg'
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
          <div className="flex flex-col items-center gap-2.5 px-6 text-center text-slate-400">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 border border-white/10">
              <Film className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-300">
              에피소드 또는 YouTube 영상을 선택하세요
            </p>
            <p className="text-xs text-slate-500">
              로컬 폴더의 MP4 영상이나 YouTube 링크로 바로 섀도잉을 시작할 수 있습니다.
            </p>
          </div>
        )}

        {aviUnsupported && (
          <div className="flex flex-col items-center gap-3 px-6 text-center max-w-md">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-danger/15 border border-danger/30 text-danger">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <p className="text-base font-semibold text-danger">재생 불가능한 파일 형식 (.avi)</p>
            <p className="text-xs leading-relaxed text-slate-400">
              HTML5 브라우저는 .avi 재생을 지원하지 않습니다. 프로젝트 폴더 내{' '}
              <code className="px-1.5 py-0.5 rounded bg-white/10 text-slate-200 font-mono">
                convert_avi_to_mp4.py
              </code>
              를 실행해 MP4로 변환해 주세요.
            </p>
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
                className="pointer-events-auto inline-block max-w-[92%] rounded-xl bg-black/75 backdrop-blur-md px-4 py-2 text-lg sm:text-[21px] font-semibold leading-snug text-white shadow-lg border border-white/10"
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
                className="inline-block max-w-[90%] rounded-lg bg-black/65 backdrop-blur-md px-3.5 py-1.5 text-sm sm:text-[15px] text-slate-200 border border-white/5"
              >
                {activeSubtitle.text_kr}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Studio Player Controls Bar */}
      <div
        ref={controlsHoverRef}
        className={
          theaterMode
            ? `absolute inset-x-0 bottom-0 z-30 px-6 sm:px-10 pt-8 pb-4 bg-gradient-to-t from-black/95 via-black/75 to-transparent backdrop-blur-sm transition-all duration-200 ${
                theaterControlsVisible
                  ? 'translate-y-0 opacity-100 pointer-events-auto'
                  : 'translate-y-full opacity-0 pointer-events-none'
              }`
            : 'rounded-2xl bg-surface border border-line px-4 py-2.5 shadow-sm'
        }
      >
        {/* Row 1: Scrubber & Numeric Readout */}
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
            onMouseDown={(e) => {
              setDraggingProgress(true);
              seekFromClientX(e.clientX);
            }}
            onTouchStart={(e) => {
              setDraggingProgress(true);
              if (e.touches.length > 0) seekFromClientX(e.touches[0].clientX);
            }}
            className="group flex-1 h-4 flex items-center cursor-pointer"
          >
            <div className="w-full h-1 group-hover:h-1.5 rounded-full bg-surface-2 border border-line/40 overflow-hidden transition-all">
              <div
                className="h-full bg-accent rounded-full transition-[width] duration-200"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          <span className="num font-mono text-[11px] font-medium text-ink-2 shrink-0">
            {progressIndex} / {totalSubtitles} ({percentage}%)
          </span>
        </div>

        {/* Row 2: Transport, Loop, Overlay Toggles, Speed, Theater */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
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
              className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer"
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

            <div className="h-4 w-px bg-line mx-1" />

            <button
              type="button"
              aria-pressed={abLoopActive}
              onClick={onToggleABLoop}
              title="현재 대사 구간 반복 토글 (R)"
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                abLoopActive
                  ? 'bg-accent/15 border-accent/45 text-accent'
                  : 'bg-surface-2/70 hover:bg-surface-2 border-line text-ink-2 hover:text-ink'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>구간 반복</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Video Subtitle Overlay Pills */}
            <div className="inline-flex items-center rounded-lg bg-surface-2 border border-line p-0.5 gap-0.5">
              <button
                type="button"
                aria-pressed={showEnOverlay}
                onClick={onToggleEnOverlay}
                title="영상 영어 자막 오버레이 토글"
                className={`h-6 px-2 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  showEnOverlay
                    ? 'bg-surface text-accent border border-line-strong'
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
                    ? 'bg-surface text-accent border border-line-strong'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                KR
              </button>
            </div>

            {/* Speed Control */}
            <div className="flex items-center gap-1.5 rounded-xl bg-surface-2 border border-line px-2.5 h-8">
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
              className={`grid h-8 w-8 place-items-center rounded-xl border transition-colors cursor-pointer ${
                theaterMode
                  ? 'bg-accent/15 border-accent/45 text-accent'
                  : 'bg-surface-2 hover:bg-line border-line text-ink-2 hover:text-ink'
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
