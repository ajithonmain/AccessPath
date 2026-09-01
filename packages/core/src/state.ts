import { A11yPrefs, ProfileKey } from './types';
import { DEFAULT_PREFS, DEFAULT_STORAGE_KEY, LEGACY_STORAGE_KEY, PROFILES } from './profiles';
import { prefersReducedMotion } from './reduced-motion';
import { loadPanelSide, savePanelSide, PanelSide } from './panel-side';

export type Listener = () => void;

interface PersistedShape {
  prefs?: Partial<A11yPrefs>;
  /** profiles (plural) is the current shape — profile (singular) is read as a
   *  fallback so a visitor's pre-multi-select saved choice migrates forward instead
   *  of silently resetting. Never written anymore, only read. */
  profiles?: ProfileKey[];
  profile?: ProfileKey;
}

/** Owns prefs, activeProfiles, isOpen, persistence, and change notification.
 *  Every wrapper (embed/react/angular) delegates to an instance of this instead of
 *  keeping its own copy of the logic — see registry.ts for how instances are shared. */
export class AccessPathState {
  prefs: A11yPrefs = { ...DEFAULT_PREFS };
  /** Empty = no profile active. More than one profile can be active at once — see
   *  applyProfile() for how their overrides combine. */
  activeProfiles: ProfileKey[] = [];
  isOpen = false;
  /** Which viewport edge the drawer slides in from. Not part of A11yPrefs — see
   *  panel-side.ts. createPanel({ side }) seeds this once on first-ever load (see
   *  panel-dom.ts); after that, setSide() and its persisted value are authoritative. */
  side: PanelSide = 'right';
  /** Bumped on every change — lets consumers (e.g. React's useSyncExternalStore) detect
   *  updates without needing prefs/activeProfiles to change identity (they mutate in place). */
  version = 0;

  private listeners = new Set<Listener>();

