import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaPlayer } from '../useMediaPlayer';

describe('useMediaPlayer', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.YT;
  });

  it('seeks to resumeMs on HTML5 loadedmetadata and re-applies playbackSpeed without blind 800ms timer', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useMediaPlayer({
        activeSourceType: 'local',
        activeMediaKey: 'ep1',
        sidebarMode: 'listening',
        subtitles: [],
        onSubtitleAdvanceInDictation: vi.fn(),
      }),
    );

    const mockVideo = document.createElement('video');
    Object.defineProperty(mockVideo, 'readyState', { value: 0, configurable: true });
    let currentTimeVal = 0;
    Object.defineProperty(mockVideo, 'currentTime', {
      get: () => currentTimeVal,
      set: (v: number) => {
        currentTimeVal = v;
      },
      configurable: true,
    });
    mockVideo.load = vi.fn();
    mockVideo.pause = vi.fn();

    result.current.videoRef.current = mockVideo;

    act(() => {
      result.current.applyPlaybackSpeed(1.2);
    });

    act(() => {
      result.current.loadHtml5Video('ep1', false, 12500);
    });

    // Even if 800ms elapses before metadata arrives, seek must wait for loadedmetadata rather than blind timer.
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(currentTimeVal).toBe(0);

    act(() => {
      mockVideo.dispatchEvent(new Event('loadedmetadata'));
    });

    expect(currentTimeVal).toBeCloseTo(12.5, 2);
    expect(mockVideo.playbackRate).toBe(1.2);
  });

  it('caps YouTube API readiness polling when window.YT never initializes', () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    const { result } = renderHook(() =>
      useMediaPlayer({
        activeSourceType: 'youtube',
        activeMediaKey: 'dQw4w9WgXcQ',
        sidebarMode: 'listening',
        subtitles: [],
        onSubtitleAdvanceInDictation: vi.fn(),
      }),
    );

    result.current.ytHostRef.current = document.createElement('div');
    delete window.YT;

    act(() => {
      result.current.mountOrLoadYoutubePlayer('dQw4w9WgXcQ');
    });

    const initialCalls = setTimeoutSpy.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    const after15sCalls = setTimeoutSpy.mock.calls.length;
    expect(after15sCalls - initialCalls).toBeLessThanOrEqual(55);

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(setTimeoutSpy.mock.calls.length).toBe(after15sCalls);
  });
});
