import React from 'react';
import {
  Compass,
  FolderOpen,
  Keyboard,
  Monitor,
  Moon,
  PlayCircle,
  RefreshCw,
  Settings,
  Sun,
} from 'lucide-react';
import type { AnkiStatus, SourceMode, ThemeMode, ThemePref } from '../types';

const THEME_TITLES: Record<ThemePref, string> = {
  system: '테마: 시스템 설정 따름 (클릭하면 라이트)',
  light: '테마: 라이트 (클릭하면 다크)',
  dark: '테마: 다크 (클릭하면 시스템 설정)',
};

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
  themePref: ThemePref;
  onCycleTheme: () => void;
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
  ankiStatus,
  ankiChecking,
  onRecheckAnki,
  onOpenShortcuts,
  onOpenSettings,
  theme,
  themePref,
  onCycleTheme,
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

  const pill =
    'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-line bg-card text-xs font-medium text-ink-2 hover:text-ink hover:border-line-strong transition-colors whitespace-nowrap cursor-pointer';

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 py-2 md:h-14 md:py-0">
        {/* Left: Brand & source tabs */}
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span aria-hidden="true" className="text-xl">🎬</span>
            <h1 className="font-serif text-lg font-semibold tracking-tight text-ink whitespace-nowrap">
              Shadowing Player
            </h1>
          </div>

          <nav
            aria-label="영상 소스 전환"
            className="inline-flex items-center rounded-lg bg-surface-3 p-0.5 shrink-0"
          >
            {sourceTabs.map((tab) => {
              const active = sourceMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  title={tab.title}
                  onClick={() => onChangeSource(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-card text-ink font-semibold card-surface'
                      : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right: status pills & utilities */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2">
          <button type="button" onClick={onRecheckAnki} title={statusInfo.title} className={pill}>
            {ankiChecking ? (
              <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
            ) : (
              <span className={`w-2 h-2 rounded-full ${dotClass} shrink-0`} />
            )}
            <span>{ankiChecking ? '확인 중...' : statusInfo.label}</span>
          </button>

          <button
            type="button"
            onClick={onOpenShortcuts}
            title="단축키 안내 (?)"
            className={pill}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">단축키</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            title="API 키 및 저장 경로 설정"
            className={pill}
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">설정</span>
          </button>

          <button
            type="button"
            onClick={onCycleTheme}
            aria-label={`테마 전환 (${THEME_TITLES[themePref]})`}
            title={THEME_TITLES[themePref]}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-card text-ink-2 hover:text-ink hover:border-line-strong transition-colors cursor-pointer"
          >
            {themePref === 'system' ? <Monitor className="w-4 h-4" /> : theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
