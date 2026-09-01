// Imported directly (not relying on the embed script's own head-injected copy):
// panel.css styles the .accesspath-trigger FAB and drawer the Install & Customize
// builder's live preview mounts for real (see createBuilder()'s syncPreviewWidget()),
// and a11y-effects.css styles the a11y-* classes both that preview and the real embed
// widget (mounted at the bottom of index.html, for this site itself) toggle — all of
// this needs to be available immediately, not only once embed.js finishes loading. See
// the embed-load resilience note further down this file.
import '@accesspath/core/styles/panel.css';
import '@accesspath/core/styles/a11y-effects.css';
import { createPanel, createTriggerButton, getState, applyClasses } from '@accesspath/core';
import type { PanelHandle, ProfileKey, LocaleKey, CustomActionConfig } from '@accesspath/core';

// window.AccessPath is set by the embed <script> tag at the bottom of index.html
// (packages/embed/src/index.ts) — declared here too since this file doesn't import
// from @accesspath/embed (it's loaded as a plain runtime script, not a package dep).
declare global {
  interface Window {
    AccessPath?: { open(): void; close(): void; toggle(): void };
  }
}

// --- Embed-load resilience ---------------------------------------------------------
// The embed <script> tag's own onerror="" attribute (in index.html) catches a hard
// network failure (404, offline) immediately. This covers the other failure mode: the
// script loads but mount() never runs or throws before it appends the trigger button
// (e.g. a bad `dist/embed.js` from a stale sync-embed.mjs run) — checked once, after
// giving mount() a generous window to run on a slow connection.
// The trigger lives inside embed.js's own Shadow DOM host (#accesspath-embed-host),
// not the light DOM — document.querySelector can never see into it, so this must
// look up the host and query its shadowRoot directly or every load reads as failed.
window.setTimeout(() => {
  const shadow = document.getElementById('accesspath-embed-host')?.shadowRoot;
  if (!shadow?.querySelector('.accesspath-trigger')) {
    document.body.classList.add('embed-failed');
  }
}, 4000);

// --- Nav background: transparent over the hero, solid once the page scrolls -------
const navEl = document.querySelector('.nav');
function syncNavScrolled(): void {
  navEl?.classList.toggle('is-scrolled', window.scrollY > 8);
}
syncNavScrolled();
window.addEventListener('scroll', syncNavScrolled, { passive: true });

// --- Mobile nav menu: below 700px .nav-links becomes a toggled dropdown -----------
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');

function setNavOpen(isOpen: boolean): void {
  navLinks?.classList.toggle('is-open', isOpen);
  navToggle?.setAttribute('aria-expanded', String(isOpen));
  navToggle?.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
}

navToggle?.addEventListener('click', () => {
  setNavOpen(navToggle.getAttribute('aria-expanded') !== 'true');
});
navLinks?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => setNavOpen(false));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && navToggle?.getAttribute('aria-expanded') === 'true') {
    setNavOpen(false);
    navToggle.focus();
  }
});

// --- Hero primary CTA: opens the real widget; falls back to the on-page demo if the
// embed script hasn't loaded yet (see the embed-load resilience block above). --------
const heroTryBtn = document.querySelector<HTMLAnchorElement>('.hero-cta a[href="#hero-demo"]');
heroTryBtn?.addEventListener('click', (e) => {
  if (window.AccessPath) {
    e.preventDefault();
    window.AccessPath.open();
  } else {
    window.setTimeout(() => document.getElementById('hero-demo')?.focus({ preventScroll: true }), 400);
  }
});

// --- Hero quick-control strip -------------------------------------------------------
// Four restrained controls that demonstrate the product by changing the "With
// AccessPath" demo pane only — never the real drawer/panel (see CLAUDE.md: the real
// AccessPath trigger stays closed by default and is opened by the visitor).
// Text Size starts on "large" (its button shows active/bordered from load, matching
// the approved reference) — cycling moves large -> xl -> normal -> large ...
const TEXT_SIZE_STEPS = ['large', 'xl', 'normal'] as const;
type TextSizeStep = (typeof TEXT_SIZE_STEPS)[number];

const demoPaneAfter = document.getElementById('demo-pane-after');
const ctrlTextSize = document.getElementById('ctrl-text-size');
const ctrlContrast = document.getElementById('ctrl-contrast');
const ctrlDyslexia = document.getElementById('ctrl-dyslexia');

let textSizeIndex = 0;

function setTextSizeStep(step: TextSizeStep): void {
  demoPaneAfter?.classList.remove('demo-size-xl', 'demo-size-normal');
  if (step !== 'large') demoPaneAfter?.classList.add(`demo-size-${step}`);
  ctrlTextSize?.classList.toggle('is-active', step !== 'normal');
  ctrlTextSize?.setAttribute('aria-pressed', String(step !== 'normal'));
  ctrlTextSize?.setAttribute(
    'aria-label',
    `Text size: ${step === 'xl' ? 'extra large' : step}. Click to cycle.`
  );
}
setTextSizeStep(TEXT_SIZE_STEPS[textSizeIndex]);

