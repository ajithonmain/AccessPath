export interface TriggerPos {
  x: number;
  y: number;
}

const KEY_SUFFIX = '-trigger-pos';

/** Separate from AccessPathState/A11yPrefs on purpose — a dragged trigger position is a
 *  UI/layout concern, not a content-affecting accessibility preference. */
export function saveTriggerPosition(storageKey: string, pos: TriggerPos): void {
  localStorage.setItem(storageKey + KEY_SUFFIX, JSON.stringify(pos));
}

export function loadTriggerPosition(storageKey: string): TriggerPos | null {
  try {
    const raw = localStorage.getItem(storageKey + KEY_SUFFIX);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
    return null;
  } catch {
    return null;
  }
}
