export interface HeadingEntry {
  level: number;
  text: string;
  el: HTMLElement;
}

function collect(container: HTMLElement, selector: string): HeadingEntry[] {
  return Array.from(container.querySelectorAll<HTMLElement>(selector))
    .map((el) => ({
      level: Number(el.tagName[1]),
      text: (el.textContent ?? '').trim(),
      el,
    }))
    .filter((entry) => entry.text.length > 0);
}

/** Read-only scan for the Page Structure Navigator — no state, no persistence.
 *  Deliberately h1/h2 by default, not the full h1-h6 range: this is meant to
 *  read as a clean high-level map of the page's real sections, not a flat
 *  list of every subsection down to h6 (which on a typical page badly
 *  outnumbers the handful of h2 section headings a user actually wants to
 *  jump between).
 *
 *  Falls back to also including h3 only when the host page has no h2 at all —
 *  this widget is embedded on arbitrary third-party pages, and some skip
 *  straight from h1 to h3 in their own markup; without the fallback, such a
 *  page would get a nearly-empty (h1-only) navigator instead of a useful one. */
export function scanHeadings(container: HTMLElement): HeadingEntry[] {
  const primary = collect(container, 'h1,h2');
  const hasH2 = primary.some((entry) => entry.level === 2);
  return hasH2 ? primary : collect(container, 'h1,h2,h3');
}
