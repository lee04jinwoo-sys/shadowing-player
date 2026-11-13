import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, RotateCcw, Sparkles, Star } from 'lucide-react';
import type { DiffWordItem, SubtitleItem } from '../types';
import { compareStrings } from '../utils/dictation';
import { getSTTListeningState, isSTTSupported, startSTT, stopSTT } from '../utils/stt';
import { getAIExplanation } from '../api';

interface DictationPanelProps {
  activeSubIndex: number;
  activeSubtitle: SubtitleItem | null;
  dictationInput: string;
  dictationChecked: boolean;
  isStarred: boolean;
  onChangeInput: (value: string) => void;
  onCheckedChange: (checked: boolean) => void;
  onNextSubtitle: () => void;
  onReplaySubtitle: () => void;
  onToggleStar: () => void;
  onPauseVideo: () => void;
  onToast: (msg: string, tone?: 'info' | 'success' | 'warn' | 'error') => void;
}

function renderFormattedInline(line: string): React.ReactNode[] {
  const parts = line.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={idx} className="italic text-ink-2">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const DictationPanel: React.FC<DictationPanelProps> = ({
  activeSubIndex,
  activeSubtitle,
  dictationInput,
  dictationChecked,
  isStarred,
  onChangeInput,
  onCheckedChange,
  onNextSubtitle,
  onReplaySubtitle,
  onToggleStar,
  onPauseVideo,
  onToast,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [sttListening, setSttListening] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffWordItem[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);

  useEffect(() => {
    if (!dictationChecked) {
      setDiffResult([]);
      setScore(null);
      setAiExplanation(null);
      setAiLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [activeSubIndex, dictationChecked]);

  const runGrade = (typedRaw: string) => {
    if (!activeSubtitle) return;
    const typed = typedRaw.trim();
    const comparison = compareStrings(activeSubtitle.text_en, typed);
    setDiffResult(comparison);

    if (typed.length > 0) {
      const correctCount = comparison.filter((d) => d.status === 'correct').length;
      const totalWords = comparison.filter((d) => d.status !== 'extra').length;
      setScore(totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0);
    } else {
      setScore(null);
    }
    onCheckedChange(true);
  };

  const handlePrimaryAction = () => {
    if (activeSubIndex === -1 || !activeSubtitle) return;
    if (!dictationChecked) {
      runGrade(dictationInput);
    } else {
      onChangeInput('');
      onCheckedChange(false);
      onNextSubtitle();
    }
  };

  const handleMicToggle = () => {
    if (!isSTTSupported()) {
      onToast('현재 브라우저는 음성 인식을 지원하지 않습니다. (Chrome/Edge/Safari 권장)', 'warn');
      return;
    }

    if (getSTTListeningState()) {
      stopSTT();
      setSttListening(false);
      return;
    }

    onPauseVideo();
    setSttListening(true);

    startSTT(
      (interim) => {
        onChangeInput(interim);
      },
      (finalText) => {
        onChangeInput(finalText);
        setSttListening(false);
        runGrade(finalText);
      },
      (errMessage) => {
        setSttListening(false);
        onToast(errMessage, 'error');
      },
      () => {
        setSttListening(false);
      },
    );
  };

  const handleAIExplain = async () => {
    if (!activeSubtitle?.text_en || aiLoading) return;
    setAiLoading(true);
    setAiExplanation('AI가 문장을 분석하고 있습니다...');
    try {
      const res = await getAIExplanation(activeSubtitle.text_en);
      if (res.success && res.explanation) {
        setAiExplanation(res.explanation);
      } else {
        setAiExplanation(res.error || 'AI 응답을 가져오는 데 실패했습니다.');
      }
    } catch {
      setAiExplanation('AI 응답을 가져오는 데 실패했습니다.');
    } finally {
      setAiLoading(false);
    }
  };

  const scoreTone =
    score === null
      ? ''
      : score >= 90
        ? 'bg-good/10 border-good/30 text-good'
        : score >= 70
          ? 'bg-accent/10 border-accent/30 text-accent'
          : score >= 50
            ? 'bg-warn/10 border-warn/30 text-warn'
            : 'bg-danger/10 border-danger/30 text-danger';

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="rounded-2xl bg-surface-2/60 border border-line p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">대사 말하기 &amp; 맞추기</h3>
          {activeSubIndex >= 0 && (
            <span className="num font-mono text-[11px] text-ink-3">#{activeSubIndex + 1}</span>
          )}
        </div>

        <label htmlFor="dictation-input" className="block text-xs text-ink-2">
          대사를 듣고 직접 말하거나 타이핑해 보세요
        </label>

        <input
          id="dictation-input"
          ref={inputRef}
          type="text"
          autoComplete="off"
          disabled={activeSubIndex === -1 || dictationChecked}
          value={dictationInput}
          onChange={(e) => onChangeInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handlePrimaryAction();
            }
          }}
          placeholder="타이핑하거나 음성 채점 버튼을 누르세요..."
          className="w-full h-11 px-3.5 rounded-xl bg-canvas border border-line text-sm text-ink placeholder:text-ink-3 outline-none focus:border-accent disabled:opacity-55 transition-colors"
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            id="dictation-check-btn"
            disabled={activeSubIndex === -1}
            onClick={handlePrimaryAction}
            className="h-9 px-3 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            {dictationChecked ? '다음 대사 (Enter)' : '정답 확인'}
          </button>

          <button
            type="button"
            disabled={activeSubIndex === -1}
            onClick={handleMicToggle}
            title="마이크로 말해서 쉐도잉 채점하기"
            className={`inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 ${
              sttListening
                ? 'bg-danger text-white border-danger animate-pulse'
                : 'bg-danger/10 hover:bg-danger/20 border-danger/30 text-danger'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>{sttListening ? '듣는 중...' : '음성 채점'}</span>
          </button>
        </div>
      </div>

      {dictationChecked && activeSubtitle && (
        <div className="rounded-2xl bg-surface-2/60 border border-line p-4 space-y-3.5">
          {score !== null && (
            <div
              className={`flex items-center justify-center gap-2.5 py-2.5 px-3 rounded-xl border ${scoreTone}`}
            >
              <span className="text-xs font-medium text-ink-2">일치율</span>
              <span className="num font-mono text-2xl font-bold leading-none">{score}%</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onReplaySubtitle}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-surface hover:bg-surface-2 border border-line text-[11px] font-medium text-ink-2 hover:text-ink cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>다시 듣기</span>
            </button>

            <button
              type="button"
              onClick={onToggleStar}
              className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border text-[11px] font-medium cursor-pointer ${
                isStarred
                  ? 'bg-warn/15 border-warn/40 text-warn'
                  : 'bg-surface hover:bg-surface-2 border-line text-ink-2 hover:text-ink'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-current' : ''}`} />
              <span>{isStarred ? '보관됨 (A)' : '보관 (A)'}</span>
            </button>

            <button
              type="button"
              disabled={aiLoading}
              onClick={handleAIExplain}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent text-[11px] font-medium cursor-pointer disabled:opacity-50"
            >
              {aiLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>AI 설명</span>
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-canvas border border-line text-[15px] leading-relaxed break-words">
            {diffResult.map((item, idx) => {
              if (item.status === 'correct') {
                return (
                  <span key={idx} className="inline-block mr-1.5 font-semibold text-good">
                    {item.word}
                  </span>
                );
              }
              if (item.status === 'wrong') {
                return (
                  <span
                    key={idx}
                    title={`입력값: ${item.typed || ''}`}
                    className="inline-block mr-1.5 font-medium text-danger underline decoration-danger/45 underline-offset-4"
                  >
                    {item.word}
                  </span>
                );
              }
              if (item.status === 'missing') {
                return (
                  <span
                    key={idx}
                    title="놓친 단어"
                    className="inline-block mr-1.5 text-ink-3 border-b-2 border-dotted border-ink-3"
                  >
                    {item.word}
                  </span>
                );
              }
              return (
                <span key={idx} title="추가된 단어" className="inline-block mr-1.5 text-warn">
                  {item.word}
                </span>
              );
            })}
          </div>

          {activeSubtitle.text_kr && (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                해석
              </span>
              <p className="text-sm text-ink-2 leading-relaxed">{activeSubtitle.text_kr}</p>
            </div>
          )}

          {aiExplanation && (
            <div className="pt-3 border-t border-line space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI 분석</span>
              </div>
              <div className="text-[13px] text-ink leading-relaxed space-y-1">
                {aiExplanation.split('\n').map((line, i) => (
                  <p key={i}>{renderFormattedInline(line)}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