ctrlTextSize?.addEventListener('click', () => {
  textSizeIndex = (textSizeIndex + 1) % TEXT_SIZE_STEPS.length;
  setTextSizeStep(TEXT_SIZE_STEPS[textSizeIndex]);
});

ctrlContrast?.addEventListener('click', () => {
  const isActive = demoPaneAfter?.classList.toggle('demo-contrast') ?? false;
  ctrlContrast.classList.toggle('is-active', isActive);
  ctrlContrast.setAttribute('aria-pressed', String(isActive));
  ctrlContrast.setAttribute('aria-label', `Contrast: ${isActive ? 'high' : 'normal'}. Click to toggle.`);
});

const ctrlLineHeight = document.getElementById('ctrl-line-height');
ctrlLineHeight?.addEventListener('click', () => {
  const isActive = demoPaneAfter?.classList.toggle('demo-line-height') ?? false;
  ctrlLineHeight.classList.toggle('is-active', isActive);
  ctrlLineHeight.setAttribute('aria-pressed', String(isActive));
  ctrlLineHeight.setAttribute('aria-label', `Line height: ${isActive ? 'expanded' : 'normal'}. Click to toggle.`);
});

ctrlDyslexia?.addEventListener('click', () => {
  const isActive = demoPaneAfter?.classList.toggle('demo-dyslexia') ?? false;
  ctrlDyslexia.classList.toggle('is-active', isActive);
  ctrlDyslexia.setAttribute('aria-pressed', String(isActive));
  ctrlDyslexia.setAttribute('aria-label', `Dyslexia-friendly font: ${isActive ? 'on' : 'off'}. Click to toggle.`);
});

// --- Code block syntax highlighting + copy buttons --------------------------------
// A small single-pass regex tokenizer, not a real parser — good enough for the short
// HTML/JS/TS/Angular-template snippets on this page, and avoids pulling in a syntax
// highlighting library for a handful of code blocks.
const CODE_TOKEN_RE =
  /(&lt;!--[\s\S]*?--&gt;)|(\/\/[^\n]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(&lt;\/?[\w.-]+)|([\w-]+(?==))|\b(import|export|from|default|function|return|const|let|var|class|extends|new|if|else|type|interface)\b/g;

function highlightCode(raw: string): string {
  const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(
    CODE_TOKEN_RE,
    (match, comment1, comment2, str, tagOpen, attrName, keyword) => {
      if (comment1 || comment2) return `<span class="tok-comment">${match}</span>`;
      if (str) return `<span class="tok-string">${match}</span>`;
      if (tagOpen) {
        const prefixMatch = /^&lt;\/?/.exec(tagOpen);
        const prefix = prefixMatch ? prefixMatch[0] : '';
        const name = tagOpen.slice(prefix.length);
        return `${prefix}<span class="tok-tag">${name}</span>`;
      }
      if (attrName) return `<span class="tok-attr">${match}</span>`;
      if (keyword) return `<span class="tok-keyword">${match}</span>`;
      return match;
    }
  );
}

const COPY_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>';

function makeCopyButton(getText: () => string): HTMLButtonElement {
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'code-copy-btn';
  copyBtn.setAttribute('aria-label', 'Copy code');
  copyBtn.innerHTML = COPY_ICON_SVG;
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getText());
      copyBtn.classList.add('is-copied');
      window.setTimeout(() => copyBtn.classList.remove('is-copied'), 1400);
    } catch {
      // Clipboard API can be blocked (permissions, insecure context) — the code is
      // already selectable/visible in the block, so this is a silent no-op fallback.
    }
  });
  return copyBtn;
}

// Static, still-bare blocks only — #qc-builder-code already has its own labeled Copy
// button in its builder's header, and anything already inside a `.code-panel` (the
// Integration Guide hand-authors its own panel chrome per snippet, header, language
// label, and copy button included) is already wrapped, so re-wrapping it here would
// nest a second header/copy button/highlight pass inside the first. Each remaining
// bare block gets wrapped in a windowed .code-panel (language label + copy button in
// a header bar) instead of a button floating on top of the code text.
const staticCodeBlocks = Array.from(document.querySelectorAll<HTMLElement>('.code-block')).filter(
  (el) => el.id !== 'qc-builder-code' && !el.closest('.code-panel')
);

