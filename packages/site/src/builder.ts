// Lazily loaded from main.ts (IntersectionObserver on #install-quickstart-v2) so
// @accesspath/core — the panel UI, all icons, i18n, and the WCAG scanner — is only
// parsed when a visitor actually scrolls to the "Install & Customize" builder, not on
// every page load. The two core stylesheets ride along in this chunk too; the real
// site widget (embed.js) injects its own copy of the effect CSS at runtime, so nothing
// above the builder depends on these imports.
import '@accesspath/core/styles/panel.css';
import '@accesspath/core/styles/a11y-effects.css';
import { createPanel, createTriggerButton, getState, applyClasses } from '@accesspath/core';
import type { PanelHandle, ProfileKey, CustomActionConfig } from '@accesspath/core';
import { highlightCode, flashCopied, COPY_ICON_SVG } from './code-ui';

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
  // Emit data-sections/sections whenever the selection differs from the default four in
  // any way — a subset, a reorder, or an extra like 'audit' (the opt-in dev checker).
  const sectionsFiltered = s.sections.length > 0 && s.sections.join(',') !== ALL_SECTION_KEYS.join(',');
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
    return `<script src="https://cdn.jsdelivr.net/npm/@accesspath/embed@0/dist/embed.js"\n${attrs.join('\n')}>\n</script>${otherNote}${hideTriggerNote}\n\n${CUSTOM_SECTIONS_NOTE_HTML}`;
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
  // Same icon-swap-to-checkmark behavior as the static Quick start snippets'
  // makeCopyButton() above, via the shared flashCopied() helper.
  els.copyBtn?.addEventListener('click', async () => {
    const text = els.codeInner?.textContent ?? '';
    const btn = els.copyBtn;
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(text);
      flashCopied(btn, COPY_ICON_SVG, 'Copy code');
    } catch {
      // Clipboard API can be blocked (permissions, insecure context) — the code is
      // already selectable/visible in the <pre>, so this is a silent no-op fallback.
    }
  });

  renderActionRows();
  renderBuilder();
}


export function initBuilder(): void {
  createBuilder(queryBuilderEls('qc-builder'));
}
