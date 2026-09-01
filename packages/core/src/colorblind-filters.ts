import type { A11yPrefs } from './types';

/** Public-domain-equivalent feColorMatrix values for simulating each color-blindness
 *  type — the same matrices most open-source simulators (e.g. Coblis) use. */
const FILTER_MATRICES: Record<Exclude<A11yPrefs['colorBlindSim'], 'none'>, string> = {
  protanopia:    '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
  deuteranopia:  '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
  tritanopia:    '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0',
  achromatopsia: '0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0',
};

let injected = false;

/** Lazily injects one hidden <svg> containing all 4 filter defs into the light DOM
 *  (document.body) — CSS `filter: url(#id)` resolves against the document the filtered
 *  element lives in, and colorBlindSim is applied to the host page's own `container`,
 *  never the panel's Shadow DOM (same constraint CLAUDE.md documents for a11y-effects.css
 *  in general). Idempotent: safe to call on every applyClasses() pass. */
export function ensureColorBlindFilters(): void {
  if (injected) return;
  injected = true;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;');
  svg.innerHTML = Object.entries(FILTER_MATRICES)
    .map(([key, values]) => `<filter id="ap-cb-${key}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${values}"/></filter>`)
    .join('');
  document.body.appendChild(svg);
}