for (const block of staticCodeBlocks) {
  const codeEl = block.querySelector('code');
  if (codeEl) codeEl.innerHTML = highlightCode(codeEl.textContent ?? '');

  const panel = document.createElement('div');
  panel.className = 'code-panel';

  const head = document.createElement('div');
  head.className = 'code-panel-head';
  const lang = document.createElement('span');
  lang.className = 'code-panel-lang';
  lang.textContent = block.dataset['lang'] ?? 'code';
  head.appendChild(lang);
  head.appendChild(makeCopyButton(() => codeEl?.textContent ?? ''));

  block.parentElement?.insertBefore(panel, block);
  panel.appendChild(head);
  panel.appendChild(block);
}



// --- Customize builder -------------------------------------------------------------
// Replaces six separate "here's a code block, here's a paragraph explaining it"
// sections with one interactive config: pick options, get a live preview and one
// generated snippet per platform, copy it.
type BuilderPlatform = 'html' | 'react' | 'angular';

/** 'other' is a builder-only UI state (see qc-builder-other-lang-note) — it never
 *  reaches generateBuilderCode()/syncPreviewWidget() as a locale value, since it isn't
 *  one of the 5 bundled LocaleKey translations. effectiveLocale() below converts it. */
type BuilderLocale = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'other';

/** null means "don't emit/pass a locale at all" — used for both the default 'en' and
 *  the 'other' UI state, which has no real bundled translation to fall back to. */
function effectiveLocale(locale: BuilderLocale): Exclude<BuilderLocale, 'other'> | null {
  return locale === 'en' || locale === 'other' ? null : locale;
}

interface BuilderState {
  platform: BuilderPlatform;
  brand: string;
  shape: 'circle' | 'rounded-square' | 'pill';
  icon: 'accessibility' | 'motion' | 'contrast' | 'spacing' | 'motor' | 'badge' | 'logo';
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  storageKey: string;
  dark: boolean;
  draggable: boolean;
  hideTrigger: boolean;
  profiles: string[];
  locale: BuilderLocale;
  sections: string[];
  /** Only the label is user-entered — id is derived at code-generation time (see
   *  slugifyActionId) so the builder doesn't have to ask a non-technical visitor to
   *  fill in both an id and a label for what's really one concept. */
  actions: { label: string }[];
}

const ALL_PROFILE_KEYS = [
  'low-vision',
  'dyslexia',
  'seizure',
  'motor',
  'colorblind',
  'adhd',
  'voice-over',
  'elderly',
  'cognitive',
];
const ALL_SECTION_KEYS = ['profiles', 'quick', 'controls', 'actions'];

