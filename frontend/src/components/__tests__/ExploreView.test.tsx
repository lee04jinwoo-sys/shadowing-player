import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExploreView } from '../ExploreView';

describe('ExploreView', () => {
  beforeEach(() => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/youtube/subscriptions/channel/')) {
        return new Response(
          JSON.stringify({
            success: true,
            results: [
              {
                video_id: 'chanvid1111',
                title: 'TED-Ed Channel Latest',
                thumbnail: 'https://example.com/thumb.jpg',
                channel: 'TED-Ed',
                duration_str: '04:30',
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.startsWith('/api/youtube/subscriptions')) {
        return new Response(
          JSON.stringify({
            success: true,
            authenticated: false,
            channels: [{ channel_id: 'UCsooa4yRKGN_zEE8iknghZA', title: 'TED-Ed' }],
          }),
          { status: 200 },
        );
      }
      if (url.startsWith('/api/youtube/search')) {
        return new Response(JSON.stringify({ success: true, results: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('shows recommended default channels alongside Google connect banner when unauthenticated', async () => {
    render(
      <ExploreView
        onSelectVideo={vi.fn()}
        onOpenSettings={vi.fn()}
        subscriptionsVersion={0}
        onToast={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'TED-Ed' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Google 계정 연동하기/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'TED-Ed' }));
    await waitFor(() => {
      expect(screen.getByText('TED-Ed Channel Latest')).toBeInTheDocument();
    });
  });
});
