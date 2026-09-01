const KEY_SUFFIX = '-theme';

/** Separate from AccessPathState/A11yPrefs on purpose — the drawer's own light/dark
 *  chrome is a UI concern, not a host-page-affecting accessibility preference. Same
 *  pattern as trigger-position.ts's saved drag position. */
export function saveDarkTheme(storageKey: string, isDark: boolean): void {
  localStorage.setItem(storageKey + KEY_SUFFIX, JSON.stringify(isDark));
}

export function loadDarkTheme(storageKey: string): boolean | null {
  try {
    const raw = localStorage.getItem(storageKey + KEY_SUFFIX);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'boolean' ? parsed : null;
  } catch {
    return null;
  }
}
