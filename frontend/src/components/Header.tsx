import React from 'react';
import {
  Captions,
  Compass,
  FolderOpen,
  Keyboard,
  Moon,
  PlayCircle,
  RefreshCw,
  Settings,
  Sun,
} from 'lucide-react';
import type { AnkiStatus, SourceMode, ThemeMode } from '../types';

interface HeaderProps {
  sourceMode: SourceMode;
  onChangeSource: (mode: SourceMode) => void;
  activeTitle?: string;
  ankiStatus: AnkiStatus;
  ankiChecking: boolean;
  onRecheckAnki: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

const ANKI_STATUS_INFO: Record<string, { label: string; title: string }> = {
  ok: {
    label: 'Anki 연결됨',
    title: '오라클 서버의 Anki Manager에 연결되어 있습니다',
  },
  gateway_unreachable: {
    label: '터널 끊김',
    title: '오라클 서버로 가는 SSH 터널(localhost:8011)에 연결할 수 없습니다. infra/anki_tunnel을 확인하세요',
  },
  anki_down: {
    label: '서버 Anki 꺼짐',
    title: 'Anki Manager는 응답하지만 서버의 Anki(AnkiConnect)가 응답하지 않습니다',
  },
  player_down: {
    label: 'Anki 확인 실패',
    title: 'Shadowing Player 서버에 연결할 수 없습니다',
  },
};

export const Header: React.FC<HeaderProps> = ({
  sourceMode,
  onChangeSource,
  activeTitle,
  ankiStatus,
  ankiChecking,
  onRecheckAnki,
  onOpenShortcuts,
  onOpenSettings,
  theme,
  onToggleTheme,
}) => {
  const statusInfo = ANKI_STATUS_INFO[ankiStatus.reason] ?? ANKI_STATUS_INFO.gateway_unreachable;

  const dotClass = ankiStatus.connected
    ? 'bg-good'
    : ankiStatus.reason === 'anki_down'
      ? 'bg-warn'
      : 'bg-danger';

  const sourceTabs: { id: SourceMode; label: string; icon: React.ReactNode; title: string }[] = [
    { id: 'local', label: '로컬', icon: <FolderOpen className="w-3.5 h-3.5" />, title: '로컬 영상' },
    { id: 'youtube', label: 'YouTube', icon: <PlayCircle className="w-3.5 h-3.5" />, title: '유튜브 섀도잉 플레이어' },
    { id: 'explore', label: '탐색', icon: <Compass className="w-3.5 h-3.5" />, title: '유튜브 영상 탐색 및 추천' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-xl">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6 py-2.5 md:h-14 md:py-0">
        {/* Left: Brand & Active Media */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-canvas">
            <Captions className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-[15px] font-bold tracking-tight text-ink whitespace-nowrap">
              Shadowing Player
            </h1>
            {activeTitle && (
              <span
                title={activeTitle}
                className="hidden xl:inline-flex items-center max-w-[220px] truncate rounded-full bg-surface-2 border border-line px-2.5 py-0.5 text-[11px] font-medium text-ink-2"
              >
                {activeTitle}
              </span>
            )}
          </div>
        </div>

        {/* Center: 3-Way Source Switcher */}
        <nav
          aria-label="영상 소스 전환"
          className="inline-flex items-center justify-self-start md:justify-self-center rounded-xl bg-surface-2 border border-line p-1 gap-0.5"
        >
          {sourceTabs.map((tab) => {
            const active = sourceMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                title={tab.title}
                onClick={() => onChangeSource(tab.id)}
                className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-surface text-ink border border-line-strong shadow-xs'
                    : 'text-ink-3 hover:text-ink border border-transparent'
                }`}
              >
                <span className={active ? 'text-accent' : ''}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Utilities & Theme */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onRecheckAnki}
            title={statusInfo.title}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-surface hover:bg-surface-2 border border-line text-xs font-medium text-ink-2 hover:text-ink transition-colors whitespace-nowrap cursor-pointer"
          >
            <span className={`w-2 h-2 rounded-full ${dotClass} shrink-0`} />
            <RefreshCw className={`w-3.5 h-3.5 text-ink-3 ${ankiChecking ? 'animate-spin' : ''}`} />
            <span>{ankiChecking ? '확인 중...' : statusInfo.label}</span>
          </button>

          <button
            type="button"
            onClick={onOpenShortcuts}
            title="단축키 안내 (?)"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-surface hover:bg-surface-2 border border-line text-xs font-medium text-ink-2 hover:text-ink transition-colors whitespace-nowrap cursor-pointer"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">단축키</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            title="API 키 및 저장 경로 설정"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-surface hover:bg-surface-2 border border-line text-xs font-medium text-ink-2 hover:text-ink transition-colors whitespace-nowrap cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">설정</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="테마 전환"
            title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            className="grid h-8 w-8 place-items-center rounded-xl bg-surface hover:bg-surface-2 border border-line text-ink-2 hover:text-ink transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-warn" />
            ) : (
              <Moon className="w-4 h-4 text-accent" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
