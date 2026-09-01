import { ProfileKey } from './types';
import { ACCESSPATH_LOGO_DATA_URI } from './logo';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvg(viewBox: string, innerMarkup: string, attrs: Record<string, string>): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, value);
  svg.innerHTML = innerMarkup;
  return svg;
}

function strokeAttrs(extra: Record<string, string> = {}): Record<string, string> {
  return {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    ...extra,
  };
}

/** Universal-access pictogram (head, arm-bar, running-leg stance) as a solid filled
 *  mark, not stroked line art like the rest of this file — the one icon meant to
 *  read as a bold logotype rather than blend in with the panel's line-icon set (it's
 *  the default trigger icon and the panel's own header glyph). The path's own
 *  viewBox (512x512) is its native coordinate space; unrelated to the 24x24 used
 *  elsewhere in this file — SVG scales to the caller's width/height regardless.
 *  fill is intentionally left off the <path> elements (inherited from the outer
 *  <svg>'s attrs below) so applyIconGradient() in trigger-button.ts can still
 *  override it with the brand gradient. */
export function accessibilityIcon(): SVGElement {
  return createSvg(
    '0 0 512 512',
    '<path d="M448,112c-66.82,17.92-119.55,32-192,32S130.82,129.92,64,112L48,163c48,20.53,96.71,35.16,147.2,53.2L144,496l56.4,16L246,336h20l45.6,176L368,496,316.8,216.2C367.26,199.93,416,183.53,464,164Z"/><path d="M256,112a56,56,0,1,1,56-56A56.06,56.06,0,0,1,256,112Z"/>',
    { fill: 'currentColor' }
  );
}

export function closeIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    strokeAttrs({ width: '18', height: '18', 'stroke-width': '2.5' })
  );
}

export function resetIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    strokeAttrs({ width: '16', height: '16', 'stroke-width': '2' })
  );
}

const PROFILE_ICON_MARKUP: Partial<Record<ProfileKey, string>> = {
  'low-vision': '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  'seizure':    '<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/>',
  'motor':      '<circle cx="18" cy="4" r="2" fill="currentColor" stroke="none"/><path d="m17.836 12.014-4.345.725 3.29-4.113a1 1 0 0 0-.227-1.457l-6-4a.999.999 0 0 0-1.262.125l-4 4 1.414 1.414 3.42-3.42 2.584 1.723-2.681 3.352a5.913 5.913 0 0 0-5.5.752l1.451 1.451A3.972 3.972 0 0 1 8 12c2.206 0 4 1.794 4 4 0 .739-.216 1.425-.566 2.02l1.451 1.451A5.961 5.961 0 0 0 14 16c0-.445-.053-.878-.145-1.295L17 14.181V20h2v-7a.998.998 0 0 0-1.164-.986zM8 20c-2.206 0-4-1.794-4-4 0-.739.216-1.425.566-2.02l-1.451-1.451A5.961 5.961 0 0 0 2 16c0 3.309 2.691 6 6 6 1.294 0 2.49-.416 3.471-1.115l-1.451-1.451A3.972 3.972 0 0 1 8 20z" fill="currentColor" stroke="none"/>',
  'colorblind': '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/><line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" stroke-width="1.8"/>',
  'adhd':       '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  /** Speaker cone with two sound-wave arcs — the same glyph family as readAloudIcon()
   *  below, since the Voice Over profile is exactly "read the page aloud" turned on. */
  'voice-over': '<path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M17.5 8.5a5 5 0 0 1 0 7"/><path d="M20.5 5.5a9 9 0 0 1 0 13"/>',
  /** A sharply stooped person gripping a four-legged walker frame — redrawn as a stroke
   *  icon (this file's outline style, not the source's solid silhouette) directly
   *  against the reference pictogram Ajith supplied (docs/elderly.png): head held up
   *  and forward past a near-90-degree fold at the waist, arm reaching down to the
   *  walker's near post right where it meets the frame's top bar, far post ending in a
   *  small filled wheel (same solid-dot treatment as the head) so it reads as a rolling
   *  walker rather than a static frame at icon size. */
  'elderly':    '<circle cx="14" cy="5" r="2.2" fill="currentColor" stroke="none"/><path d="M13 7c-2.5 1.8-5.5 4-6 7.5"/><path d="M7 14.5 6 20.5"/><path d="M7 14.5 8.5 20.5"/><path d="M9.5 11.5 13.5 13"/><path d="M13.5 13h6.5"/><path d="M13.5 13v7.5"/><path d="M20 13v5.2"/><circle cx="20" cy="19.6" r="1.2" fill="currentColor" stroke="none"/>',
  'cognitive':  '<circle cx="12" cy="12" r="9"/><path d="M9.5 10a2.5 2.5 0 0 1 5 0c0 1.2-.8 1.7-1.2 2.6-.2.4-.3.9-.3 1.4"/><line x1="12" y1="16.5" x2="12" y2="16.51"/>',
};

