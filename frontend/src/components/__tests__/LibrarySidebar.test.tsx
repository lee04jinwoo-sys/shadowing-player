import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LibrarySidebar } from '../LibrarySidebar';
import type { Episode } from '../../types';

const EPISODES: Episode[] = [
  { ep_key: 's01e01', video_filename: 'Modern.Family.S01E01.mp4', format: 'mp4', video_path: '/tmp/1.mp4' },
  { ep_key: 's01e02', video_filename: 'Modern.Family.S01E02.mp4', format: 'mp4', video_path: '/tmp/2.mp4' },
  { ep_key: 's02e01', video_filename: 'Friends.S02E01.mp4', format: 'mp4', video_path: '/tmp/3.mp4' },
];

const baseProps = {
  episodes: EPISODES,
  selectedEpKey: 's01e01',
  completedEpisodes: new Set<string>(),
  extractedByEpisode: {} as Record<string, number[]>,
  onSelectEpisode: vi.fn(),
  onRefreshEpisodes: vi.fn(),
  youtubeUrl: '',
  onChangeYoutubeUrl: vi.fn(),
  onLoadYoutube: vi.fn(),
  youtubeLoading: false,
  youtubeHistory: [],
  activeMediaKey: undefined as string | undefined,
};

describe('LibrarySidebar', () => {
  it('lists local episodes with a count, marks the selected one, and selects on click', () => {
    const onSelectEpisode = vi.fn();
    render(
      <LibrarySidebar
        {...baseProps}
        sourceMode="local"
        completedEpisodes={new Set(['s01e02'])}
        extractedByEpisode={{ s01e02: [0, 3] }}
        onSelectEpisode={onSelectEpisode}
      />,
    );

    expect(screen.getByText('에피소드 목록 (3)')).toBeInTheDocument();
    const selected = screen.getByRole('button', { name: /S01E01/ });
    expect(selected).toHaveAttribute('aria-current', 'true');

    const done = screen.getByRole('button', { name: /S01E02/ });
    expect(done).toHaveAttribute('aria-current', 'false');
    expect(done).toHaveTextContent('완료');
    expect(done).toHaveTextContent('추출 2');

    fireEvent.click(done);
    expect(onSelectEpisode).toHaveBeenCalledWith('s01e02');
  });

  it('filters episodes by the search box', () => {
    render(<LibrarySidebar {...baseProps} sourceMode="local" />);
    fireEvent.change(screen.getByPlaceholderText('에피소드 검색...'), { target: { value: 'friends' } });
    expect(screen.queryByRole('button', { name: /S01E01/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /S02E01/ })).toBeInTheDocument();
  });

  it('tells the user how to add a folder when there are no episodes', () => {
    render(<LibrarySidebar {...baseProps} sourceMode="local" episodes={[]} selectedEpKey="" />);
    expect(screen.getByText(/로컬 영상 폴더를 지정/)).toBeInTheDocument();
  });

  it('refreshes the folder scan from the header button', () => {
    const onRefreshEpisodes = vi.fn();
    render(<LibrarySidebar {...baseProps} sourceMode="local" onRefreshEpisodes={onRefreshEpisodes} />);
    fireEvent.click(screen.getByRole('button', { name: '에피소드 목록 새로고침' }));
    expect(onRefreshEpisodes).toHaveBeenCalledTimes(1);
  });

  it('shows the YouTube URL form and history, marking the active video', () => {
    const onLoadYoutube = vi.fn();
    const onChangeYoutubeUrl = vi.fn();
    render(
      <LibrarySidebar
        {...baseProps}
        sourceMode="youtube"
        youtubeUrl="https://www.youtube.com/watch?v=abc123"
        onChangeYoutubeUrl={onChangeYoutubeUrl}
        onLoadYoutube={onLoadYoutube}
        activeMediaKey="abc123"
        youtubeHistory={[
          { id: 'abc123', title: 'TED Talk Active', addedAt: 1 },
          { id: 'xyz789', title: 'Other Talk', addedAt: 2 },
        ]}
      />,
    );

    expect(screen.getByText('최근 영상 (2)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /TED Talk Active/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /Other Talk/ })).toHaveAttribute('aria-current', 'false');

    fireEvent.click(screen.getByRole('button', { name: /Other Talk/ }));
    expect(onChangeYoutubeUrl).toHaveBeenCalledWith('https://www.youtube.com/watch?v=xyz789');
    expect(onLoadYoutube).toHaveBeenCalledWith('https://www.youtube.com/watch?v=xyz789');

    fireEvent.click(screen.getByRole('button', { name: '불러오기' }));
    expect(onLoadYoutube).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc123');
  });
});
