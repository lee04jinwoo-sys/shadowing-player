import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MediaToolbar } from '../MediaToolbar';

describe('MediaToolbar', () => {
  it('shows the title and runs the online subtitle search with done feedback', async () => {
    const onSearch = vi.fn(async () => true);
    render(
      <MediaToolbar
        title="Modern.Family.S01E01.mp4"
        epKey="s01e01"
        completed={false}
        onSearchOnlineSubtitles={onSearch}
        onToggleComplete={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Modern.Family.S01E01.mp4' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /온라인 자막 검색/ }));
    expect(onSearch).toHaveBeenCalledWith('s01e01');
    await waitFor(() => expect(screen.getByRole('button', { name: /자막 완료/ })).toBeInTheDocument());
  });

  it('toggles completion and reflects the completed state', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <MediaToolbar title="Ep" epKey="s01e01" completed={false} onSearchOnlineSubtitles={vi.fn(async () => true)} onToggleComplete={onToggle} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /완료 표시/ }));
    expect(onToggle).toHaveBeenCalledWith('s01e01');
    rerender(
      <MediaToolbar title="Ep" epKey="s01e01" completed onSearchOnlineSubtitles={vi.fn(async () => true)} onToggleComplete={onToggle} />,
    );
    expect(screen.getByRole('button', { name: /완료됨/ })).toBeInTheDocument();
  });

  it('hides episode-only actions when there is no episode key (YouTube)', () => {
    render(<MediaToolbar title="TED Talk" completed={false} onSearchOnlineSubtitles={vi.fn(async () => true)} onToggleComplete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /온라인 자막 검색/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /완료 표시/ })).not.toBeInTheDocument();
  });
});
