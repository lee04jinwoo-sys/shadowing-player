import { useEffect } from 'react';
import type { DictPopoverRequest, SourceMode } from '../types';

interface UseKeyboardShortcutsOptions {
  dictRequest: DictPopoverRequest | null;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  theaterMode: boolean;
  sourceMode: SourceMode;
  activeSubIndexRef: React.MutableRefObject<number>;
  playbackSpeedRef: React.MutableRefObject<number>;
  onCloseDict: () => void;
  onToggleShortcuts: () => void;
  onCloseShortcuts: () => void;
  onCloseSettings: () => void;
  onToggleTheater: () => void;
  onExitTheater: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleABLoop: () => void;
  onToggleBlur: () => void;
  onToggleStar: (idx: number) => void;
  onChangeSpeed: (speed: number) => void;
}

export function useKeyboardShortcuts({
  dictRequest,
  shortcutsOpen,
  settingsOpen,
  theaterMode,
  sourceMode,
  activeSubIndexRef,
  playbackSpeedRef,
  onCloseDict,
  onToggleShortcuts,
  onCloseShortcuts,
  onCloseSettings,
  onToggleTheater,
  onExitTheater,
  onTogglePlay,
  onPrev,
  onNext,
  onToggleABLoop,
  onToggleBlur,
  onToggleStar,
  onChangeSpeed,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName || '';
      const isEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        Boolean(target?.isContentEditable);

      if (e.code === 'Escape') {
        if (dictRequest) {
          onCloseDict();
          return;
        }
        if (shortcutsOpen) {
          onCloseShortcuts();
          return;
        }
        if (settingsOpen) {
          onCloseSettings();
          return;
        }
        if (theaterMode) {
          onExitTheater();
        }
        return;
      }

      if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
        if (isEditable) return;
        e.preventDefault();
        onToggleShortcuts();
        return;
      }

      if (isEditable || settingsOpen || shortcutsOpen) return;

      switch (e.code) {
        case 'Space': {
          if (sourceMode === 'explore') return;
          e.preventDefault();
          onTogglePlay();
          break;
        }
        case 'ArrowLeft': {
          if (sourceMode === 'explore') return;
          e.preventDefault();
          onPrev();
          break;
        }
        case 'ArrowRight': {
          if (sourceMode === 'explore') return;
          e.preventDefault();
          onNext();
          break;
        }
        case 'KeyR': {
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          onToggleABLoop();
          break;
        }
        case 'KeyF': {
          if (e.metaKey || e.ctrlKey || e.altKey || sourceMode === 'explore') return;
          e.preventDefault();
          onToggleTheater();
          break;
        }
        case 'KeyV': {
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          onToggleBlur();
          break;
        }
        case 'KeyA': {
          if (e.metaKey || e.ctrlKey || e.altKey || dictRequest) return;
          e.preventDefault();
          if (activeSubIndexRef.current >= 0) {
            onToggleStar(activeSubIndexRef.current);
          }
          break;
        }
        case 'Minus':
        case 'NumpadSubtract':
        case 'BracketLeft': {
          e.preventDefault();
          onChangeSpeed(playbackSpeedRef.current - 0.1);
          break;
        }
        case 'Equal':
        case 'NumpadAdd':
        case 'BracketRight': {
          e.preventDefault();
          onChangeSpeed(playbackSpeedRef.current + 0.1);
          break;
        }
        default: {
          if (e.key === 'ㄹ' && !e.metaKey && !e.ctrlKey && !e.altKey && sourceMode !== 'explore') {
            e.preventDefault();
            onToggleTheater();
          } else if (
            (e.key === 'ㅁ' || e.key === 'a' || e.key === 'A') &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.altKey &&
            !dictRequest
          ) {
            e.preventDefault();
            if (activeSubIndexRef.current >= 0) {
              onToggleStar(activeSubIndexRef.current);
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    dictRequest,
    shortcutsOpen,
    settingsOpen,
    theaterMode,
    sourceMode,
    activeSubIndexRef,
    playbackSpeedRef,
    onCloseDict,
    onToggleShortcuts,
    onCloseShortcuts,
    onCloseSettings,
    onToggleTheater,
    onExitTheater,
    onTogglePlay,
    onPrev,
    onNext,
    onToggleABLoop,
    onToggleBlur,
    onToggleStar,
    onChangeSpeed,
  ]);
}
