/** The .a11y-dyslexia rule in a11y-effects.css sets font-family: 'OpenDyslexic', but never loads
 *  that face itself — hosts are expected to supply it. Most host apps don't, so without this the
 *  Dyslexia Friendly toggle silently falls back to sans-serif. Injected lazily (only once
 *  dyslexia is actually turned on) rather than unconditionally on load, so pages that never touch
 *  the toggle don't pay for a font nobody uses. Idempotent: safe to call on every applyClasses()
 *  run. Same "graceful degradation" contract as the dictionary lookup's api.dictionaryapi.dev
 *  call: if the CDN request fails, the CSS font-family fallback (sans-serif) still applies,
 *  nothing else breaks. A host that wants to self-host the font can define its own earlier
 *  @font-face 'OpenDyslexic' — the browser keeps the first successfully loaded face, so this
 *  injected link is purely a fallback and never overrides one a host already provides. */

const DYSLEXIA_FONT_LINK_ID = 'accesspath-dyslexia-font';

export function ensureDyslexiaFont(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(DYSLEXIA_FONT_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = DYSLEXIA_FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/@fontsource/opendyslexic/index.css';
  document.head.appendChild(link);
}
