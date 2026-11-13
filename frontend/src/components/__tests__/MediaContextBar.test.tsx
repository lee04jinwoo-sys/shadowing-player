import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MediaContextBar } from '../MediaContextBar';
import type { Episode } from '../../types';

const EPISODES: Episode[] = [
  {
    ep_key: 's01e01',
    video_filename: 'Modern.Family.S01E01.mp4',
    format: 'mp4',
    video_path: '/tmp/s01e01.mp4',
  },
  {
    ep_key: 's01e02',
    video_filename: 'Modern.Family.S01E02.mp4',
    format: 'mp4',
    video_path: '/tmp/s01e02.mp4',
  },
];

describe('MediaContextBar', () => {
  it('renders a custom listbox episode selector instead of native select and supports selection and Escape close', () => {
    const onSelectEpisode = vi.fn();

    render(
      <MediaContextBar
        sourceMode="local"
        episodes={EPISODES}
        selectedEpKey="s01e01"
        completedEpisodes={new Set(['s01e02'])}
        extractedByEpisode={{ s01e02: [0, 3] }}
        onSelectEpisode={onSelectEpisode}
        onRefreshEpisodes={vi.fn()}
        onSearchOnlineSubtitles={vi.fn(async () => true)}
        onToggleEpisodeComplete={vi.fn()}
        youtubeUrl=""
        onChangeYoutubeUrl={vi.fn()}
        onLoadYoutube={vi.fn()}
        youtubeLoading={false}
        youtubeHistory={[{ id: 'abc123', title: 'TED Talk' }]}
      />,
    );

    const trigger = screen.getByRole('button', { name: '에피소드 선택' });
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');

    fireEvent.click(trigger);
    const listbox = screen.getByRole('listbox', { name: '에피소드 목록' });
    expect(listbox).toBeInTheDocument();

    const opt2 = screen.getByRole('option', { name: /S01E02/i });
    expect(opt2).toHaveTextContent('완료');
    fireEvent.click(opt2);
    expect(onSelectEpisode).toHaveBeenCalledWith('s01e02');
    expect(screen.queryByRole('listbox', { name: '에피소드 목록' })).not.toBeInTheDocument();

    // Open again and verify Escape dismisses the popover cleanly
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox', { name: '에피소드 목록' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('listbox', { name: '에피소드 목록' })).not.toBeInTheDocument();
  });
});