function slugifyActionId(label: string, index: number): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || `action-${index + 1}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Shared by generateBuilderCode() and the live preview (syncPreviewWidget()) so the
// generated snippet and what the preview actually renders can never drift apart.
function computeActionsWithIds(actions: { label: string }[]): { id: string; label: string }[] {
  return actions
    .filter((a) => a.label.trim().length > 0)
    .map((a, i) => ({ id: slugifyActionId(a.label, i), label: a.label.trim() }));
}

const DEFAULT_BRAND = '#4928F3';

// One always-present line per platform pointing at the docs for host-rendered custom
// sections — customSections needs a real render() callback, which a copy-paste
// snippet can't express, so it gets a static note instead of a builder control.
const CUSTOM_SECTIONS_NOTE_HTML =
  '<!-- Need fully custom sections? Use @accesspath/core, @accesspath/react, or @accesspath/angular directly instead of the script embed. See the docs. -->';
const CUSTOM_SECTIONS_NOTE_JS =
  '// Need fully custom sections? Pass customSections to <AccessPathPanel>. See the docs.';

// Shown only when locale === 'other' — otherwise picking "Other" produced byte-identical
// code to English (both just omit the locale line), which read as the control doing
// nothing. This makes the "Other" choice visibly change the generated code.
const OTHER_LANG_NOTE_HTML =
  '<!-- Language not in the bundled set? Override any string with data-labels, e.g.:\n     data-labels=\'{"header":{"title":"Your translated title"}}\' -->';
const OTHER_LANG_NOTE_JS =
  "// Language not in the bundled set? Override any string with the labels prop, e.g.:\n// labels={{ header: { title: 'Your translated title' } }}";
const OTHER_LANG_NOTE_ANGULAR =
  '<!-- Language not in the bundled set? Override any string with [labels], e.g.:\n     [labels]="{header: {title: \'Your translated title\'}}" -->';

function generateBuilderCode(s: BuilderState): string {
  const isCustomBrand = s.brand.toLowerCase() !== DEFAULT_BRAND.toLowerCase();
  const profilesFiltered = s.profiles.length > 0 && s.profiles.length < ALL_PROFILE_KEYS.length;
  const profilesAttr = profilesFiltered ? s.profiles.join(',') : null;
  const sectionsFiltered = s.sections.length > 0 && s.sections.length < ALL_SECTION_KEYS.length;
  const actionsWithIds = computeActionsWithIds(s.actions);
  const locale = effectiveLocale(s.locale);
  const isOtherLocale = s.locale === 'other';

  if (s.platform === 'html') {
    const attrs = [
      `        data-theme="${s.dark ? 'dark' : 'light'}"`,
      `        data-storage-key="${s.storageKey || 'accesspath-prefs'}"`,
      `        data-position="${s.position}"`,
      `        data-shape="${s.shape}"`,
      `        data-icon="${s.icon}"`,
    ];
    if (s.draggable) attrs.push('        data-draggable="true"');
    if (s.hideTrigger) attrs.push('        data-hide-trigger="true"');
    if (profilesAttr) attrs.push(`        data-profiles="${profilesAttr}"`);
    // data-brand is read by embed.js and applied as an inline --ap-brand-* style
    // directly on the panel/trigger (packages/core/src/brand-color.ts) — no <style>
    // block, no global :root override, so it can't collide with or be overridden by
    // the host page's own stylesheet. Only shown once a non-default color is picked.
    if (isCustomBrand) attrs.push(`        data-brand="${s.brand}"`);
    if (locale) attrs.push(`        data-locale="${locale}"`);
    if (sectionsFiltered) attrs.push(`        data-sections="${s.sections.join(',')}"`);
    if (actionsWithIds.length) attrs.push(`        data-actions='${JSON.stringify(actionsWithIds)}'`);
    const otherNote = isOtherLocale ? `\n\n${OTHER_LANG_NOTE_HTML}` : '';
    const hideTriggerNote = s.hideTrigger
      ? '\n\n<!-- Open it from your own button: <button onclick="window.AccessPath.open()">Accessibility</button> -->'
      : '';
    return `<script src="/embed.js"\n${attrs.join('\n')}>\n</script>${otherNote}${hideTriggerNote}\n\n${CUSTOM_SECTIONS_NOTE_HTML}`;
  }

  if (s.platform === 'react') {
    const props = [`storageKey="${s.storageKey || 'accesspath-prefs'}"`];
    if (s.dark) props.push('isDarkTheme={true}');
    if (profilesAttr) props.push(`profiles={[${s.profiles.map((p) => `'${p}'`).join(', ')}]}`);
    // brandColor reaches panel.root directly (it mounts at document.documentElement,
    // outside this component's own JSX) — a style prop on the wrapper div below never
    // would. See AccessPathPanelProps.brandColor.
    if (isCustomBrand) props.push(`brandColor="${s.brand}"`);
    if (locale) props.push(`locale="${locale}"`);
    if (sectionsFiltered) props.push(`sections={[${s.sections.map((k) => `'${k}'`).join(', ')}]}`);
    if (actionsWithIds.length) {
      // An action button is inert without a handler, so this stays a real onAction
      // prop wired to something, not just a comment.
      props.push(`actions={${JSON.stringify(actionsWithIds)}}`);
      props.push(`onAction={(id) => { /* handle the click, e.g. id === '${actionsWithIds[0].id}' */ }}`);
    }
    const otherNoteJs = isOtherLocale ? `\n${OTHER_LANG_NOTE_JS}` : '';
    return `import { useRef } from 'react';
import { AccessPathPanel, useAccessPath } from '@accesspath/react';
import '@accesspath/core/styles/a11y-effects.css';
import '@accesspath/core/styles/panel.css';

function App() {
  const panelRef = useRef(null);
  const { prefs } = useAccessPath('${s.storageKey || 'accesspath-prefs'}');

  return (
    <div className="a11y-target">
      {/* your app content */}
      <button onClick={() => panelRef.current?.open()}>Accessibility</button>
      <AccessPathPanel
        ref={panelRef}
        ${props.join('\n        ')}
      />
    </div>
  );
}

${CUSTOM_SECTIONS_NOTE_JS}${otherNoteJs}`;
  }

  const angularAttrs = [`[storageKey]="'${s.storageKey || 'accesspath-prefs'}'"`];
  if (s.dark) angularAttrs.push('[isDarkTheme]="true"');
  if (profilesAttr) angularAttrs.push(`[profiles]="[${s.profiles.map((p) => `'${p}'`).join(', ')}]"`);
  if (isCustomBrand) angularAttrs.push(`[brandColor]="'${s.brand}'"`);
  if (locale) angularAttrs.push(`[locale]="'${locale}'"`);
  if (sectionsFiltered) angularAttrs.push(`[sections]="[${s.sections.map((k) => `'${k}'`).join(', ')}]"`);
  let actionsComment = '';
  if (actionsWithIds.length) {
    // Angular template expressions parse like JS object/array literals (not JSON) —
    // same single-quoted-string convention as the [profiles]/[sections] bindings
    // above, not JSON.stringify (which would double-quote keys inside a double-quoted
    // attribute).
    const actionsExpr = actionsWithIds.map((a) => `{id: '${a.id}', label: '${a.label}'}`).join(', ');
    angularAttrs.push(`[actions]="[${actionsExpr}]"`);
    angularAttrs.push('(action)="onAction($event)"');
    actionsComment = '<!-- implement onAction(id: string) on this component to handle the click -->\n';
  }
  const otherNoteAngular = isOtherLocale ? `\n${OTHER_LANG_NOTE_ANGULAR}\n` : '';
  return `${actionsComment}<div #root class="a11y-target">
  <!-- your app content -->
  <button (click)="a11yPanel.open()">Accessibility</button>
  <app-accessibility-panel #a11yPanel [container]="root"
    ${angularAttrs.join('\n    ')}>
  </app-accessibility-panel>
