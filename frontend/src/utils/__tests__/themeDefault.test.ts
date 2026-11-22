import { describe, it, expect, afterEach } from 'vitest';
import { getThemePref, saveThemePref } from '../storage';
import { nextThemePref, resolveTheme } from '../theme';

describe('theme preference', () => {
  afterEach(() => localStorage.clear());

  it('follows the system when nothing was chosen', () => {
    expect(getThemePref()).toBe('system');
  });

  it('ignores values saved before this change: they were written on every load, not chosen', () => {
    localStorage.setItem('shadowing_theme', 'dark');
    localStorage.setItem('shadowing_theme_rev', 'paper-1');
    expect(getThemePref()).toBe('system');
    localStorage.setItem('shadowing_theme', 'light');
    localStorage.removeItem('shadowing_theme_rev');
    expect(getThemePref()).toBe('system');
  });

  it('keeps an explicit choice', () => {
    saveThemePref('dark');
    expect(getThemePref()).toBe('dark');
    saveThemePref('light');
    expect(getThemePref()).toBe('light');
  });

  it('choosing system again removes the stored choice', () => {
    saveThemePref('dark');
    saveThemePref('system');
    expect(getThemePref()).toBe('system');
    expect(localStorage.getItem('shadowing_theme')).toBeNull();
  });
});

describe('resolveTheme / nextThemePref', () => {
  it('uses the system setting only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('cycles system -> light -> dark -> system', () => {
    expect(nextThemePref('system')).toBe('light');
    expect(nextThemePref('light')).toBe('dark');
    expect(nextThemePref('dark')).toBe('system');
  });
});
