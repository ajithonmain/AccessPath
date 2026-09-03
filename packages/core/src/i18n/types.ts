import { ProfileKey } from '../types';

/** Every user-visible string in the panel, grouped to mirror the drawer's own section
 *  structure (see panel-dom.ts) so a translator can find a string by where it appears.
 *  Interpolated strings are functions, not templates with placeholder tokens, so
 *  pluralization/formatting stays type-checked rather than string-replace-based. */
export interface Labels {
  header: {
    title: string;
    shortcutSuffix: (shortcut: string) => string;
    closeAria: string;
    dialogAria: string;
    themeToggle: { toDark: string; toLight: string };
    sideToggle: { toLeft: string; toRight: string };
  };
  profiles: {
    title: string;
    hint: string;
    reset: string;
    applyAria: (profileName: string) => string;
    names: Record<ProfileKey, string>;
  };
  quick: {
    title: string;
    hint: string;
    textSize: { label: string; aria: string };
    contrast: { label: string; aria: string };
    spacing: { label: string; aria: string };
    lineHeight: { label: string; aria: string };
    saturation: { label: string; aria: string };
    pauseAnimations: { label: string; aria: string };
  };
  vision: {
    title: string;
    desc: string;
    invertColors: { label: string; aria: string; hint: string };
    monochrome: { label: string; aria: string; hint: string };
    colorBlindSim: {
      label: string;
      none: string;
      protanopia: string;
      deuteranopia: string;
      tritanopia: string;
      achromatopsia: string;
    };
    contrastMode: { label: string; default: string; light: string; dark: string; high: string; smart: string };
  };
  content: {
    title: string;
    desc: string;
    dyslexia: { label: string; aria: string; hint: string };
    tooltips: { label: string; aria: string; hint: string };
    bgColor: { label: string };
    textColor: { label: string };
    titleColor: { label: string };
    colorDefault: string;
  };
  motion: {
    title: string;
    desc: string;
    pauseAnimations: { label: string; aria: string; hint: string };
    muteSounds: { label: string; aria: string; hint: string };
  };
  reading: {
    title: string;
    desc: string;
    speechBlocked: string;
    speechBrave: string;
    speechNoVoice: string;
    readAloud: { label: string; stopLabel: string; aria: string; hintSupported: string; hintUnsupported: string };
    voiceOver: {
      label: string; aria: string; hint: string;
      play: string; pause: string; restart: string; stop: string;
      nav: string; roleLink: string; roleButton: string; roleField: string;
      rate: { label: string; aria: string };
      pitch: { label: string; aria: string };
      voice: { label: string; aria: string; default: string };
    };
    highlightLinks: { label: string; aria: string; hint: string };
    highlightTitles: { label: string; aria: string; hint: string };
    highlightHover: { label: string; aria: string; hint: string };
    highlightFocus: { label: string; aria: string; hint: string };
    hideImages: { label: string; aria: string; hint: string };
    bigCursor: { label: string; aria: string; hint: string };
    cursorColor: { label: string; black: string; white: string };
    textAlign: { label: string; default: string; left: string; center: string; right: string };
    dictionary: {
      label: string;
      aria: string;
      hint: string;
      activeHint: string;
      lookingUp: string;
      noDefinition: string;
      timedOut: string;
    };
    virtualKeyboard: { label: string; aria: string };
  };
  navigation: {
    title: string;
    desc: string;
    noHeadings: string;
    jumpToHeading: (headingText: string) => string;
    readingGuide: { label: string; aria: string; hint: string };
  };
  allControlsTitle: string;
  actions: { title: string; hint: string };
  audit: {
    title: string;
    hint: string;
    scanButton: string;
    /** Shown briefly in-panel while the report tab opens and the scan runs there —
     *  the live per-check progress itself renders in that tab, not here (see
     *  report-page.ts). */
    scanning: string;
    idleHint: string;
    summary: (failCount: number, passCount: number, notApplicableCount: number) => string;
    scanFailed: string;
    checkedCount: (n: number) => string;
  };
  activeBand: {
    clearAll: string;
    count: (n: number) => string;
    removeAria: (adjustmentLabel: string) => string;
    textSize: (level: number) => string;
    contrast: (level: number) => string;
    saturation: (level: number) => string;
    spacing: (level: number) => string;
    lineHeight: (level: number) => string;
    invertColors: string;
    dyslexia: string;
    pauseAnimations: string;
    highlightLinks: string;
    hideImages: string;
    bigCursor: string;
    textAlign: (align: string) => string;
    dictionary: string;
    tooltips: string;
    readingGuide: string;
    highlightTitles: string;
    highlightHover: string;
    highlightFocus: string;
    monochrome: string;
    muteSounds: string;
    voiceOver: string;
    colorBlindSim: (sim: string) => string;
    bgColor: string;
    textColor: string;
    titleColor: string;
    contrastMode: (mode: string) => string;
  };
  footer: { synced: string; reset: string; poweredBy: string; statementLink: string; reportProblem: string };
  statement: { title: string; closeAria: string };
  triggerAria: string;
}

export type LocaleKey = 'en' | 'es' | 'fr' | 'de' | 'pt';
