import type { ThemeMode, ThemePref } from '../types';

export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** 'system' follows the OS setting; light/dark are explicit choices. */
export function resolveTheme(pref: ThemePref, systemDark: boolean): ThemeMode {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
}

export function nextThemePref(pref: ThemePref): ThemePref {
  return pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
}
