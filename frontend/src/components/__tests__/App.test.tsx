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
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('renders 3-way source navigation, Anki status, sidebar tabs, and theme toggle', async () => {
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
});
