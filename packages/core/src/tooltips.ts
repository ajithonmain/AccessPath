const MARKER_ATTR = 'data-a11y-tooltip';

/** One-time scan: gives every element with aria-label but no visible tooltip a title
 *  attribute. Marks touched elements so disableTooltips() can cleanly revert them. */
export function enableTooltips(container: HTMLElement): void {
  const targets = container.querySelectorAll<HTMLElement>(`[aria-label]:not([title]):not([${MARKER_ATTR}])`);
  for (const el of targets) {
    el.setAttribute('title', el.getAttribute('aria-label') ?? '');
    el.setAttribute(MARKER_ATTR, '1');
  }
}

export function disableTooltips(container: HTMLElement): void {
  const targets = container.querySelectorAll<HTMLElement>(`[${MARKER_ATTR}]`);
  for (const el of targets) {
    el.removeAttribute('title');
    el.removeAttribute(MARKER_ATTR);
  }
}
