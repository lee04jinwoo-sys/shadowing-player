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

    const retryBtn = screen.getByRole('button', { name: /다시 시도/ });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });
});
