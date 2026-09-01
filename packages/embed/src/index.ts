import { getState, createPanel, createTriggerButton, applyClasses } from '@accesspath/core';
import type {
  ControlCategoryKey,
  CustomActionConfig,
  LabelOverrides,
  LocaleKey,
  ProfileKey,
  SectionKey,
  TriggerPosition,
  TriggerShape,
  TriggerIconKey,
} from '@accesspath/core';
import panelCss from '@accesspath/core/styles/panel.css?raw';
import effectsCss from '@accesspath/core/styles/a11y-effects.css?raw';

const EFFECTS_STYLE_ID = 'accesspath-effects-styles';
const VALID_POSITIONS: TriggerPosition[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
const VALID_SHAPES: TriggerShape[] = ['circle', 'rounded-square', 'pill'];
const VALID_ICONS: TriggerIconKey[] = ['accessibility', 'motion', 'contrast', 'spacing', 'motor', 'badge', 'logo'];
const VALID_LOCALES: LocaleKey[] = ['en', 'es', 'fr', 'de', 'pt'];

interface EmbedConfig {
  profiles?: ProfileKey[];
  theme: 'light' | 'dark';
  storageKey: string;
  position: TriggerPosition;
  shape: TriggerShape;
  icon: TriggerIconKey;
  draggable: boolean;
  target?: string;
  /** data-brand="#4928F3" — applied as inline --ap-brand-* styles (brand-color.ts),
   *  not a global :root override. */
  brand?: string;
  /** data-actions='[{"id":"support","label":"Support"}]' — JSON-parsed. Host listens
   *  for the resulting `accesspath:action` CustomEvent on the resolved `container`
   *  element itself (data-attributes can't carry a callback). */
  actions?: CustomActionConfig[];
  /** data-locale="es" — one of the bundled locales. Defaults to 'en'. */
  locale?: LocaleKey;
  /** data-labels='{"footer":{"reset":"Reiniciar"}}' — JSON-parsed per-string overrides
   *  applied on top of `locale`. */
  labels?: LabelOverrides;
  /** data-sections="profiles,controls" — comma-separated, same pattern as data-profiles.
   *  customSections isn't exposed here: data-attributes can't carry a render callback —
   *  hosts needing custom sections use @accesspath/core, @accesspath/react, or
   *  @accesspath/angular directly instead of the script-tag embed. */
  sections?: SectionKey[];
  /** data-control-categories="vision,motion" — comma-separated, same pattern as
   *  data-profiles. */
  controlCategories?: ControlCategoryKey[];
  /** data-hide-trigger="true" — skip createTriggerButton() entirely, for hosts who
   *  want to open the drawer from their own button elsewhere on the page instead of
   *  the default floating FAB. Use window.AccessPath.open()/close()/toggle() (defined
   *  below) to wire that button up — data-* attributes can't carry an onclick handler,
   *  so a page-global is the only way a plain <script> host can reach the instance. */
  hideTrigger: boolean;
  /** data-report-url="https://example.com/report" — rendered as a footer link. */
  reportUrl?: string;
}

/** Minimal imperative API for hosts using data-hide-trigger="true" (or who just want
 *  a scripting handle instead of the floating trigger's onClick). One embed script per
 *  page in current usage, so one global instance is enough — not namespaced per
 *  storageKey. */
declare global {
  interface Window {
    AccessPath?: {
      open(): void;
      close(): void;
      toggle(): void;
    };
  }
}

// document.currentScript is only valid during this script's own synchronous
// execution — must capture it now, not inside the deferred mount() call below.
const scriptEl = document.currentScript as HTMLScriptElement | null;

function readConfig(script: HTMLScriptElement | null): EmbedConfig {
  const ds = script?.dataset ?? {};
  const position = ds['position'] as TriggerPosition | undefined;
  const shape = ds['shape'] as TriggerShape | undefined;
  const icon = ds['icon'] as TriggerIconKey | undefined;
  const locale = ds['locale'] as LocaleKey | undefined;
  return {
    profiles: ds['profiles']
      ? (ds['profiles'].split(',').map((s) => s.trim()).filter(Boolean) as ProfileKey[])
      : undefined,
    theme: ds['theme'] === 'dark' ? 'dark' : 'light',
    storageKey: ds['storageKey'] || 'accesspath-prefs',
    position: position && VALID_POSITIONS.includes(position) ? position : 'bottom-right',
    shape: shape && VALID_SHAPES.includes(shape) ? shape : 'circle',
    icon: icon && VALID_ICONS.includes(icon) ? icon : 'accessibility',
    draggable: ds['draggable'] === 'true',
    target: ds['target'],
    brand: ds['brand'],
    actions: parseJsonAttr<CustomActionConfig[]>(ds['actions'], Array.isArray),
    locale: locale && VALID_LOCALES.includes(locale) ? locale : undefined,
    labels: parseJsonAttr<LabelOverrides>(ds['labels'], (v) => typeof v === 'object' && v !== null),
    sections: parseCommaList<SectionKey>(ds['sections']),
    controlCategories: parseCommaList<ControlCategoryKey>(ds['controlCategories']),
    hideTrigger: ds['hideTrigger'] === 'true',
    reportUrl: ds['reportUrl'],
  };
}

function parseCommaList<T extends string>(raw: string | undefined): T[] | undefined {
  return raw ? (raw.split(',').map((s) => s.trim()).filter(Boolean) as T[]) : undefined;
}

function parseJsonAttr<T>(raw: string | undefined, isValid: (parsed: unknown) => boolean): T | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? (parsed as T) : undefined;
  } catch {
    return undefined;
  }
}

