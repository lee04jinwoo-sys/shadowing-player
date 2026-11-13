import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { SettingsModal } from '../SettingsModal';

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
  });

  it('ignores GOOGLE_AUTH_SUCCESS postMessage events from foreign origins', async () => {
    const onSubscriptionsRefresh = vi.fn();
    const onToast = vi.fn();

    render(
      <SettingsModal
        isOpen={false}
        onClose={vi.fn()}
        onEpisodesReload={vi.fn()}
        onSubscriptionsRefresh={onSubscriptionsRefresh}
        onToast={onToast}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://evil.example.com',
          data: { type: 'GOOGLE_AUTH_SUCCESS' },
        }),
      );
    });

    expect(onSubscriptionsRefresh).not.toHaveBeenCalled();
    expect(onToast).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: { type: 'GOOGLE_AUTH_SUCCESS' },
        }),
      );
    });

    await waitFor(() => {
      expect(onSubscriptionsRefresh).toHaveBeenCalledTimes(1);
    });
    expect(onToast).toHaveBeenCalledTimes(1);
  });
});
