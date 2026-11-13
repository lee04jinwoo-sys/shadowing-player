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
});
