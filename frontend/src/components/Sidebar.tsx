import React from 'react';
import { Download, Headphones, Mic } from 'lucide-react';
import type { SidebarMode } from '../types';

interface SidebarProps {
  width: number;
  onStartResize: (e: React.MouseEvent) => void;
  activeMode: SidebarMode;
  onChangeMode: (mode: SidebarMode) => void;
  pendingCount: number;
  children: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  width,
  onStartResize,
  activeMode,
  onChangeMode,
  pendingCount,
  children,
}) => {
  const tabs: { id: SidebarMode; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'listening', label: '리스닝', icon: <Headphones className="w-4 h-4" /> },
    { id: 'dictation', label: '말하기', icon: <Mic className="w-4 h-4" /> },
    {
      id: 'anki',
      label: '추출',
      icon: <Download className="w-4 h-4" />,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
  ];

  return (
    <aside
      style={{ '--sidebar-w': `${width}px` } as React.CSSProperties}
      className="relative flex flex-col bg-surface border-t lg:border-t-0 lg:border-l border-line h-[52vh] min-h-[340px] lg:h-full lg:min-h-0 lg:w-[var(--sidebar-w)] shrink-0 overflow-hidden"
    >
      {/* Desktop resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="사이드바 너비 조절"
        onMouseDown={onStartResize}
        className="hidden lg:block absolute left-0 top-0 bottom-0 w-1.5 z-20 cursor-col-resize hover:bg-accent/35 transition-colors"
      />

      {/* Mode Selector */}
      <div className="border-b border-line px-3 py-2 shrink-0">
        <div className="grid grid-cols-3 rounded-lg bg-surface-2 p-0.5 gap-0.5">
          {tabs.map((tab) => {
            const active = activeMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChangeMode(tab.id)}
                className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-surface-3 text-ink shadow-[0_1px_0_var(--line-strong)_inset]'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                <span className={active ? 'text-accent' : ''}>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="num px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-semibold leading-none">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {children}
    </aside>
  );
};