</div>
${otherNoteAngular}

${CUSTOM_SECTIONS_NOTE_HTML}`;
}

interface BuilderEls {
  root: HTMLElement | null;
  colorInput: HTMLInputElement | null;
  swatches: HTMLButtonElement[];
  shapeBtns: HTMLButtonElement[];
  iconBtns: HTMLButtonElement[];
  positionBtns: HTMLButtonElement[];
  platformBtns: HTMLButtonElement[];
  storageKeyInput: HTMLInputElement | null;
  darkToggle: HTMLInputElement | null;
  draggableToggle: HTMLInputElement | null;
  hideTriggerToggle: HTMLInputElement | null;
  profileChecks: HTMLInputElement[];
  localeBtns: HTMLButtonElement[];
  otherLangNote: HTMLElement | null;
  sectionChecks: HTMLInputElement[];
  actionsContainer: HTMLElement | null;
  addActionBtn: HTMLButtonElement | null;
  previewFrame: HTMLElement | null;
  previewBody: HTMLElement | null;
  codeInner: HTMLElement | null;
  copyBtn: HTMLElement | null;
}

// The .qc builder's controls (id="qc-builder") follow a consistent id convention —
// `${root}-swatches`, `${root}-shape`, etc. — so this stays a parameterized query
// function rather than one-off lookups.
function queryBuilderEls(root: string): BuilderEls {
  return {
    root: document.getElementById(root),
    colorInput: document.getElementById(`${root}-color-input`) as HTMLInputElement | null,
    swatches: Array.from(document.querySelectorAll<HTMLButtonElement>(`#${root}-swatches .swatch[data-color]`)),
    shapeBtns: Array.from(document.querySelectorAll<HTMLButtonElement>(`#${root}-shape .seg-btn`)),
    iconBtns: Array.from(document.querySelectorAll<HTMLButtonElement>(`#${root}-icon .icon-btn`)),
    positionBtns: Array.from(document.querySelectorAll<HTMLButtonElement>(`#${root}-position .seg-btn`)),
    platformBtns: Array.from(document.querySelectorAll<HTMLButtonElement>(`#${root} .code-panel-tab`)),
    storageKeyInput: document.getElementById(`${root}-storage-key`) as HTMLInputElement | null,
    darkToggle: document.getElementById(`${root}-dark`) as HTMLInputElement | null,
    draggableToggle: document.getElementById(`${root}-draggable`) as HTMLInputElement | null,
    hideTriggerToggle: document.getElementById(`${root}-hide-trigger`) as HTMLInputElement | null,
    profileChecks: Array.from(document.querySelectorAll<HTMLInputElement>(`#${root}-profiles input[type="checkbox"]`)),
    localeBtns: Array.from(document.querySelectorAll<HTMLButtonElement>(`#${root}-locale .seg-btn`)),
    otherLangNote: document.getElementById(`${root}-other-lang-note`),
    sectionChecks: Array.from(document.querySelectorAll<HTMLInputElement>(`#${root}-sections input[type="checkbox"]`)),
    actionsContainer: document.getElementById(`${root}-actions`),
    addActionBtn: document.getElementById(`${root}-add-action`) as HTMLButtonElement | null,
    previewFrame: document.getElementById(`${root}-preview-frame`),
    previewBody: document.getElementById(`${root}-preview-body`),
    codeInner: document.getElementById(`${root}-code-inner`),
    copyBtn: document.getElementById(`${root}-copy`),
  };
}

// Fixed, internal-only — deliberately never the builder's own "Storage Key" text field
// value (that field only affects the *generated snippet's* data-storage-key/storageKey;
// reading it back into the live preview's real localStorage key would risk colliding
// with the real site-wide widget mounted at index.html's accesspath-embed-script,
// storageKey "accesspath-site", if a visitor happened to type that exact string).
const PREVIEW_STORAGE_KEY = 'accesspath-site-qc-preview';