/** Returns null for 'dyslexia' — that profile uses a text glyph, not an svg (see panel-dom.ts). */
export function profileIcon(key: ProfileKey): SVGElement | null {
  const markup = PROFILE_ICON_MARKUP[key];
  if (!markup) return null;
  return createSvg('0 0 24 24', markup, strokeAttrs());
}

export function fontSizeIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M3 17 8 6l5 11"/><path d="M4.3 14h7.4"/><path d="M14 17v-7a2.5 2.5 0 0 1 5 0v7"/><path d="M14 13.5h5"/>',
    strokeAttrs()
  );
}

export function contrastIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    // fill="none" set explicitly on the circle itself (not just inherited from the
    // svg's own strokeAttrs()) so it stays an outline — not a solid disc — even
    // where a caller's own CSS sets fill on the <svg> (e.g. .accesspath-trigger svg).
    '<circle cx="12" cy="12" r="9" fill="none"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
    strokeAttrs()
  );
}

export function saturationIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M12 3s6.5 6.94 6.5 11.25a6.5 6.5 0 0 1-13 0C5.5 9.94 12 3 12 3z"/>',
    strokeAttrs()
  );
}

export function invertIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    strokeAttrs()
  );
}

export function spacingIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    // fill="none" on every shape explicitly — the two arrow paths are open V
    // polylines, so without their own fill="none" they'd pick up a filled
    // triangular wedge wherever a caller's own CSS sets fill on the <svg>
    // (e.g. .accesspath-trigger svg), not just an inherited line-art outline.
    '<line x1="4" y1="5" x2="4" y2="19" fill="none"/><line x1="20" y1="5" x2="20" y2="19" fill="none"/><path d="M8 12h8" fill="none"/><path d="m9 9-3 3 3 3" fill="none"/><path d="m15 9 3 3-3 3" fill="none"/>',
    strokeAttrs()
  );
}

export function lineHeightIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<line x1="3" y1="6" x2="13" y2="6"/><line x1="3" y1="12" x2="13" y2="12"/><line x1="3" y1="18" x2="13" y2="18"/><path d="m18 8 3-3 3 3"/><line x1="21" y1="5" x2="21" y2="19"/><path d="m18 16 3 3 3-3"/>',
    strokeAttrs()
  );
}

export function motionIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>',
    {}
  );
}

export function playIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
    strokeAttrs({ width: '18', height: '18' })
  );
}

export function pauseIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
    strokeAttrs({ width: '18', height: '18' })
  );
}

export function restartIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    strokeAttrs({ width: '18', height: '18' })
  );
}

export function readAloudIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M17.5 8.5a5 5 0 0 1 0 7"/><path d="M20.5 5.5a9 9 0 0 1 0 13"/>',
    strokeAttrs()
  );
}

export function highlightLinksIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M9 15a5 5 0 0 1 0-7l2-2a5 5 0 0 1 7 7l-1 1"/><path d="M15 9a5 5 0 0 1 0 7l-2 2a5 5 0 0 1-7-7l1-1"/>',
    strokeAttrs()
  );
}