  constructor(readonly storageKey: string = DEFAULT_STORAGE_KEY) {
    this.load();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  open(): void {
    this.isOpen = true;
    this.notify();
  }

  close(): void {
    this.isOpen = false;
    this.notify();
  }

  toggle(
    prop:
      | 'reduceMotion'
      | 'dyslexia'
      | 'invertColors'
      | 'highlightLinks'
      | 'hideImages'
      | 'bigCursor'
      | 'dictionaryEnabled'
      | 'voiceOver'
      | 'showTooltips'
      | 'readingGuide'
      | 'highlightTitles'
      | 'highlightHover'
      | 'highlightFocus'
      | 'monochrome'
      | 'muteSounds'
  ): void {
    this.prefs[prop] = !this.prefs[prop];
    this.saveAndNotify();
  }

  setTextAlign(val: A11yPrefs['textAlign']): void {
    this.prefs.textAlign = val;
    this.saveAndNotify();
  }

  setCursorColor(val: A11yPrefs['cursorColor']): void {
    this.prefs.cursorColor = val;
    this.saveAndNotify();
  }

  private setLevel(
    prop: 'contrastLevel' | 'spacingLevel' | 'lineHeightLevel' | 'fontSizeLevel' | 'voiceRateLevel' | 'voicePitchLevel',
    val: number
  ): void {
    this.prefs[prop] = Math.max(0, Math.min(100, Math.round(val)));
    this.saveAndNotify();
  }

  setFontSizeLevel(val: number): void {
    this.setLevel('fontSizeLevel', val);
  }

  setContrastLevel(val: number): void {
    this.setLevel('contrastLevel', val);
  }

  setSpacingLevel(val: number): void {
    this.setLevel('spacingLevel', val);
  }

  setLineHeightLevel(val: number): void {
    this.setLevel('lineHeightLevel', val);
  }

  setVoiceRateLevel(val: number): void {
    this.setLevel('voiceRateLevel', val);
  }

  setVoicePitchLevel(val: number): void {
    this.setLevel('voicePitchLevel', val);
  }

  setVoiceURI(val: string | null): void {
    this.prefs.voiceURI = val;
    this.saveAndNotify();
  }

  /** -100 to 100, unlike the other levels (0-100) — see A11yPrefs['saturationLevel']. */
  setSaturationLevel(val: number): void {
    this.prefs.saturationLevel = Math.max(-100, Math.min(100, Math.round(val)));
    this.saveAndNotify();
  }

  setColorBlindSim(val: A11yPrefs['colorBlindSim']): void {
    this.prefs.colorBlindSim = val;
    this.saveAndNotify();
  }

  setBgColor(val: string | null): void {
    this.prefs.bgColor = val;
    this.saveAndNotify();
  }

  setTextColor(val: string | null): void {
    this.prefs.textColor = val;
    this.saveAndNotify();
  }

  setTitleColor(val: string | null): void {
    this.prefs.titleColor = val;
    this.saveAndNotify();
  }

  /** 'light'/'dark'/'high'/'default' are canned bgColor/textColor/contrastLevel
   *  bundles — pure data, no DOM access needed. 'smart' only records the mode here;
   *  the caller (panel-dom.ts) must also call setBgColor()/setTextColor() with a
   *  result from smart-contrast.ts's live computed-style read, since this class is
   *  otherwise entirely DOM-agnostic. */
  setContrastMode(mode: A11yPrefs['contrastMode']): void {
    this.prefs.contrastMode = mode;
    if (mode === 'light') {
      this.prefs.bgColor = '#ffffff';
      this.prefs.textColor = '#111111';
      this.prefs.contrastLevel = 0;
    } else if (mode === 'dark') {
      this.prefs.bgColor = '#0b0b0f';
      this.prefs.textColor = '#f5f5f7';
      this.prefs.contrastLevel = 0;
    } else if (mode === 'high') {
      this.prefs.bgColor = null;
      this.prefs.textColor = null;
      this.prefs.contrastLevel = 100;
    } else if (mode === 'default') {
      this.prefs.bgColor = null;
      this.prefs.textColor = null;
      this.prefs.contrastLevel = 0;
    }
    this.saveAndNotify();
  }

  /** Toggles `profile` in/out of the active set — multiple profiles can be active at
   *  once, their overrides merged in selection order. Booleans naturally OR together
   *  (every profile-set boolean is always `true`, never explicitly `false`, so a later
   *  profile that doesn't mention a field can't un-set it). Numeric fields that
   *  genuinely conflict between two active profiles (e.g. saturationLevel: Low Vision
   *  wants +100, Seizure Safe wants -65) resolve to whichever was toggled on most
   *  recently, since it's applied last.
   *
   *  Deliberately does NOT reset `prefs` to DEFAULT_PREFS first — that used to wipe out
   *  any manual adjustment the user made before touching a profile (e.g. drag Text Size
   *  to 70, then tap a profile pill, and the 70 silently reverted to 0). Activating a
   *  profile now layers its bundle on top of whatever prefs already exist; deactivating
   *  one restores each of its keys to the DEFAULT_PREFS value, unless another still-active
   *  profile also sets that key, in which case that profile's value wins (re-applied in
   *  activeProfiles order, so the most-recently-activated one wins on conflicts, same as
   *  before). Manual adjustments made while a profile is active are left alone — the
   *  profile's pill stays lit even if the user has since diverged from its exact bundle;
   *  this class does not try to detect or auto-clear that divergence. */
  applyProfile(profile: ProfileKey): void {
    const idx = this.activeProfiles.indexOf(profile);
    if (idx === -1) {
      this.activeProfiles.push(profile);
      Object.assign(this.prefs, PROFILES[profile]);
    } else {
      this.activeProfiles.splice(idx, 1);
      const removedBundle = PROFILES[profile];
      for (const key of Object.keys(removedBundle) as (keyof A11yPrefs)[]) {
        (this.prefs as any)[key] = DEFAULT_PREFS[key];
      }
      for (const stillActive of this.activeProfiles) {
        Object.assign(this.prefs, PROFILES[stillActive]);
      }
    }
    this.saveAndNotify();
  }

  reset(): void {
    this.prefs = { ...DEFAULT_PREFS };
    this.activeProfiles = [];
    localStorage.removeItem(this.storageKey);
    this.notify();
  }

  private load(): void {
    let raw = localStorage.getItem(this.storageKey);
    // One-time migration: a visitor with existing prefs saved under the pre-unification
    // default key ('a11y-prefs', still Angular's own @Input default for backward
    // compatibility with existing installs) would otherwise lose them the moment a site
    // switches from Angular to the embed script or vice versa, since embed always used
    // 'accesspath-prefs'. Only migrates when this instance is itself using the current
    // default and nothing is saved under it yet — a host that passed a custom storageKey
    // is never touched by this.
    if (!raw && this.storageKey === DEFAULT_STORAGE_KEY) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(DEFAULT_STORAGE_KEY, legacy);
        raw = legacy;
      }
    }
    let saved: PersistedShape = {};
    try {
      saved = JSON.parse(raw || '{}');
    } catch {
      saved = {};
    }
    if (saved.prefs) {
      this.prefs = { ...DEFAULT_PREFS, ...saved.prefs };
    } else if (prefersReducedMotion()) {
      this.prefs = { ...DEFAULT_PREFS, reduceMotion: true };
    }
    const savedProfiles = saved.profiles ?? (saved.profile ? [saved.profile] : []);
    // 'colorblind' is filtered out here even though it's still a valid ProfileKey/PROFILES
    // entry (see the empty-bundle comment in profiles.ts) — its card no longer applies a
    // preset on click, only the colorBlindSim dropdown, so a legacy save with 'colorblind'
    // in its profiles list would otherwise leave that profile's now-removed saturate/
    // contrast/spacing bundle stuck in saved.prefs forever (same class of problem the old
    // 'blind' -> 'voice-over' rename handles below). The card's own "active" look is driven
    // by colorBlindSim, not activeProfiles, so dropping it here doesn't affect the UI.
    this.activeProfiles = savedProfiles.filter((k) => k in PROFILES && k !== 'colorblind');
    // A saved profile whose key no longer exists (e.g. the old 'blind' profile, renamed
    // to 'voice-over') would otherwise leave its baked-in prefs stuck in saved.prefs
    // forever, since prefs are persisted flat, not recomputed from the profile list on
    // load. Rebuild prefs from the surviving profiles when we dropped any.
    if (this.activeProfiles.length !== savedProfiles.length) {
      this.prefs = { ...DEFAULT_PREFS };
      for (const key of this.activeProfiles) Object.assign(this.prefs, PROFILES[key]);
    }
    this.side = loadPanelSide(this.storageKey) ?? 'right';
  }

  /** Only called by createPanel({ side }) as a first-mount seed when no persisted
   *  value exists yet — see panel-dom.ts. Doesn't override a user's own saved choice. */
  seedSideIfUnset(side: PanelSide): void {
    if (loadPanelSide(this.storageKey) === null) this.setSide(side);
  }

  setSide(side: PanelSide): void {
    this.side = side;
    savePanelSide(this.storageKey, side);
    this.notify();
  }

  private saveAndNotify(): void {
    localStorage.setItem(
      this.storageKey,
      JSON.stringify({ prefs: this.prefs, profiles: this.activeProfiles })
    );
    this.notify();
  }

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}