function createBuilder(els: BuilderEls): void {
  if (!els.root) return;

  const state: BuilderState = {
    platform: 'html',
    brand: '#4928F3',
    shape: 'circle',
    icon: 'accessibility',
    position: 'bottom-right',
    storageKey: 'accesspath-prefs',
    dark: false,
    draggable: true, // matches #qc-builder-draggable's default `checked` attribute
    hideTrigger: false,
    profiles: [...ALL_PROFILE_KEYS],
    locale: 'en',
    sections: [...ALL_SECTION_KEYS],
    actions: [],
  };

  let previewPanel: PanelHandle | null = null;
  let previewTriggerEl: HTMLButtonElement | null = null;
  let previewSnapshot = '';

  // Mounts a real @accesspath/core panel + trigger into the preview window, configured
  // with the builder's current settings — replaces the old static mockup <span> that
  // just looked like a trigger. Rebuilds only when a construction-time-only option
  // actually changed (everything but dark theme, which has a live setter) — matches the
  // same "changing these requires remount" limitation the React/Angular wrappers already
  // have, so a visitor tweaking, say, the Storage Key text field or switching the code
  // tab doesn't needlessly flicker/close an already-open preview drawer.
  function syncPreviewWidget(): void {
    if (!els.previewFrame || !els.previewBody) return;
    const actionsWithIds = computeActionsWithIds(state.actions);
    const locale = effectiveLocale(state.locale);
    const snapshot = JSON.stringify({
      shape: state.shape,
      icon: state.icon,
      position: state.position,
      draggable: state.draggable,
      brand: state.brand,
      profiles: state.profiles,
      locale,
      sections: state.sections,
      actions: actionsWithIds,
    });

    if (snapshot === previewSnapshot) {
      previewPanel?.setDarkTheme(state.dark);
      return;
    }
    previewSnapshot = snapshot;

    previewPanel?.destroy();
    previewPanel?.root.remove();
    previewTriggerEl?.remove();

    // getState() memoizes per storageKey (registry.ts), so this is the same
    // AccessPathState instance across rebuilds — prefs a visitor toggles inside the
    // opened preview drawer (e.g. Invert Colors) survive unrelated builder tweaks
    // (e.g. switching Language) instead of resetting on every rebuild.
    const previewState = getState(PREVIEW_STORAGE_KEY);

    previewPanel = createPanel({
      state: previewState,
      container: els.previewBody,
      profiles: state.profiles as ProfileKey[],
      locale: locale ?? undefined,
      sections: state.sections,
      actions: actionsWithIds as CustomActionConfig[],
      brandColor: state.brand,
    });
    previewPanel.setDarkTheme(state.dark);
    els.previewFrame.appendChild(previewPanel.root);

    previewTriggerEl = createTriggerButton({
      onClick: () => previewState.open(),
      shape: state.shape,
      icon: state.icon,
      position: state.position,
      draggable: state.draggable,
      storageKey: PREVIEW_STORAGE_KEY,
      brandColor: state.brand,
      absolute: true,
    });
    els.previewBody.appendChild(previewTriggerEl);

    const previewBody = els.previewBody;
    previewState.subscribe(() => applyClasses([previewBody], previewState.prefs, previewState.activeProfiles));
    applyClasses([previewBody], previewState.prefs, previewState.activeProfiles);
  }

  function renderBuilder(): void {
    syncPreviewWidget();
    if (els.codeInner) els.codeInner.innerHTML = highlightCode(generateBuilderCode(state));
  }

  // Rebuilds the action-row DOM from state.actions — only called on add/remove, never
  // on every keystroke (see the delegated 'input' listener below), so typing a label
  // doesn't destroy the focused input mid-edit.
  function renderActionRows(): void {
    if (!els.actionsContainer) return;
    els.actionsContainer.innerHTML = state.actions
      .map(
        (a, i) => `
      <div class="qc-action-row" data-index="${i}">
        <input type="text" class="qc-action-label-input" placeholder="Button label (e.g. Support)" value="${escapeHtml(a.label)}">
        <button type="button" class="qc-action-remove-btn" aria-label="Remove action button">×</button>
      </div>`
      )
      .join('');
  }

  els.swatches.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.brand = btn.dataset['color'] ?? state.brand;
      for (const b of els.swatches) b.classList.toggle('is-active', b === btn);
      if (els.colorInput) els.colorInput.value = state.brand;
      renderBuilder();
    });
  });
  els.colorInput?.addEventListener('input', () => {
    state.brand = els.colorInput?.value ?? state.brand;
    for (const b of els.swatches) b.classList.remove('is-active');
    renderBuilder();
  });

  els.shapeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.shape = (btn.dataset['shape'] as BuilderState['shape']) ?? 'circle';
      for (const b of els.shapeBtns) b.classList.toggle('is-active', b === btn);
      renderBuilder();
    });
  });
  els.iconBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.icon = (btn.dataset['icon'] as BuilderState['icon']) ?? 'accessibility';
      for (const b of els.iconBtns) b.classList.toggle('is-active', b === btn);
      renderBuilder();
    });
  });
  els.positionBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.position = (btn.dataset['position'] as BuilderState['position']) ?? 'bottom-right';
      for (const b of els.positionBtns) b.classList.toggle('is-active', b === btn);
      renderBuilder();
    });
  });
  els.platformBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.platform = (btn.dataset['platform'] as BuilderPlatform) ?? 'html';
      for (const b of els.platformBtns) {
        const isActive = b === btn;
        b.classList.toggle('is-active', isActive);
        b.setAttribute('aria-selected', String(isActive));
      }
      renderBuilder();
    });
  });
  els.storageKeyInput?.addEventListener('input', () => {
    state.storageKey = els.storageKeyInput?.value.trim() ?? '';
    renderBuilder();
  });
  els.darkToggle?.addEventListener('change', () => {
    state.dark = els.darkToggle?.checked ?? false;
    renderBuilder();
  });
  els.draggableToggle?.addEventListener('change', () => {
    state.draggable = els.draggableToggle?.checked ?? false;
    renderBuilder();
  });
  els.hideTriggerToggle?.addEventListener('change', () => {
    state.hideTrigger = els.hideTriggerToggle?.checked ?? false;
    renderBuilder();
  });
  els.profileChecks.forEach((cb) => {
    cb.addEventListener('change', () => {
      state.profiles = els.profileChecks.filter((c) => c.checked).map((c) => c.value);
      renderBuilder();
    });
  });
  els.localeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.locale = (btn.dataset['locale'] as BuilderLocale) ?? 'en';
      for (const b of els.localeBtns) b.classList.toggle('is-active', b === btn);
      if (els.otherLangNote) els.otherLangNote.hidden = state.locale !== 'other';
      renderBuilder();
    });
  });
  els.sectionChecks.forEach((cb) => {
    cb.addEventListener('change', () => {
      state.sections = els.sectionChecks.filter((c) => c.checked).map((c) => c.value);
      renderBuilder();
    });
  });
  // Event delegation on the container — rows are added/removed dynamically, so
  // per-row listeners would need constant rebinding.
  els.actionsContainer?.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('qc-action-label-input')) return;
    const row = target.closest('.qc-action-row') as HTMLElement | null;
    const index = row ? Number(row.dataset['index']) : -1;
    if (index >= 0 && state.actions[index]) {
      state.actions[index].label = (target as HTMLInputElement).value;
      renderBuilder();
    }
  });
  els.actionsContainer?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('qc-action-remove-btn')) return;
    const row = target.closest('.qc-action-row') as HTMLElement | null;
    const index = row ? Number(row.dataset['index']) : -1;
    if (index >= 0) {
      state.actions.splice(index, 1);
      renderActionRows();
      renderBuilder();
    }
  });
  els.addActionBtn?.addEventListener('click', () => {
    state.actions.push({ label: `Action ${state.actions.length + 1}` });
    renderActionRows();
    renderBuilder();
  });
  // Same icon-only .code-copy-btn behavior as the static Quick start snippets'
  // makeCopyButton() above — a brief background-color flip via .is-copied, no text
  // swap (there's no text on this button to swap).
  els.copyBtn?.addEventListener('click', async () => {
    const text = els.codeInner?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      els.copyBtn?.classList.add('is-copied');
      window.setTimeout(() => els.copyBtn?.classList.remove('is-copied'), 1400);
    } catch {
      // Clipboard API can be blocked (permissions, insecure context) — the code is
      // already selectable/visible in the <pre>, so this is a silent no-op fallback.
    }
  });

  renderActionRows();
  renderBuilder();
}

