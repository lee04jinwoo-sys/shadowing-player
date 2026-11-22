import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  beforeEach(() => {
    localStorage.clear();
  });

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

  it('is a hover-reveal drawer: content stays mounted, slides over the stage on lg, and has no toggle button', () => {
    render(<LibrarySidebar {...baseProps} sourceMode="local" />);

    // 목록은 항상 렌더링되어 있고(접힘 상태로 언마운트되지 않음), 접기/펼치기 버튼은 없다.
    expect(screen.getByPlaceholderText('에피소드 검색...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /S01E01/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /목록 (접기|펼치기)/ })).not.toBeInTheDocument();

    const panel = screen.getByTestId('library-sidebar');
    const wrapper = panel.parentElement as HTMLElement;
    // 호버/포커스 영역은 래퍼, 패널은 lg에서 오버레이로 슬라이드한다.
    expect(wrapper.className).toContain('group');
    expect(wrapper.className).toContain('lg:w-3');
    expect(panel.className).toContain('lg:absolute');
    expect(panel.className).toContain('lg:-translate-x-full');
    expect(panel.className).toContain('lg:group-hover:translate-x-0');
    expect(panel.className).toContain('lg:group-focus-within:translate-x-0');
    expect(panel.className).toContain('motion-reduce:transition-none');
  });

  it('works the same way in YouTube mode', () => {
    render(<LibrarySidebar {...baseProps} sourceMode="youtube" />);
    const panel = screen.getByTestId('library-sidebar');
    expect(screen.getByPlaceholderText(/URL 또는 Video ID/)).toBeInTheDocument();
    expect(panel.className).toContain('lg:group-hover:translate-x-0');
  });

  it('keeps episode and video titles in the UI sans font, not the serif display font', () => {
    render(
      <LibrarySidebar
        {...baseProps}
        sourceMode="local"
      />,
    );
    const title = screen.getByText('Modern.Family.S01E01.mp4');
    expect(title.className).not.toContain('font-serif');
  });
});