export function hideImagesIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none"/><path d="m4 18 5-5 4 4 3-3 4 4"/><line x1="3" y1="21" x2="21" y2="3"/>',
    strokeAttrs()
  );
}

export function bigCursorIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M4 3 19 11 12 12.5 9.5 20 4 3z"/>',
    strokeAttrs({ 'stroke-linejoin': 'round' })
  );
}

export function dictionaryIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="10.5" x2="14" y2="10.5"/>',
    strokeAttrs()
  );
}

export function tooltipsIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<rect x="3" y="5" width="18" height="11" rx="2"/><path d="m9 20 3-4 3 4"/><circle cx="12" cy="10.5" r="0.9" fill="currentColor" stroke="none"/>',
    strokeAttrs()
  );
}

export function focusModeIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M3 9V5a2 2 0 0 1 2-2h4"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M21 15v4a2 2 0 0 1-2 2h-4"/><path d="M9 21H5a2 2 0 0 1-2-2v-4"/><line x1="3" y1="12" x2="21" y2="12"/>',
    strokeAttrs()
  );
}

/** Page outline with a filled bar on the given edge — represents which side the
 *  drawer currently opens from, for the header's side-toggle button. */
export function panelSideIcon(side: 'left' | 'right'): SVGElement {
  const barX = side === 'left' ? 3 : 16;
  return createSvg(
    '0 0 24 24',
    `<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="${barX}" y="4" width="5" height="16" rx="1" fill="currentColor" stroke="none"/>`,
    strokeAttrs()
  );
}

export function infoIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.75" r="0.9" fill="currentColor" stroke="none"/>',
    strokeAttrs({ 'stroke-width': '1.6' })
  );
}

export function chevronRightIcon(): SVGElement {
  return createSvg('0 0 24 24', '<polyline points="9 5 16 12 9 19"/>', strokeAttrs({ 'stroke-width': '2' }));
}

export function checkCircleIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9"/>',
    strokeAttrs({ 'stroke-width': '1.8' })
  );
}

export function sunIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2.5" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="21.5"/><line x1="4.6" y1="4.6" x2="6" y2="6"/><line x1="18" y1="18" x2="19.4" y2="19.4"/><line x1="2.5" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="21.5" y2="12"/><line x1="4.6" y1="19.4" x2="6" y2="18"/><line x1="18" y1="6" x2="19.4" y2="4.6"/>',
    strokeAttrs({ 'stroke-width': '1.8' })
  );
}

/** Deliberately a different crescent than invertIcon() below — that path is already
 *  in use for the Invert Colors toggle, so reusing it here would render two different
 *  toggles with an identical glyph. */
export function moonIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M12 3.5a7.5 7.5 0 1 0 8.5 8.5 8.5 8.5 0 0 1-8.5-8.5z"/>',
    strokeAttrs({ 'stroke-width': '1.8', 'stroke-linejoin': 'round' })
  );
}

/** Same path as PROFILE_ICON_MARKUP['motor'] above — trigger-icon choice, not a
 *  profile card, so it's its own top-level export rather than reaching into that map. */
/** Solid filled mark like accessibilityIcon()/accessibilityBadgeIcon() above, not
 *  stroked line art — sourced from docs/accessibility-svgrepo-com.svg. */