createBuilder(queryBuilderEls('qc-builder'));

// --- Install & Customize outer tab switch (Quick start <-> Customize) -------------
const qcTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.qc-tab'));
const qcPanels = Array.from(document.querySelectorAll<HTMLElement>('.qc-panel'));

function activateQcTab(name: string): void {
  for (const btn of qcTabButtons) {
    const isActive = btn.dataset['qcTab'] === name;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  }
  for (const panel of qcPanels) {
    const isActive = panel.id === `qc-panel-${name}`;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  }
}

for (const btn of qcTabButtons) {
  btn.addEventListener('click', () => activateQcTab(btn.dataset['qcTab'] ?? 'customize'));
}

// --- Install & Customize platform sub-tabs (Quick start panel) --------------------
const qcPlatformTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.qc-platform-tab'));
const qcPlatformPanels = Array.from(document.querySelectorAll<HTMLElement>('.qc-platform-panel'));

function activateQcPlatformTab(name: string): void {
  for (const btn of qcPlatformTabs) {
    const isActive = btn.dataset['qcPlatform'] === name;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  }
  for (const panel of qcPlatformPanels) {
    const isActive = panel.id === `qc-tab-${name}`;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  }
}

for (const btn of qcPlatformTabs) {
  btn.addEventListener('click', () => activateQcPlatformTab(btn.dataset['qcPlatform'] ?? 'html'));
}

