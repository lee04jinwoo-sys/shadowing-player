import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DictationPanel } from '../DictationPanel';

describe('DictationPanel', () => {
  it('offers a retry action after grading to allow editing and re-checking the current line', () => {
    const onCheckedChange = vi.fn();

    render(
      <DictationPanel
        activeSubIndex={0}
        activeSubtitle={{
          start_ms: 1000,
          end_ms: 3500,
          text_en: 'Welcome to the show.',
          text_kr: '쇼에 오신 것을 환영합니다.',
        }}
        dictationInput="Welcome to show"
        dictationChecked={true}
        isStarred={false}
        onChangeInput={vi.fn()}
        onCheckedChange={onCheckedChange}
        onNextSubtitle={vi.fn()}
        onReplaySubtitle={vi.fn()}
        onToggleStar={vi.fn()}
        onPauseVideo={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    const primaryBtn = screen.getByRole('button', { name: /다음 대사/ });
    expect(primaryBtn.className).toContain('text-accent-ink');
    expect(primaryBtn.className).not.toContain('text-white');

    const retryBtn = screen.getByRole('button', { name: /다시 시도/ });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it('ignores stale AI explanation response when switching subtitles quickly', async () => {
    let resolveAi: ((res: Response) => void) | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveAi = resolve;
          }),
      ),
    );

    const { rerender } = render(
      <DictationPanel
        activeSubIndex={0}
        activeSubtitle={{
          start_ms: 1000,
          end_ms: 3500,
          text_en: 'Welcome to the show.',
          text_kr: '쇼에 오신 것을 환영합니다.',
        }}
        dictationInput="Welcome to the show."
        dictationChecked={true}
        isStarred={false}
        onChangeInput={vi.fn()}
        onCheckedChange={vi.fn()}
        onNextSubtitle={vi.fn()}
        onReplaySubtitle={vi.fn()}
        onToggleStar={vi.fn()}
        onPauseVideo={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /AI 설명/ }));
    expect(screen.getByText('AI가 문장을 분석하고 있습니다...')).toBeInTheDocument();

    // Rapidly move to subtitle #2 (un-checked state) before request finishes
    rerender(
      <DictationPanel
        activeSubIndex={1}
        activeSubtitle={{
          start_ms: 4000,
          end_ms: 6500,
          text_en: 'Let us begin right now.',
          text_kr: '지금 바로 시작합시다.',
        }}
        dictationInput=""
        dictationChecked={false}
        isStarred={false}
        onChangeInput={vi.fn()}
        onCheckedChange={vi.fn()}
        onNextSubtitle={vi.fn()}
        onReplaySubtitle={vi.fn()}
        onToggleStar={vi.fn()}
        onPauseVideo={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    resolveAi?.(
      new Response(JSON.stringify({ success: true, explanation: '이전 문장 구식 AI 설명' }), {
        status: 200,
      }),
    );

    await Promise.resolve();
    await Promise.resolve();

    // Switch to checked state on subtitle #2: stale #1 explanation must NOT appear
    rerender(
      <DictationPanel
        activeSubIndex={1}
        activeSubtitle={{
          start_ms: 4000,
          end_ms: 6500,
          text_en: 'Let us begin right now.',
          text_kr: '지금 바로 시작합시다.',
        }}
        dictationInput="Let us begin"
        dictationChecked={true}
        isStarred={false}
        onChangeInput={vi.fn()}
        onCheckedChange={vi.fn()}
        onNextSubtitle={vi.fn()}
        onReplaySubtitle={vi.fn()}
        onToggleStar={vi.fn()}
        onPauseVideo={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    expect(screen.queryByText('이전 문장 구식 AI 설명')).not.toBeInTheDocument();
  });
});
