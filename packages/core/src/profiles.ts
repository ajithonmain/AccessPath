import { A11yPrefs, ProfileKey } from './types';

export const DEFAULT_PREFS: A11yPrefs = {
  fontSizeLevel:  0,
  reduceMotion:   false,
  contrastLevel:  0,
  spacingLevel:   0,
  lineHeightLevel: 0,
  dyslexia:       false,
  saturationLevel: 0,
  invertColors:   false,
  highlightLinks: false,
  hideImages:     false,
  bigCursor:      false,
  cursorColor:    'black',
  textAlign:      'default',
  dictionaryEnabled: false,
  voiceOver:         false,
  voiceRateLevel:    50,
  voicePitchLevel:   50,
  voiceURI:          null,
  showTooltips:      false,
  readingGuide:      false,
  highlightTitles: false,
  highlightHover:  false,
  highlightFocus:  false,
  monochrome:      false,
  muteSounds:      false,
  colorBlindSim:   'none',
  bgColor:    null,
  textColor:  null,
  titleColor: null,
  contrastMode: 'default',
};

/** Standardized on 'accesspath-prefs' (matches the embed script's own default) so a site
 *  switching between the embed script and a framework wrapper doesn't silently lose visitor
 *  prefs saved under the other wrapper's key. AccessPathState.load() migrates a visitor's
 *  existing 'a11y-prefs' save (the old default, still used by Angular's own @Input default
 *  for backward compatibility with existing installs) forward under this key the first time
 *  they load with no data under the new key. */
export const DEFAULT_STORAGE_KEY = 'accesspath-prefs';

/** The pre-unification default storageKey (see DEFAULT_STORAGE_KEY above) — kept as a named
 *  constant purely so AccessPathState.load()'s one-time migration doesn't hardcode the old
 *  string in two places. */
export const LEGACY_STORAGE_KEY = 'a11y-prefs';

export const PROFILES: Record<ProfileKey, Partial<A11yPrefs>> = {
  'low-vision': { fontSizeLevel: 80, reduceMotion: true, saturationLevel: 100 },
  'dyslexia':   { dyslexia: true, spacingLevel: 60, lineHeightLevel: 60 },
  // muteSounds is part of the same "suppress unexpected sensory events" pitch as
  // reduceMotion/desaturation above — autoplaying audio firing without warning is a
  // startle hazard in the same category as autoplaying motion/flashing, even though
  // seizures themselves are photosensitive-triggered, not sound-triggered. Harmless
  // to bundle: it's a no-op unless a page was already about to autoplay sound.
  'seizure':    { reduceMotion: true, saturationLevel: -65, muteSounds: true },
  'motor':      { fontSizeLevel: 40, reduceMotion: true },
  /** Intentionally empty — the Color Blind card no longer applies a generic preset bundle
   *  on click (see the note above its createProfileCard() call in panel-dom.ts). Its whole
   *  effect is the simulation-type dropdown attached to the card (colorBlindSim), so
   *  clicking it just opens/closes that menu. Kept as a key (rather than removed from
   *  PROFILES entirely) so 'colorblind' stays a valid ProfileKey for PROFILE_LABELS/
   *  PROFILE_COLORS and Object.keys(PROFILES) in panel-dom.ts still yields all 9 cards. */
  'colorblind': {},
  // readingGuide dims everything except a band around the cursor — helps hold a place
  // while reading, which is exactly the "reduce clutter, stay focused" pitch this profile
  // already makes. Only meaningful for mouse users (it follows mousemove — see
  // reading-guide.ts); a harmless no-op on touch/keyboard-only, not a broken toggle.
  'adhd':       { reduceMotion: true, spacingLevel: 60, readingGuide: true },
  /** AccessPath is not and cannot be a screen reader (real blind users run JAWS/NVDA/
   *  VoiceOver at the OS level — see a11y-scanner.ts's note on not overclaiming). This
   *  profile does the one thing a widget genuinely can: read the whole page aloud
   *  sequentially. Deliberately no font-size/cursor bump — meaningless with no vision. */
  'voice-over': { voiceOver: true },
  // contrastLevel is 100, not some lower number, because contrastMode: 'high' means
  // contrastLevel: 100 everywhere else (see AccessPathState.setContrastMode()) — the
  // segmented Vision > Contrast control would otherwise show "High" selected while the
  // actual level was something else, since applying a profile bundle via Object.assign
  // bypasses setContrastMode()'s own bundling logic.
  'elderly':    { fontSizeLevel: 60, lineHeightLevel: 40, bigCursor: true, contrastMode: 'high', contrastLevel: 100 },
  'cognitive':  { reduceMotion: true, spacingLevel: 40, lineHeightLevel: 40, highlightFocus: true },
};

export const PROFILE_LABELS: Record<ProfileKey, string> = {
  'low-vision': 'Low Vision',
  'dyslexia':   'Dyslexia',
  'seizure':    'Seizure Safe',
  'motor':      'Motor Impaired',
  'colorblind': 'Color Blind',
  'adhd':       'ADHD',
  'voice-over': 'Voice Over',
  'elderly':    'Elderly',
  'cognitive':  'Cognitive & Learning',
};

/** Brand profile-accent colors (docs/brand.md sec 4) — accent for icon/label,
 *  soft for the card's tinted background when active. Kept subtle by design:
 *  profile colors should never turn the widget into a rainbow interface. */
export const PROFILE_COLORS: Record<ProfileKey, { accent: string; soft: string }> = {
  'low-vision': { accent: '#6B55F2', soft: '#F0EDFF' },
  'dyslexia':   { accent: '#E86672', soft: '#FFF0F2' },
  'seizure':    { accent: '#F4A90A', soft: '#FFF6DF' },
  'motor':      { accent: '#39B77A', soft: '#EAF8F0' },
  'colorblind': { accent: '#6D8FE8', soft: '#EEF3FF' },
  'adhd':       { accent: '#D94D8B', soft: '#FCECF4' },
  // Was flat gray (#4A4A4A/#F1F1F1) — the only desaturated entry among 9 otherwise
  // distinct hues, which read as "disabled/inactive" rather than a real profile
  // color. Cyan/sky-blue sits in the largest open gap between the other 8 accents
  // (teal ~175° and periwinkle blue ~227°) and reads naturally as "audio/speech".
  'voice-over': { accent: '#1FA6D6', soft: '#E7F6FC' },
  'elderly':    { accent: '#C97A2B', soft: '#FBF0E4' },
  'cognitive':  { accent: '#3FA7A0', soft: '#E9F7F6' },
};