// --- FAQ accordion -------------------------------------------------------------------
// One item open at a time — opening one collapses whichever else was open. The first
// item starts open (.is-open / aria-expanded="true" already set in the markup).
const faqItems = Array.from(document.querySelectorAll<HTMLElement>('[data-faq-item]'));

// The answer's open/close motion is a CSS max-height transition (see .faq-item-answer
// in style.css), animated to a real measured pixel value (--faq-answer-h) rather than
// the grid-template-rows: 0fr <-> 1fr trick this used to be — that forced a per-frame
// intrinsic-size recalculation that visibly hitched in some browsers. Not the [hidden]
// attribute either — [hidden] maps to display:none, which can't be transitioned.
// [hidden] is still applied, just deferred until the collapse animation finishes, so a
// closed answer stays out of the tab order and the accessibility tree.
const faqReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setFaqItemOpen(item: HTMLElement, isOpen: boolean): void {
  const head = item.querySelector<HTMLButtonElement>('.faq-item-head');
  const answer = item.querySelector<HTMLElement>('.faq-item-answer');
  head?.setAttribute('aria-expanded', String(isOpen));
  if (!answer) {
    item.classList.toggle('is-open', isOpen);
    return;
  }

  if (isOpen) {
    // Unhide + measure BEFORE toggling .is-open, since a [hidden] (display:none)
    // element always reports scrollHeight 0 — the transition target has to be the
    // real rendered content height, captured while it's actually laid out.
    answer.hidden = false;
    answer.style.setProperty('--faq-answer-h', `${answer.scrollHeight}px`);
  }
  item.classList.toggle('is-open', isOpen);

  if (isOpen) {
    // handled above
  } else if (faqReducedMotion) {
    answer.hidden = true;
  } else {
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== answer || event.propertyName !== 'max-height') return;
      answer.removeEventListener('transitionend', onTransitionEnd);
      if (!item.classList.contains('is-open')) answer.hidden = true;
    };
    answer.addEventListener('transitionend', onTransitionEnd);
  }
}

for (const item of faqItems) {
  item.querySelector('.faq-item-head')?.addEventListener('click', () => {
    const isOpen = item.classList.contains('is-open');
    for (const other of faqItems) setFaqItemOpen(other, other === item && !isOpen);
  });
  // The first item starts open in the markup (no JS ever ran setFaqItemOpen(true)
  // for it), so --faq-answer-h would otherwise fall back to the CSS default rather
  // than this item's real content height.
  if (item.classList.contains('is-open')) {
    const answer = item.querySelector<HTMLElement>('.faq-item-answer');
    answer?.style.setProperty('--faq-answer-h', `${answer.scrollHeight}px`);
  }
}

// --- Scroll-in reveal ---------------------------------------------------------------
// html.has-js is the switch that lets style.css hide .reveal/.reveal-left/.reveal-right
// elements pre-animation — added only here, so a JS failure (or reduced-motion users
// who never need the hidden state) can never leave content stuck invisible.
document.documentElement.classList.add('has-js');

const revealTargets = Array.from(document.querySelectorAll('.reveal, .reveal-left, .reveal-right'));

if (revealTargets.length > 0 && 'IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );
  for (const el of revealTargets) revealObserver.observe(el);
} else {
  for (const el of revealTargets) el.classList.add('is-visible');
}

// --- Profile card slider pause/play -------------------------------------------------
// Explicit toggle for the auto-scrolling profile card strip (#profiles-showcase), on
// top of the hover/focus-pause already in style.css — a keyboard-only visitor can't
// hover, and WCAG 2.2.2 requires any auto-moving content to have a way to stop it that
// doesn't depend on a pointer. prefers-reduced-motion visitors never see this button at
// all (style.css hides it — there's no animation running for it to control).
{
  const sliderTrack = document.getElementById('pt2-slider-track');
  const toggleBtn = document.getElementById('pt2-slider-toggle');
  const toggleIcon = document.getElementById('pt2-slider-toggle-icon');
  const toggleLabel = document.getElementById('pt2-slider-toggle-label');
  if (sliderTrack && toggleBtn && toggleIcon && toggleLabel) {
    const PAUSE_ICON = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
    const PLAY_ICON = '<path d="M7 4l13 8-13 8V4z"/>';
    toggleBtn.addEventListener('click', () => {
      const nowPaused = sliderTrack.classList.toggle('is-paused');
      toggleBtn.setAttribute('aria-pressed', String(nowPaused));
      toggleIcon.innerHTML = nowPaused ? PLAY_ICON : PAUSE_ICON;
      toggleLabel.textContent = nowPaused ? 'Play' : 'Pause';
    });
  }
}

