import { describe, it, expect, afterEach, vi } from 'vitest';
import { getSavedTheme, saveTheme } from '../storage';

describe('getSavedTheme default', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  const stubScheme = (dark: boolean) =>
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: dark && q.includes('dark') }));

  it('follows the OS dark preference when nothing is saved', () => {
    stubScheme(true);
    expect(getSavedTheme()).toBe('dark');
  });

  it('falls back to light when the OS prefers light or matchMedia is missing', () => {
    stubScheme(false);
    expect(getSavedTheme()).toBe('light');
    vi.stubGlobal('matchMedia', undefined);
    expect(getSavedTheme()).toBe('light');
  });

  it('keeps an explicit saved choice over the OS preference', () => {
    stubScheme(true);
    saveTheme('light');
    expect(getSavedTheme()).toBe('light');
    saveTheme('dark');
    stubScheme(false);
    expect(getSavedTheme()).toBe('dark');
  });

  it('ignores a theme saved before the paper-palette overhaul (one-time reset)', () => {
    stubScheme(false);
    localStorage.setItem('shadowing_theme', 'dark'); // 개편 전 저장값: 리비전 마커 없음
    expect(getSavedTheme()).toBe('light');
    saveTheme('dark');
    expect(getSavedTheme()).toBe('dark');
  });
});
