const ORIGINAL_ATTR = 'data-a11y-heading-base-size';

/** Scales h1-h6 within `container` relative to each heading's OWN real computed
 *  font-size, not a fixed CSS em-multiplier. `em` on font-size always resolves
 *  against the *parent's* computed size, never "this element's other declared
 *  size" — so no CSS-only formula can preserve an arbitrary custom-sized heading
 *  (e.g. a clamp()-based hero title) when scaling it, it can only approximate a
 *  browser-default heading size. Each heading's original size is captured once
 *  (before any override is ever applied) and cached in a data attribute, so
 *  repeated calls always scale from the true original rather than a
 *  previously-scaled value.
 *
 *  `level` is 0-100, same formula as --a11y-s in a11y-effects.css
 *  (`calc(1 + level / 100)`) — 0 = normal size, 100 = double size. */
export function syncHeadingScale(container: HTMLElement, level: number): void {
  const scale = 1 + level / 100;
  for (const heading of container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')) {
    let basePx = parseFloat(heading.getAttribute(ORIGINAL_ATTR) ?? '');
    if (!basePx) {
      heading.style.removeProperty('font-size');
      basePx = parseFloat(getComputedStyle(heading).fontSize);
      heading.setAttribute(ORIGINAL_ATTR, String(basePx));
    }
    if (scale === 1) {
      heading.style.removeProperty('font-size');
    } else {
      heading.style.setProperty('font-size', `${basePx * scale}px`, 'important');
    }
  }
}
