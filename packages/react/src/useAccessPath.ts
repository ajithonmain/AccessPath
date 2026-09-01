import { useSyncExternalStore } from 'react';
import { getState } from '@accesspath/core';
import type { A11yPrefs, ProfileKey } from '@accesspath/core';

export interface UseAccessPathResult {
  open(): void;
  close(): void;
  reset(): void;
  isOpen: boolean;
  prefs: A11yPrefs;
  /** Empty when no profile is active — more than one can be active at once. */
  activeProfiles: ProfileKey[];
}

export function useAccessPath(storageKey?: string): UseAccessPathResult {
  const state = getState(storageKey);

  useSyncExternalStore(
    (onChange) => state.subscribe(onChange),
    () => state.version
  );

  return {
    open: () => state.open(),
    close: () => state.close(),
    reset: () => state.reset(),
    isOpen: state.isOpen,
    prefs: state.prefs,
    activeProfiles: state.activeProfiles,
  };
}