function injectEffectsStyles(): void {
  if (document.getElementById(EFFECTS_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = EFFECTS_STYLE_ID;
  style.textContent = effectsCss;
  document.head.appendChild(style);
}

const DYSLEXIA_FONT_LINK_ID = 'accesspath-dyslexia-font';

// The .a11y-dyslexia rule in a11y-effects.css sets font-family: 'OpenDyslexic', but never
// loads that face itself — React/Angular consumers are expected to @import it in their own
// global styles (see docs/features-and-profiles.md), same as any other CSS dependency of a
// component they render. The embed script has no such host stylesheet to piggyback on (its
// whole pitch is "no-build sites"), so without this the Dyslexia Friendly toggle silently
// falls back to sans-serif on every embed-only site. Injected lazily (only once dyslexia is
// actually turned on) rather than unconditionally on mount, so sites that never touch the
// toggle don't pay for a font nobody uses. Same "graceful degradation" contract as the
// dictionary lookup's api.dictionaryapi.dev call: if the CDN request fails, the CSS
// font-family fallback (sans-serif) still applies, nothing else breaks.
function ensureDyslexiaFont(): void {
  if (document.getElementById(DYSLEXIA_FONT_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = DYSLEXIA_FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/@fontsource/opendyslexic/index.css';
  document.head.appendChild(link);
}

function mount(): void {
  const cfg = readConfig(scriptEl);

  // Defaults to <body>, not <html> — some a11y-* effects (saturation, invert) use a CSS
  // `filter`, which visually filters an element's entire rendered subtree regardless of Shadow
  // DOM boundaries. The embed host mounts at the <html> level below, so <html> itself must stay
  // filter-free or the drawer/trigger would inherit the filter along with the rest of the page.
  const container =
    (cfg.target ? document.querySelector<HTMLElement>(cfg.target) : document.body) ?? document.body;
  container.classList.add('a11y-target');

  injectEffectsStyles();

  const host = document.createElement('div');
  host.id = 'accesspath-embed-host';
  // Sibling of <body>, not a child of it — guarantees the host (and the drawer/trigger inside
  // it) is never a descendant of `container`, so it can't inherit a filter applied there.
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const shadowStyle = document.createElement('style');
  shadowStyle.textContent = panelCss;
  shadow.appendChild(shadowStyle);

  const state = getState(cfg.storageKey);
  const panel = createPanel({
    state,
    isDarkTheme: cfg.theme === 'dark',
    profiles: cfg.profiles,
    container,
    brandColor: cfg.brand,
    actions: cfg.actions,
    locale: cfg.locale,
    labels: cfg.labels,
    sections: cfg.sections,
    controlCategories: cfg.controlCategories,
    reportUrl: cfg.reportUrl,
  });
  if (cfg.hideTrigger) {
    shadow.appendChild(panel.root);
  } else {
    const trigger = createTriggerButton({
      onClick: () => state.open(),
      position: cfg.position,
      shape: cfg.shape,
      icon: cfg.icon,
      draggable: cfg.draggable,
      storageKey: cfg.storageKey,
      brandColor: cfg.brand,
      locale: cfg.locale,
    });
    shadow.append(panel.root, trigger);
  }

  window.AccessPath = {
    open: () => state.open(),
    close: () => state.close(),
    toggle: () => (state.isOpen ? state.close() : state.open()),
  };

  const applyToTargets = () => {
    if (state.prefs.dyslexia) ensureDyslexiaFont();
    applyClasses([container], state.prefs, state.activeProfiles);
  };
  state.subscribe(applyToTargets);
  applyToTargets();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
