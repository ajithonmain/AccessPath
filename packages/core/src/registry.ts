import { AccessPathState } from './state';
import { DEFAULT_STORAGE_KEY } from './profiles';

const instances = new Map<string, AccessPathState>();

/** Returns the shared AccessPathState for a given storageKey, creating it on first call.
 *  Any two consumers (e.g. a React hook and a mounted panel) that pass the same
 *  storageKey automatically share one instance and stay in sync. */
export function getState(storageKey: string = DEFAULT_STORAGE_KEY): AccessPathState {
  let instance = instances.get(storageKey);
  if (!instance) {
    instance = new AccessPathState(storageKey);
    instances.set(storageKey, instance);
  }
  return instance;
}
