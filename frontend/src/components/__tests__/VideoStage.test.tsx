import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VideoStage } from '../VideoStage';

describe('VideoStage', () => {
  it('supports keyboard ArrowRight / ArrowLeft on the subtitle progress slider', () => {
    const onSeekToSubtitle = vi.fn();

    render(
      <VideoStage
        adapter="html5"
        hasMedia={true}
        aviUnsupported={false}
        videoRef={createRef<HTMLVideoElement>()}
        ytHostRef={createRef<HTMLDivElement>()}
        activeSubtitle={null}
        activeSubIndex={1}
        totalSubtitles={10}
        progressIndex={2}
        currentTimeMs={4000}
        isPlaying={false}
        abLoopActive={false}
        playbackSpeed={1.0}
        showEnOverlay={false}
        showKrOverlay={false}
        dictationModeActive={false}
        theaterMode={false}
        theaterControlsVisible={true}
        savedVocab={[]}
        onTogglePlay={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onToggleABLoop={vi.fn()}
        onChangeSpeed={vi.fn()}
        onToggleEnOverlay={vi.fn()}
        onToggleKrOverlay={vi.fn()}
        onToggleTheater={vi.fn()}
        onSeekToSubtitle={onSeekToSubtitle}
        onLookupWord={vi.fn()}
        controlsHoverRef={createRef<HTMLDivElement>()}
      />,
    );

    const slider = screen.getByRole('slider', { name: '대사 진행률' });
    fireEvent.keyDown(slider, { code: 'ArrowRight', key: 'ArrowRight' });
    expect(onSeekToSubtitle).toHaveBeenCalledWith(2);

    fireEvent.keyDown(slider, { code: 'ArrowLeft', key: 'ArrowLeft' });
    expect(onSeekToSubtitle).toHaveBeenCalledWith(0);
  });

  it('renders subtitle cue ticks and shows standby play overlay before playback while hiding subtitle leak in dictation mode hover', () => {
    const onTogglePlay = vi.fn();
    const subs = [
      { start_ms: 1000, end_ms: 3000, text_en: 'First cue line.', text_kr: '첫 줄' },
      { start_ms: 4000, end_ms: 7000, text_en: 'Secret answer line.', text_kr: '둘째 줄' },
    ];

    const { rerender } = render(
      <VideoStage
        adapter="html5"
        hasMedia={true}
        aviUnsupported={false}
        videoRef={createRef<HTMLVideoElement>()}
        ytHostRef={createRef<HTMLDivElement>()}
        subtitles={subs}
        starredSubtitles={new Set([1])}
        extractedSubtitles={new Set()}
        activeSubtitle={subs[0]}
        activeSubIndex={0}
        totalSubtitles={subs.length}
        progressIndex={1}
        currentTimeMs={0}
        isPlaying={false}
        abLoopActive={false}
        playbackSpeed={1.0}
        showEnOverlay={false}
        showKrOverlay={false}
        dictationModeActive={true}
        theaterMode={false}
        theaterControlsVisible={true}
        savedVocab={[]}
        onTogglePlay={onTogglePlay}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onToggleABLoop={vi.fn()}
        onChangeSpeed={vi.fn()}
        onToggleEnOverlay={vi.fn()}
        onToggleKrOverlay={vi.fn()}
        onToggleTheater={vi.fn()}
        onSeekToSubtitle={vi.fn()}
        onLookupWord={vi.fn()}
        controlsHoverRef={createRef<HTMLDivElement>()}
      />,
    );

    const ticksRail = screen.getByTestId('cue-ticks-rail');
    expect(ticksRail.children.length).toBeGreaterThanOrEqual(2);

    const standbyPlay = screen.getByRole('button', { name: '영상 재생 시작' });
    fireEvent.click(standbyPlay);
    expect(onTogglePlay).toHaveBeenCalledTimes(1);

    // Hovering scrubber in dictation mode shows cue time without leaking secret answer text
    const slider = screen.getByRole('slider', { name: '대사 진행률' });
    Object.defineProperty(slider, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200, top: 0, height: 16, right: 200, bottom: 16 }),
    });
    fireEvent.mouseMove(slider, { clientX: 150 });
    expect(screen.getByTestId('scrubber-hover-tip')).toHaveTextContent('#2');
    expect(screen.getByTestId('scrubber-hover-tip')).not.toHaveTextContent('Secret answer line');

    // Standby overlay disappears once playing
    rerender(
      <VideoStage
        adapter="html5"
        hasMedia={true}
        aviUnsupported={false}
        videoRef={createRef<HTMLVideoElement>()}
        ytHostRef={createRef<HTMLDivElement>()}
        subtitles={subs}
        activeSubtitle={subs[0]}
        activeSubIndex={0}
        totalSubtitles={subs.length}
        progressIndex={1}
        currentTimeMs={1500}
        isPlaying={true}
        abLoopActive={false}
        playbackSpeed={1.0}
        showEnOverlay={false}
        showKrOverlay={false}
        dictationModeActive={false}
        theaterMode={false}
        theaterControlsVisible={true}
        savedVocab={[]}
        onTogglePlay={onTogglePlay}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onToggleABLoop={vi.fn()}
        onChangeSpeed={vi.fn()}
        onToggleEnOverlay={vi.fn()}
        onToggleKrOverlay={vi.fn()}
        onToggleTheater={vi.fn()}
        onSeekToSubtitle={vi.fn()}
        onLookupWord={vi.fn()}
        controlsHoverRef={createRef<HTMLDivElement>()}
      />,
    );

    expect(screen.queryByRole('button', { name: '영상 재생 시작' })).not.toBeInTheDocument();
  });
});
