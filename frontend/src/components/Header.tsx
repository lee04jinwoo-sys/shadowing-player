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
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-xl">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-2.5 px-4 sm:px-5 py-2 md:h-12 md:py-0">
        {/* Left: Brand & Active Media */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/15 border border-accent/25 text-accent">
            <Captions className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-serif text-[15px] font-semibold tracking-tight text-ink whitespace-nowrap">
              Shadowing Player
            </h1>
            {activeTitle && (
              <span
                title={activeTitle}
                className="hidden lg:inline-flex items-center gap-2 max-w-[260px] truncate text-xs font-medium text-ink-3"
              >
                <span aria-hidden="true" className="text-line-strong">/</span>
                <span className="truncate text-ink-2">{activeTitle}</span>
              </span>
            )}
          </div>
        </div>

        {/* Center: 3-Way Source Switcher */}
        <nav
          aria-label="영상 소스 전환"
          className="inline-flex items-center justify-self-start md:justify-self-center rounded-lg bg-surface-2 p-0.5 gap-0.5"
        >
          {sourceTabs.map((tab) => {
            const active = sourceMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                title={tab.title}
                onClick={() => onChangeSource(tab.id)}
                className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-surface-3 text-ink shadow-[0_1px_0_var(--line-strong)_inset]'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                <span className={active ? 'text-accent' : ''}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Utilities & Theme (Borderless Ghost Controls) */}
        <div className="flex items-center justify-end gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={onRecheckAnki}
            title={statusInfo.title}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg hover:bg-surface-2 text-xs font-medium text-ink-2 hover:text-ink transition-colors whitespace-nowrap cursor-pointer"
          >
            {ankiChecking ? (
              <RefreshCw className="w-3 h-3 text-accent animate-spin shrink-0" />
            ) : (
              <span className={`w-2 h-2 rounded-full ${dotClass} shrink-0`} />
            )}
            <span>{ankiChecking ? '확인 중...' : statusInfo.label}</span>
          </button>

          <span aria-hidden="true" className="hidden sm:block h-3.5 w-px bg-line mx-0.5" />

          <button
            type="button"
            onClick={onOpenShortcuts}
            title="단축키 안내 (?)"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg hover:bg-surface-2 text-xs font-medium text-ink-2 hover:text-ink transition-colors whitespace-nowrap cursor-pointer"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">단축키</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            title="API 키 및 저장 경로 설정"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg hover:bg-surface-2 text-xs font-medium text-ink-2 hover:text-ink transition-colors whitespace-nowrap cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">설정</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="테마 전환"
            title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2 text-ink-2 hover:text-ink transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-accent" />
            ) : (
              <Moon className="w-4 h-4 text-accent" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
