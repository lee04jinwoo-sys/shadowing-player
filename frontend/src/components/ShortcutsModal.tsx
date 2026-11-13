import React from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const KEY_CAP_CLASS =
  'inline-flex items-center justify-center min-w-[26px] h-6 px-2 rounded-md bg-surface-2 border border-line-strong font-mono text-[11px] font-semibold text-ink shadow-2xs';

interface ShortcutRow {
  keys: string[];
  description: string;
}

const PLAYBACK_SHORTCUTS: ShortcutRow[] = [
  { keys: ['Space'], description: '영상 재생 / 일시정지' },
  { keys: ['←'], description: '현재 문장 처음 / 이전 자막으로 이동' },
  { keys: ['→'], description: '다음 자막으로 이동 (말하기 모드: 짧은 추임새 건너뜀)' },
  { keys: ['R'], description: '현재 자막 구간 반복 (A-B Loop) 켜기 / 끄기' },
  { keys: ['F', 'ㄹ'], description: '극장 모드 (전체 화면 집중 뷰) 전환' },
  { keys: ['[', '-'], description: '재생 속도 0.1배속 느리게' },
  { keys: [']', '+'], description: '재생 속도 0.1배속 빠르게' },
];

const STUDY_SHORTCUTS: ShortcutRow[] = [
  { keys: ['A', 'ㅁ'], description: '사전 팝오버 열림: Anki 보관 / 닫힘: 현재 문장 별표 토글' },
  { keys: ['V'], description: '리스닝 자막 블러 (가림 / 보임) 전환' },
  { keys: ['Enter'], description: '말하기(받아쓰기) 정답 채점 또는 다음 문장 이동' },
  { keys: ['?'], description: '단축키 안내 창 열기 / 닫기' },
  { keys: ['Esc'], description: '사전 팝오버 / 설정 모달 / 극장 모드 닫기' },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="단축키 및 사용법 안내"
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-surface border border-line-strong shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-surface-2/60">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Keyboard className="w-4 h-4 text-accent" />
            <span>단축키 및 사용법 안내</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="안내 닫기"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-xs">
          {/* Category 1 */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              재생 및 구간 제어
            </h3>
            <div className="rounded-xl bg-canvas border border-line divide-y divide-line">
              {PLAYBACK_SHORTCUTS.map((row) => (
                <div
                  key={row.description}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                >
                  <span className="text-ink-2">{row.description}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {row.keys.map((k, idx) => (
                      <React.Fragment key={k}>
                        {idx > 0 && <span className="text-ink-3 text-[10px]">/</span>}
                        <kbd className={KEY_CAP_CLASS}>{k}</kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Category 2 */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              학습 및 Anki 보관
            </h3>
            <div className="rounded-xl bg-canvas border border-line divide-y divide-line">
              {STUDY_SHORTCUTS.map((row) => (
                <div
                  key={row.description}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                >
                  <span className="text-ink-2">{row.description}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {row.keys.map((k, idx) => (
                      <React.Fragment key={k}>
                        {idx > 0 && <span className="text-ink-3 text-[10px]">/</span>}
                        <kbd className={KEY_CAP_CLASS}>{k}</kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Category 3 */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              단어 &amp; 숙어 사전 활용 팁
            </h3>
            <div className="rounded-xl bg-canvas border border-line px-3.5 py-3 space-y-2 text-ink-2 leading-relaxed">
              <p>
                <strong className="text-ink font-medium">단일 단어 조회:</strong> 자막이나 영상 하단 영어 단어를 클릭하면 AI 문맥 뜻과 발음기호를 즉시 조회합니다.
              </p>
              <p>
                <strong className="text-ink font-medium">연속 숙어 / 구문 선택:</strong> 시작 단어를 클릭한 뒤 <kbd className={KEY_CAP_CLASS}>Shift</kbd>를 누른 채 끝 단어를 클릭하거나, 마우스로 구문을 드래그하세요.
              </p>
              <p>
                <strong className="text-ink font-medium">인라인 편집 &amp; 원클릭 보관:</strong> 팝오버 안의 뜻/예문을 직접 수정하고 <kbd className={KEY_CAP_CLASS}>A</kbd>를 누르면 Anki 카드 생성과 동시에 로컬에 보관됩니다.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