export function motorIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<circle cx="18" cy="4" r="2"/><path d="m17.836 12.014-4.345.725 3.29-4.113a1 1 0 0 0-.227-1.457l-6-4a.999.999 0 0 0-1.262.125l-4 4 1.414 1.414 3.42-3.42 2.584 1.723-2.681 3.352a5.913 5.913 0 0 0-5.5.752l1.451 1.451A3.972 3.972 0 0 1 8 12c2.206 0 4 1.794 4 4 0 .739-.216 1.425-.566 2.02l1.451 1.451A5.961 5.961 0 0 0 14 16c0-.445-.053-.878-.145-1.295L17 14.181V20h2v-7a.998.998 0 0 0-1.164-.986zM8 20c-2.206 0-4-1.794-4-4 0-.739.216-1.425.566-2.02l-1.451-1.451A5.961 5.961 0 0 0 2 16c0 3.309 2.691 6 6 6 1.294 0 2.49-.416 3.471-1.115l-1.451-1.451A3.972 3.972 0 0 1 8 20z"/>',
    { fill: 'currentColor' }
  );
}

/** International Symbol of Access-style circular badge — a solid filled mark like
 *  accessibilityIcon() above, not stroked line art. Sourced from docs/accessibility-thick.svg
 *  (16x16 native viewBox, kept as-is rather than rescaling the path to 24x24). */
export function accessibilityBadgeIcon(): SVGElement {
  return createSvg(
    '0 0 16 16',
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M16 8C16 12.4183 12.4183 16 8 16C3.58172 16 0 12.4183 0 8C0 3.58172 3.58172 0 8 0C12.4183 0 16 3.58172 16 8ZM9.25 3.75C9.25 4.44036 8.69036 5 8 5C7.30964 5 6.75 4.44036 6.75 3.75C6.75 3.05964 7.30964 2.5 8 2.5C8.69036 2.5 9.25 3.05964 9.25 3.75ZM12 8H9.41901L11.2047 13H9.081L8 9.97321L6.91901 13H4.79528L6.581 8H4V6H12V8Z"/>',
    { fill: 'currentColor' }
  );
}

export function hoverIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>',
    strokeAttrs()
  );
}

export function muteSoundsIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M4 9v6h4l5 5V4L8 9H4z"/><line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/>',
    strokeAttrs()
  );
}

export function virtualKeyboardIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="18" y1="10" x2="18" y2="10.01"/><line x1="6" y1="14" x2="14" y2="14"/><line x1="17" y1="14" x2="18" y2="14"/>',
    strokeAttrs({ 'stroke-linecap': 'round' })
  );
}

/** Deliberately reuses the same eye-outline shape as PROFILE_ICON_MARKUP['low-vision']
 *  (icons.ts already has precedent for shape reuse across unrelated toggles, e.g.
 *  motorIcon/PROFILE_ICON_MARKUP['motor']) — the "how it looks to other eyes" glyph
 *  fits both a low-vision profile and a color-blindness simulation dropdown. */
export function colorBlindIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    strokeAttrs()
  );
}

export function paletteIcon(): SVGElement {
  return createSvg(
    '0 0 24 24',
    '<path d="M12 3a9 9 0 1 0 0 18c1.3 0 2-.8 2-1.8 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1 .8-1.9 1.9-1.9H17a4 4 0 0 0 4-4c0-4.7-4-7.5-9-7.5z"/><circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="7.3" r="1.2" fill="currentColor" stroke="none"/><circle cx="16.2" cy="10.5" r="1.2" fill="currentColor" stroke="none"/>',
    strokeAttrs()
  );
}

/** AccessPath's own brand mark, embedded as the real logo art (not a hand-redrawn
 *  approximation) — a base64 data URI so it stays self-contained: works from any
 *  host domain via the script embed's data-icon="logo", with no dependency on this
 *  site's own /images/logo.png path resolving on someone else's page. Source:
 *  packages/site/public/images/logo.png (240x230). Adds real bundle weight (the
 *  encoded PNG) unlike every other icon in this file, which is why it's the one
 *  exception to "vector only" here — a deliberate tradeoff for pixel-accurate brand
 *  fidelity on this specific option. */
export function accessPathLogoIcon(): SVGElement {
  return createSvg(
    '0 0 240 230',
    `<image href="${ACCESSPATH_LOGO_DATA_URI}" x="0" y="0" width="240" height="230" preserveAspectRatio="xMidYMid meet"/>`,
    {}
  );
}

