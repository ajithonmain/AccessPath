export interface A11yPrefs {
  /** 0-100 continuous intensity — drives CSS `--a11y-s` (font-size multiplier)
   *  and the JS-driven heading scale (see heading-scale.ts). 0 = normal size,
   *  100 = +100% (double) size. */
  fontSizeLevel:  number;
  reduceMotion:   boolean;
  /** 0-100 continuous intensity — drives CSS `filter: contrast()`. */
  contrastLevel:  number;
  /** 0-100 continuous intensity — drives `letter-spacing`/`word-spacing`. */
  spacingLevel:   number;
  /** 0-100 continuous intensity — drives `line-height`. */
  lineHeightLevel: number;
  dyslexia:       boolean;
  /** -100 to 100 — drives CSS `filter: saturate()`. 0 = unchanged/normal, positive is
   *  more saturated, negative is less (-100 is fully desaturated/grayscale). */
  saturationLevel: number;
  invertColors:   boolean;
  highlightLinks: boolean;
  hideImages:     boolean;
  bigCursor:      boolean;
  /** Which fill the oversized cursor uses — 'black' (white outline) or 'white' (black
   *  outline), whichever stays visible against the page it's used on. Only meaningful
   *  while bigCursor is true. */
  cursorColor:    'black' | 'white';
  textAlign:      'default' | 'left' | 'center' | 'right';
  dictionaryEnabled: boolean;
  /** When true, the whole host page is read aloud sequentially, block by block, via
   *  voice-over.ts (Web Speech API). Unlike the ephemeral "Read Aloud" action this is a
   *  persisted preference — the reader auto-starts on load and drives a floating
   *  play/pause/restart control bar. */
  voiceOver:         boolean;
  /** 0-100, default 50 = normal. Mapped to SpeechSynthesisUtterance.rate as
   *  2 ** ((level - 50) / 50), i.e. 0 -> 0.5x, 50 -> 1x, 100 -> 2x. */
  voiceRateLevel:    number;
  /** 0-100, default 50 = normal. Mapped to SpeechSynthesisUtterance.pitch the same way. */
  voicePitchLevel:   number;
  /** speechSynthesis voiceURI of the chosen voice (accent/language), or null for the
   *  browser default. A URI saved on one device simply falls back to default on another
   *  that doesn't have that voice installed. */
  voiceURI:          string | null;
  showTooltips:      boolean;
  readingGuide:      boolean;
  highlightTitles:   boolean;
  highlightHover:    boolean;
  highlightFocus:    boolean;
  /** Folded into the same combined `filter:` list as saturate/invert/contrast — see
   *  a11y-effects.css's comment on why `filter` can't be split across separate rules. */
  monochrome:        boolean;
  muteSounds:        boolean;
  /** 'none' = no simulation. Others reference an SVG feColorMatrix filter injected by
   *  colorblind-filters.ts (lazily, into the light DOM — never the panel's Shadow DOM). */
  colorBlindSim:     'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';
  /** null = unset/host default. Set via native <input type="color">, applied as CSS
   *  custom properties (apply-classes.ts) rather than a class-per-color scheme. */
  bgColor:    string | null;
  textColor:  string | null;
  titleColor: string | null;
  /** 'light'/'dark'/'high' are canned bgColor/textColor/contrastLevel bundles (see
   *  AccessPathState.setContrastMode); 'smart' additionally needs a live DOM read
   *  (smart-contrast.ts), applied by the caller since AccessPathState itself is
   *  DOM-agnostic. */
  contrastMode: 'default' | 'light' | 'dark' | 'high' | 'smart';
}

export type ProfileKey =
  | 'low-vision'
  | 'dyslexia'
  | 'seizure'
  | 'motor'
  | 'colorblind'
  | 'adhd'
  | 'voice-over'
  | 'elderly'
  | 'cognitive';
