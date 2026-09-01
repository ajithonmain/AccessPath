import { A11yPrefs, ProfileKey } from './types';
import { syncHeadingScale } from './heading-scale';
import { bigCursorUrlFragment } from './cursor-color';
import { ensureColorBlindFilters } from './colorblind-filters';

/** Toggles the a11y-* effect classes on every element in `targets` — call this with only
 *  your host `container`, never `panel.root`/the trigger button. The panel's own chrome is
 *  deliberately frozen and never self-responds to the prefs it controls (see CLAUDE.md);
 *  passing panel.root here would also re-expose it to `filter`-based effects (saturation,
 *  invert), which visually filter an element's entire rendered subtree regardless of Shadow
 *  DOM boundaries — that was an actual bug before the self-response pattern was removed. */
export function applyClasses(
  targets: HTMLElement[],
  prefs: A11yPrefs,
  // Currently unused inside this function (the one prior use — a 'cb-active' class for the
  // Color Blind profile — was removed as dead code once that profile stopped applying a
  // preset bundle; see profiles.ts). Kept in the signature for API stability with all three
  // wrappers, which already pass state.activeProfiles as this argument.
  activeProfiles: ProfileKey[]
): void {
  for (const target of targets) {
    if (!target) continue;
    target.classList.toggle('a11y-fontsize',   prefs.fontSizeLevel > 0);
    target.style.setProperty('--a11y-fontsize-level', String(prefs.fontSizeLevel));
    syncHeadingScale(target, prefs.fontSizeLevel);
    target.classList.toggle('a11y-no-motion',  prefs.reduceMotion);
    target.classList.toggle('a11y-spacing',    prefs.spacingLevel > 0);
    target.classList.toggle('a11y-lh',         prefs.lineHeightLevel > 0);
    target.classList.toggle('a11y-contrast',   prefs.contrastLevel > 0);
    target.classList.toggle('a11y-dyslexia',   prefs.dyslexia);
    target.classList.toggle('a11y-saturation', prefs.saturationLevel !== 0);
    target.classList.toggle('a11y-invert',     prefs.invertColors);
    target.style.setProperty('--a11y-spacing-level', String(prefs.spacingLevel));
    target.style.setProperty('--a11y-lh-level', String(prefs.lineHeightLevel));
    target.style.setProperty('--a11y-contrast-level', String(prefs.contrastLevel));
    target.style.setProperty('--a11y-saturation-level', String(prefs.saturationLevel));
    target.classList.toggle('a11y-highlight-links', prefs.highlightLinks);
    target.classList.toggle('a11y-hide-images',     prefs.hideImages);
    target.classList.toggle('a11y-big-cursor',      prefs.bigCursor);
    target.style.setProperty('--a11y-cursor-url', bigCursorUrlFragment(prefs.cursorColor));
    target.classList.toggle('a11y-align-left',      prefs.textAlign === 'left');
    target.classList.toggle('a11y-align-center',    prefs.textAlign === 'center');
    target.classList.toggle('a11y-align-right',     prefs.textAlign === 'right');
    target.classList.toggle('a11y-dictionary',      prefs.dictionaryEnabled);
    target.classList.toggle('a11y-tooltips',        prefs.showTooltips);
    target.classList.toggle('a11y-reading-guide',   prefs.readingGuide);
    target.classList.toggle('a11y-highlight-titles', prefs.highlightTitles);
    target.classList.toggle('a11y-highlight-hover',  prefs.highlightHover);
    target.classList.toggle('a11y-highlight-focus',  prefs.highlightFocus);
    target.classList.toggle('a11y-monochrome', prefs.monochrome);
    target.style.setProperty('--a11y-grayscale', prefs.monochrome ? '1' : '0');
    if (prefs.colorBlindSim !== 'none') ensureColorBlindFilters();
    target.classList.toggle('a11y-cb-sim', prefs.colorBlindSim !== 'none');
    target.style.setProperty(
      '--a11y-cb-filter',
      prefs.colorBlindSim === 'none' ? 'saturate(1)' : `url(#ap-cb-${prefs.colorBlindSim})`
    );
    target.classList.toggle('a11y-bg-custom', Boolean(prefs.bgColor));
    target.style.setProperty('--a11y-bg-color', prefs.bgColor ?? '');
    target.classList.toggle('a11y-text-custom', Boolean(prefs.textColor));
    target.style.setProperty('--a11y-text-color', prefs.textColor ?? '');
    target.classList.toggle('a11y-title-custom', Boolean(prefs.titleColor));
    target.style.setProperty('--a11y-title-color', prefs.titleColor ?? '');
  }
}
