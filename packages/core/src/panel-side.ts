export type PanelSide = 'left' | 'right';

const KEY_SUFFIX = '-side';

/** Separate from AccessPathState's own storageKey blob on purpose, same reasoning as
 *  trigger-position.ts — which edge the drawer opens from is a UI/layout concern, not
 *  a content-affecting accessibility preference, so it shouldn't live inside A11yPrefs. */
export function savePanelSide(storageKey: string, side: PanelSide): void {
  localStorage.setItem(storageKey + KEY_SUFFIX, side);
}

export function loadPanelSide(storageKey: string): PanelSide | null {
  const raw = localStorage.getItem(storageKey + KEY_SUFFIX);
  return raw === 'left' || raw === 'right' ? raw : null;
}
