import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';

describe('App UI shell & interactions', () => {
  beforeEach(() => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/files')) {
        return new Response(
          JSON.stringify([
            { ep_key: 's01e01', video_filename: 'S01E01.mp4', format: 'mp4', video_path: '/tmp/S01E01.mp4' },
            { ep_key: 's01e02', video_filename: 'S01E02.mp4', format: 'mp4', video_path: '/tmp/S01E02.mp4' },
          ]),
          { status: 200 },
        );
      }
      if (url.startsWith('/api/anki/status')) {
        return new Response(JSON.stringify({ connected: true, reason: 'ok' }), { status: 200 });
      }
      if (url.startsWith('/api/youtube/subscriptions')) {
        return new Response(JSON.stringify({ success: true, authenticated: false, channels: [] }), { status: 200 });
      }
      if (url.startsWith('/api/subtitles/s01e01')) {
        return new Response(
          JSON.stringify([
            { start_ms: 1000, end_ms: 3500, text_en: 'Welcome to the show.', text_kr: '쇼에 오신 것을 환영합니다.' },
            { start_ms: 4000, end_ms: 6500, text_en: 'Let us begin right now.', text_kr: '지금 바로 시작합시다.' },
          ]),
          { status: 200 },
        );
      }
      if (url.startsWith('/api/youtube/info')) {
        return new Response(
          JSON.stringify({ success: true, video_id: 'yt123456789', title: 'Sample YouTube Talk' }),
          { status: 200 },
        );
      }
      if (url.startsWith('/api/youtube/subtitles/yt123456789')) {
        return new Response(
          JSON.stringify([
            { start_ms: 500, end_ms: 2500, text_en: 'YouTube line only.', text_kr: '유튜브 자막입니다.' },
          ]),
          { status: 200 },
        );
      }
      if (url.startsWith('/api/anki/add-sentence')) {
        return new Response(JSON.stringify({ success: true, note_id: 9001 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('renders 3-way source navigation, Anki status, sidebar tabs, and theme toggle', async () => {
    // 기본 테마는 OS 설정을 따르므로, 토글 동작만 보도록 저장값을 고정한다.
    localStorage.setItem('shadowing_theme', 'dark');
    render(<App />);

    expect(screen.getByRole('button', { name: /로컬/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /YouTube/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /탐색/ })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /리스닝/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /말하기/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /추출/ })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Anki 연결됨')).toBeInTheDocument();
    });

    const themeBtn = screen.getByRole('button', { name: /테마 전환/ });
    fireEvent.click(themeBtn);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('shadowing_theme')).toBe('light');
  });

  it('supports keyboard shortcuts for blur (V), A-B loop (R), theater mode (F), and shortcuts modal (?)', async () => {
    render(<App />);

    // Initially listening mode starts with blur active
    const blurBtn = screen.getByRole('button', { name: /자막 숨김/ });
    expect(blurBtn).toBeInTheDocument();

    fireEvent.keyDown(document, { code: 'KeyV', key: 'v' });
    expect(screen.getByRole('button', { name: /자막 보임/ })).toBeInTheDocument();

    const abLoopBtn = screen.getByRole('button', { name: /구간 반복/ });
    expect(abLoopBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.keyDown(document, { code: 'KeyR', key: 'r' });
    expect(abLoopBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(document, { key: '?', shiftKey: true, code: 'Slash' });
    expect(screen.getByText('단축키 및 사용법 안내')).toBeInTheDocument();

    fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });
    expect(screen.queryByText('단축키 및 사용법 안내')).not.toBeInTheDocument();

    fireEvent.keyDown(document, { code: 'KeyF', key: 'f' });
    expect(screen.getByTestId('workspace-main')).toHaveAttribute('data-theater', 'true');
  });

  it('auto-loads first local episode and clears youtube subtitles when switching from YouTube to local source', async () => {
    localStorage.setItem(
      'shadowing_last_watched',
      JSON.stringify({ epKey: 'yt123456789', timeMs: 500, sourceMode: 'youtube' }),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('유튜브 자막입니다.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^로컬$/ }));

    await waitFor(() => {
      expect(screen.getByText('쇼에 오신 것을 환영합니다.')).toBeInTheDocument();
    });
    expect(screen.queryByText('유튜브 자막입니다.')).not.toBeInTheDocument();
  });

  it('persists all batch-extracted sentence indices without race condition loss', async () => {
    localStorage.setItem('shadowing_starred', JSON.stringify({ s01e01: [0, 1] }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('쇼에 오신 것을 환영합니다.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /추출/ }));
    const bulkBtn = await screen.findByRole('button', { name: /문장 전체 Anki 전송/ });
    fireEvent.click(bulkBtn);

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('shadowing_extracted') || '{}') as Record<string, number[]>;
      expect(saved.s01e01?.slice().sort()).toEqual([0, 1]);
    });
  });

  it('preserves mounted local video element and stream src when visiting explore and returning to local', async () => {
    const { container } = render(<App />);

    await waitFor(() => {
      expect(screen.getByText('쇼에 오신 것을 환영합니다.')).toBeInTheDocument();
    });

    const initialVideo = container.querySelector('video');
    expect(initialVideo).not.toBeNull();
    expect(initialVideo?.getAttribute('src')).toContain('/api/video/s01e01');

    fireEvent.click(screen.getByRole('button', { name: /탐색/ }));
    expect(screen.getByText('YouTube 쉐도잉 탐색')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^로컬$/ }));
    const restoredVideo = container.querySelector('video');
    expect(restoredVideo).toBe(initialVideo);
    expect(restoredVideo?.getAttribute('src')).toContain('/api/video/s01e01');
  });

  it('ignores stale subtitle response when switching episodes quickly', async () => {
    let resolveSlowEp2: ((res: Response) => void) | null = null;
    const baseFetch = vi.mocked(globalThis.fetch);

    baseFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/files')) {
        return new Response(
          JSON.stringify([
            { ep_key: 's01e01', video_filename: 'S01E01.mp4', format: 'mp4', video_path: '/tmp/S01E01.mp4' },
            { ep_key: 's01e02', video_filename: 'S01E02.mp4', format: 'mp4', video_path: '/tmp/S01E02.mp4' },
            { ep_key: 's01e03', video_filename: 'S01E03.mp4', format: 'mp4', video_path: '/tmp/S01E03.mp4' },
          ]),
          { status: 200 },
        );
      }
      if (url.startsWith('/api/anki/status')) {
        return new Response(JSON.stringify({ connected: true, reason: 'ok' }), { status: 200 });
      }
      if (url.startsWith('/api/subtitles/s01e02')) {
        return new Promise<Response>((resolve) => {
          resolveSlowEp2 = resolve;
        });
      }
      if (url.startsWith('/api/subtitles/s01e03')) {
        return new Response(
          JSON.stringify([{ start_ms: 1000, end_ms: 3000, text_en: 'Episode 3 latest.', text_kr: '에피소드 3 최신' }]),
          { status: 200 },
        );
      }
      if (url.startsWith('/api/subtitles/s01e01')) {
        return new Response(
          JSON.stringify([{ start_ms: 1000, end_ms: 3500, text_en: 'Welcome to the show.', text_kr: '쇼에 오신 것을 환영합니다.' }]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('쇼에 오신 것을 환영합니다.')).toBeInTheDocument();
    });

    const epTrigger = screen.getByRole('button', { name: '에피소드 선택' });
    fireEvent.click(epTrigger);
    fireEvent.click(screen.getByRole('option', { name: /S01E02/i }));

    fireEvent.click(epTrigger);
    fireEvent.click(screen.getByRole('option', { name: /S01E03/i }));

    await waitFor(() => {
      expect(screen.getByText('에피소드 3 최신')).toBeInTheDocument();
    });

    resolveSlowEp2?.(
      new Response(
        JSON.stringify([{ start_ms: 500, end_ms: 2000, text_en: 'Stale episode 2.', text_kr: '오래된 에피소드 2' }]),
        { status: 200 },
      ),
    );

    await waitFor(() => {
      expect(screen.queryByText('오래된 에피소드 2')).not.toBeInTheDocument();
      expect(screen.getByText('에피소드 3 최신')).toBeInTheDocument();
    });
  });

  it('keeps stacked mobile VideoStage/Sidebar height constraints below lg', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('쇼에 오신 것을 환영합니다.')).toBeInTheDocument();
    });

    const stageColumn = screen.getByTestId('stage-column');
    expect(stageColumn.className).toContain('shrink-0');

    const viewport = screen.getByTestId('video-viewport');
    expect(viewport.className).toContain('aspect-video');

    const sidebar = document.querySelector('aside');
    expect(sidebar?.className).toContain('h-[52vh]');
  });

  it('advances to the next subtitle when pressing Enter on document after dictation grading', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('쇼에 오신 것을 환영합니다.')).toBeInTheDocument();
    });

    // Select cue #1 from listening list, then switch to Dictation (말하기)
    fireEvent.click(screen.getByText('쇼에 오신 것을 환영합니다.'));
    fireEvent.click(screen.getByRole('button', { name: /말하기/ }));

    const input = document.getElementById('dictation-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Welcome to the show.' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(screen.getByRole('button', { name: /다음 대사 \(Enter\)/ })).toBeInTheDocument();

    // After grading disables the input, pressing Enter on document should advance to #2
    fireEvent.keyDown(document, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('#2')).toBeInTheDocument();
    });
  });

  it('places DictPopover below modals and closes it when toggling ShortcutsModal (?)', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('쇼에 오신 것을 환영합니다.')).toBeInTheDocument();
    });

    const wordEl = document.querySelector('.word-token');
    expect(wordEl).not.toBeNull();
    fireEvent.click(wordEl!);

    const popover = await screen.findByRole('dialog', { name: '단어 사전 팝오버' });
    expect(popover.className).toContain('z-[8500]');

    fireEvent.keyDown(document, { key: '?', shiftKey: true, code: 'Slash' });
    expect(screen.getByText('단축키 및 사용법 안내')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '단어 사전 팝오버' })).not.toBeInTheDocument();
  });
});
