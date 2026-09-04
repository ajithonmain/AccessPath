import { A11yPrefs, ProfileKey } from './types';
import { PROFILES, PROFILE_COLORS } from './profiles';
import { AccessPathState } from './state';
import { resolveLabels, Labels, LocaleKey, LabelOverrides } from './i18n';
import { createFocusTrap } from './focus-trap';
import { isSpeechSupported, hasVoices, speak, stopSpeaking } from './tts';
import { scanHeadings } from './heading-scan';
import { lookupWord, showDictionaryPopover, resolveDictionaryPopover, closeDictionaryPopover } from './dictionary';
import { createHintTooltips } from './hint-tooltip';
import { enableTooltips, disableTooltips } from './tooltips';
import { createReadingGuide, ReadingGuideHandle } from './reading-guide';
import { createVoiceOver, getVoices, VoiceOverHandle, collectReadableText } from './voice-over';
import { applyBrandColor } from './brand-color';
import { saveDarkTheme, loadDarkTheme } from './panel-theme';
import { ScanResult } from './a11y-scanner';
import { openReportAndScan } from './report-page';
import { ACCESSPATH_LOGO_DATA_URI } from './logo';
import { createMuteSounds, MuteSoundsHandle } from './mute-sounds';
import { createVirtualKeyboard, VirtualKeyboardHandle } from './virtual-keyboard';
import { computeSmartContrast } from './smart-contrast';
import type { TriggerIconKey } from './trigger-button';
import {
  accessibilityBadgeIcon,
  accessibilityIcon,
  accessPathLogoIcon,
  bigCursorIcon,
  checkCircleIcon,
  chevronRightIcon,
  closeIcon,
  contrastIcon,
  dictionaryIcon,
  focusModeIcon,
  fontSizeIcon,
  hideImagesIcon,
  highlightLinksIcon,
  hoverIcon,
  infoIcon,
  invertIcon,
  lineHeightIcon,
  moonIcon,
  motionIcon,
  motorIcon,
  muteSoundsIcon,
  paletteIcon,
  panelSideIcon,
  profileIcon,
  readAloudIcon,
  resetIcon,
  saturationIcon,
  spacingIcon,
  sunIcon,
  tooltipsIcon,
  virtualKeyboardIcon,
} from './icons';

/** Label shown in the header and bound as the global open/close shortcut. Chrome and
 *  Firefox reserve Ctrl+U for "View Page Source" on Windows/Linux and can't be
 *  overridden — preventDefault() is called, but the browser may still win on those
 *  combinations. Works unreserved on macOS and in most other browsers. */
const SHORTCUT_LABEL = 'CTRL+U';

/** A host-defined button rendered in the drawer's "Actions" section. Clicking it never
 *  runs host code directly — it dispatches an `accesspath:action` CustomEvent (detail:
 *  { id }) on `container`, so embed/React/Angular consumers can all react the same way
 *  regardless of whether they can pass a real callback through their config surface. */
export interface CustomActionConfig {
  id: string;
  label: string;
  /** Defaults to a generic info glyph. Reuses TriggerIconKey (trigger-button.ts) rather
   *  than introducing a second icon-key type. */
  icon?: TriggerIconKey;
  ariaLabel?: string;
}

/** One of the 5 collapsible groups inside the "controls" macro section. */
export type ControlCategoryKey = 'vision' | 'content' | 'motion' | 'reading' | 'navigation';

const DEFAULT_CONTROL_CATEGORIES: ControlCategoryKey[] = ['vision', 'content', 'motion', 'reading', 'navigation'];

/** A top-level drawer section id. The built-in macro blocks, or a `customSections[i].id`.
 *  'audit' (the Accessibility Checker, see a11y-scanner.ts) is deliberately left out of
 *  DEFAULT_SECTION_ORDER below — it's a site-owner/developer diagnostic tool, not a
 *  visitor-facing preference, so it only renders when a host explicitly opts in via
 *  `sections`. */
export type SectionKey = 'profiles' | 'quick' | 'controls' | 'actions' | 'audit' | string;

const DEFAULT_SECTION_ORDER: SectionKey[] = ['profiles', 'quick', 'controls', 'actions'];

/** A host-supplied section rendered with the same collapsible chrome as the built-in
 *  categories. `render` is called once at construction — like renderHeadingList()'s
 *  one-shot pattern, it doesn't re-invoke on state changes. */
export interface CustomSectionConfig {
  id: string;
  title: string;
  description?: string;
  icon?: TriggerIconKey;
  render: (el: HTMLElement) => void;
}

export interface CreatePanelOptions {
  state: AccessPathState;
  isDarkTheme?: boolean;
  /** Restrict which preset profile buttons render. Defaults to all profiles. */
  profiles?: ProfileKey[];
  /** Which viewport edge the drawer slides in from. Defaults to 'right'. */
  side?: 'left' | 'right';
  /** Host page element the Page Structure Navigator scans for headings.
   *  Defaults to document.documentElement. Should match the element passed
   *  to applyClasses() as the "container". */
  container?: HTMLElement;
  /** Overrides the --ap-brand-* token set (docs/brand.md) via inline style directly on
   *  the panel root, instead of requiring the host page to set a global `:root` CSS
   *  variable. See applyBrandColor() in brand-color.ts for why inline beats a
   *  `<style>` block here. */
  brandColor?: string;
  /** Host-defined buttons rendered in their own "Actions" section. Omit to hide the
   *  section entirely. */
  actions?: CustomActionConfig[];
  /** Which top-level sections render, and in what order. Custom section ids (from
   *  `customSections`) can be interleaved anywhere in this array. Defaults to
   *  `['profiles', 'quick', 'controls', 'actions']`. Omitting a key hides it. */
  sections?: SectionKey[];
  /** Which of the 5 built-in categories render inside the 'controls' section, and in
   *  what order. Defaults to all 5. */
  controlCategories?: ControlCategoryKey[];
  /** Host-supplied sections, rendered with the same chrome as the built-in categories.
   *  Reference their `id` in `sections` to control where they land; omitted from
   *  `sections` entirely by default (append `customSections[i].id` to `sections`
   *  yourself to place one). */
  customSections?: CustomSectionConfig[];
  /** Bundled translation set for all panel text. Defaults to 'en'. */
  locale?: LocaleKey;
  /** Per-string overrides applied on top of the resolved `locale` bundle. */
  labels?: LabelOverrides;
  /** URL rendered as a plain "Report a Problem" link in the footer, next to Reset.
   *  Omit to hide it. Not a stateful pref — same 3-hop config pattern as brandColor. */
  reportUrl?: string;
}

export interface PanelHandle {
  /** Wrapper element — append this into your DOM. Do NOT pass it to applyClasses() —
   *  the panel's own chrome is deliberately frozen and never self-responds to the prefs
   *  it controls; only your host `container` should go to applyClasses(). See
   *  apply-classes.ts's doc comment and CLAUDE.md's "Non-obvious constraints" section. */
  root: HTMLElement;
  open(): void;
  close(): void;
  setDarkTheme(isDark: boolean): void;
  destroy(): void;
}

/** A pressable control with a shared active/pressed-state shape — used for the
 *  category card grid (individual toggles), the profile card grid, and switches. */
interface Toggleable {
  button: HTMLButtonElement;
}

function setActive(item: Toggleable, active: boolean): void {
  item.button.classList.toggle('act', active);
  item.button.setAttribute('aria-pressed', String(active));
}

function createCard(icon: Node, label: string, ariaLabel: string, hint: string | null, onClick: () => void): Toggleable {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'a11y-card';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', ariaLabel);
  if (hint) button.dataset.tip = hint;
  const iconWrap = document.createElement('span');
  iconWrap.className = 'a11y-card-icon';
  iconWrap.appendChild(icon);
  button.appendChild(iconWrap);
  const labelEl = document.createElement('span');
  labelEl.className = 'a11y-card-label';
  labelEl.textContent = label;
  button.appendChild(labelEl);
  button.addEventListener('click', onClick);
  return { button };
}

function cardGrid(cards: Toggleable[]): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'a11y-cards';
  grid.append(...cards.map((c) => c.button));
  return grid;
}

const ACTION_ICONS: Record<TriggerIconKey, () => SVGElement> = {
  accessibility: accessibilityIcon,
  motion: motionIcon,
  contrast: contrastIcon,
  spacing: spacingIcon,
  motor: motorIcon,
  badge: accessibilityBadgeIcon,
  logo: accessPathLogoIcon,
};

/** A plain click-fire card for host-defined actions — no aria-pressed/active-state
 *  sync since there's no persisted pref behind it, unlike createCard()'s toggles. */
function createActionCard(action: CustomActionConfig, container: HTMLElement): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'a11y-card';
  button.setAttribute('aria-label', action.ariaLabel ?? action.label);
  const iconWrap = document.createElement('span');
  iconWrap.className = 'a11y-card-icon';
  iconWrap.appendChild(action.icon ? ACTION_ICONS[action.icon]() : infoIcon());
  button.appendChild(iconWrap);
  const labelEl = document.createElement('span');
  labelEl.className = 'a11y-card-label';
  labelEl.textContent = action.label;
  button.appendChild(labelEl);
  button.addEventListener('click', () => {
    container.dispatchEvent(new CustomEvent('accesspath:action', { detail: { id: action.id }, bubbles: true }));
  });
  return button;
}

/** Profile preset card — icon in a profile-colored circle, label below. */
function createProfileCard(key: ProfileKey, label: string, applyAria: string, onClick: () => void): Toggleable {
  const colors = PROFILE_COLORS[key];
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'a11y-profile-card';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', applyAria);
  button.style.setProperty('--profile-accent', colors.accent);
  button.style.setProperty('--profile-soft', colors.soft);

  const dot = document.createElement('span');
  dot.className = 'a11y-profile-dot';
  dot.setAttribute('aria-hidden', 'true');

  const iconWrap = document.createElement('span');
  iconWrap.className = 'a11y-profile-icon';
  iconWrap.appendChild(key === 'dyslexia' ? dyslexiaGlyph() : profileIcon(key) ?? document.createElement('span'));

  const labelEl = document.createElement('span');
  labelEl.className = 'a11y-profile-label';
  labelEl.textContent = label;

  button.append(dot, iconWrap, labelEl);
  button.addEventListener('click', onClick);
  return { button };
}

function profileGrid(els: HTMLElement[]): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'a11y-profile-grid';
  grid.append(...els);
  return grid;
}

/** Attaches a popover menu to a profile card, with the card itself as the toggle —
 *  used for Color Blind so the specific simulation type can be picked right on the
 *  card, instead of a separate control elsewhere in the panel. The card's existing
 *  click handler (toggling the profile, set by createProfileCard) is left alone; this
 *  adds a second listener on the same button that also opens/closes the menu, so one
 *  click does both. The corner chevron is decorative only (aria-hidden, no listener
 *  of its own) — an earlier design gave it its own separate trigger button, which
 *  needed its own wrapping <div> as a grid item (since a <button> can't contain
 *  another interactive <button>); that wrapper stretched to the full grid-column
 *  width, but the card <button> inside it didn't reliably follow (a <button>'s
 *  width:auto shrinks to content even with display:flex/block overridden, unlike a
 *  plain <div>), so the trigger — positioned relative to the wider wrapper — floated
 *  off to the side of the visibly-narrower card. Making the whole card itself the one
 *  interactive control sidesteps that mismatch entirely: the chevron is a child of
 *  the card, positioned relative to the card's own real box, not a sibling's. */
/** Monotonic counter for generated element ids (category bodies, dropdown menus, the
 *  live-status region) — shared so ids never collide across multiple panel instances. */
let sectionIdSeq = 0;

function attachDropdownToCard<T extends string>(
  card: Toggleable,
  options: { value: T; label: string }[],
  onChange: (value: T) => void
): { el: HTMLElement; setValue: (value: T) => void } {
  let current = options[0].value;

  const wrap = document.createElement('div');
  wrap.className = 'a11y-profile-card-wrap';
  wrap.appendChild(card.button);

  const chevron = chevronRightIcon();
  chevron.classList.add('a11y-profile-card-dd-chevron');
  const indicator = document.createElement('span');
  indicator.className = 'a11y-profile-card-dd-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  indicator.appendChild(chevron);
  card.button.appendChild(indicator);
  card.button.setAttribute('aria-haspopup', 'listbox');
  card.button.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  const menuId = `accesspath-dd-${++sectionIdSeq}`;
  menu.id = menuId;
  menu.className = 'a11y-custom-select-menu a11y-profile-card-dd-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');
  // Associate the trigger with the menu it controls, not just aria-haspopup — a screen
  // reader user then knows the collapsed state maps to a specific, findable listbox.
  card.button.setAttribute('aria-controls', menuId);

  // composedPath(), not e.target — the panel can be mounted inside a Shadow DOM (the
  // embed script's shadow root), and a click event crossing that boundary gets its
  // target RETARGETED to the shadow host for any listener outside the shadow tree
  // (this document-level one included), so e.target would always appear to be
  // "outside" wrap regardless of what was actually clicked. composedPath() returns
  // the true, un-retargeted path and isn't affected by this.
  function onDocClick(e: MouseEvent): void {
    if (!e.composedPath().includes(wrap)) closeMenu();
  }
  function onDocKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    // Capture-phase, so stopping propagation here keeps this Escape from also reaching the
    // focus trap's own Escape handler (createFocusTrap) and closing the whole panel out from
    // under the menu — one Escape should close only the topmost thing, same as the statement
    // modal's own Escape handling below.
    e.stopPropagation();
    closeMenu();
  }
  function openMenu(): void {
    menu.hidden = false;
    wrap.classList.add('open');
    card.button.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onDocKeydown, true);
  }
  function closeMenu(): void {
    menu.hidden = true;
    wrap.classList.remove('open');
    card.button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onDocKeydown, true);
  }

  function renderMenu(): void {
    menu.innerHTML = '';
    for (const opt of options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'a11y-custom-select-option';
      item.setAttribute('role', 'option');
      const isActive = opt.value === current;
      item.classList.toggle('act', isActive);
      item.setAttribute('aria-selected', String(isActive));
      const lbl = document.createElement('span');
      lbl.textContent = opt.label;
      item.appendChild(lbl);
      if (isActive) item.appendChild(checkCircleIcon());
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        current = opt.value;
        onChange(opt.value);
        closeMenu();
        renderMenu();
      });
      menu.appendChild(item);
    }
  }

  // A second listener on the same button as createProfileCard's own click handler
  // (toggles the profile) — one click does both.
  card.button.addEventListener('click', () => {
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  renderMenu();
  wrap.append(menu);

  return {
    el: wrap,
    setValue(value: T): void {
      if (value === current) return;
      current = value;
      renderMenu();
    },
  };
}

/** Compact icon-switch row used in Quick Adjustments — icon, label, on/off switch. */
function switchRow(icon: Node, label: string, ariaLabel: string, onClick: () => void): { row: HTMLElement; toggle: Toggleable } {
  const row = document.createElement('div');
  row.className = 'a11y-qrow';

  const main = document.createElement('span');
  main.className = 'a11y-qrow-main';
  const iconWrap = document.createElement('span');
  iconWrap.className = 'a11y-qrow-icon';
  iconWrap.appendChild(icon);
  const labelEl = document.createElement('span');
  labelEl.className = 'a11y-qrow-label';
  labelEl.textContent = label;
  main.append(iconWrap, labelEl);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'a11y-switch';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-checked', 'false');
  button.setAttribute('aria-label', ariaLabel);
  const thumb = document.createElement('span');
  thumb.className = 'a11y-switch-thumb';
  button.appendChild(thumb);
  button.addEventListener('click', onClick);

  row.append(main, button);
  return { row, toggle: { button } };
}

function setSwitchActive(toggle: Toggleable, active: boolean): void {
  toggle.button.classList.toggle('act', active);
  toggle.button.setAttribute('aria-checked', String(active));
}

/** Percent-from-left position (0-100) of an <input type="range">'s current value within
 *  its min-max span — used to paint the WebKit fill gradient (see .a11y-range in
 *  panel.css), since that has to work the same for a 0-100 range (Contrast, Spacing,
 *  Line Height) and a -100-to-100 range centered on zero (Saturation). */
function rangePercent(input: HTMLInputElement): number {
  const min = Number(input.min);
  const max = Number(input.max);
  return ((Number(input.value) - min) / (max - min)) * 100;
}

/** Icon-slider row used in Quick Adjustments for a continuous value (Contrast, Spacing,
 *  Line Height, Saturation) — a real draggable/keyboard-operable native range input,
 *  not a styled toggle. Defaults to a plain 0-100 range; pass `min`/`max` for a
 *  different span (e.g. Saturation's -100 to 100, centered on zero). */
function rangeRow(
  icon: Node | null,
  label: string,
  ariaLabel: string,
  onInput: (value: number) => void,
  min = 0,
  max = 100
): { row: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement('div');
  row.className = icon ? 'a11y-qrow' : 'a11y-row';

  const main = document.createElement('span');
  main.className = 'a11y-qrow-main';
  if (icon) {
    const iconWrap = document.createElement('span');
    iconWrap.className = 'a11y-qrow-icon';
    iconWrap.appendChild(icon);
    main.appendChild(iconWrap);
  }
  const labelEl = document.createElement('span');
  labelEl.className = icon ? 'a11y-qrow-label' : 'a11y-lbl';
  labelEl.textContent = label;
  main.appendChild(labelEl);

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'a11y-range';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(Math.max(min, Math.min(max, 0)));
  input.setAttribute('aria-label', ariaLabel);
  input.style.setProperty('--val', String(rangePercent(input)));

  // Purely visual — the native range input already announces its own value to
  // screen readers as it's dragged/adjusted via keyboard, so this would double
  // up if it weren't hidden from the accessibility tree.
  const valueEl = document.createElement('span');
  valueEl.className = 'a11y-qrow-value';
  valueEl.setAttribute('aria-hidden', 'true');
  valueEl.textContent = `${input.value}%`;

  const controls = document.createElement('span');
  controls.className = 'a11y-qrow-controls';
  controls.append(input, valueEl);

  input.addEventListener('input', () => {
    input.style.setProperty('--val', String(rangePercent(input)));
    valueEl.textContent = `${input.value}%`;
    onInput(Number(input.value));
  });

  row.append(main, controls);
  return { row, input };
}

function setRangeValue(input: HTMLInputElement, value: number): void {
  const valueEl = input.parentElement?.querySelector<HTMLElement>('.a11y-qrow-value');
  if (valueEl) valueEl.textContent = `${value}%`;
  if (Number(input.value) === value) return;
  input.value = String(value);
  input.style.setProperty('--val', String(rangePercent(input)));
}

interface SegmentedControl<T extends string> {
  row: HTMLElement;
  buttons: Map<T, HTMLButtonElement>;
}

function segmentedRow<T extends string>(
  icon: Node | null,
  label: string,
  options: { value: T; label: string; ariaLabel?: string }[],
  onSelect: (value: T) => void
): SegmentedControl<T> {
  const row = document.createElement('div');
  row.className = icon ? 'a11y-qrow' : 'a11y-row';

  const main = document.createElement('span');
  main.className = 'a11y-qrow-main';
  if (icon) {
    const iconWrap = document.createElement('span');
    iconWrap.className = 'a11y-qrow-icon';
    iconWrap.appendChild(icon);
    main.appendChild(iconWrap);
  }
  const lbl = document.createElement('span');
  lbl.className = icon ? 'a11y-qrow-label' : 'a11y-lbl';
  lbl.textContent = label;
  main.appendChild(lbl);

  const seg = document.createElement('div');
  seg.className = 'a11y-seg';

  const buttons = new Map<T, HTMLButtonElement>();
  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'a11y-seg-btn';
    btn.textContent = opt.label;
    if (opt.ariaLabel) {
      btn.setAttribute('aria-label', opt.ariaLabel);
      btn.title = opt.ariaLabel;
    }
    btn.addEventListener('click', () => onSelect(opt.value));
    buttons.set(opt.value, btn);
    seg.appendChild(btn);
  }

  row.append(icon ? main : lbl, seg);
  return { row, buttons };
}

/** Icon-label row with a native <input type="color"> plus a text "clear" button —
 *  used for the Background/Text/Title color overrides. Native color input, no library,
 *  same rationale as every other icon in this codebase (docs/CLAUDE.md: SVG only). */
function colorPickerRow(
  icon: Node | null,
  label: string,
  clearLabel: string,
  onChange: (value: string | null) => void
): { row: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement('div');
  row.className = icon ? 'a11y-qrow' : 'a11y-row';

  const main = document.createElement('span');
  main.className = 'a11y-qrow-main';
  if (icon) {
    const iconWrap = document.createElement('span');
    iconWrap.className = 'a11y-qrow-icon';
    iconWrap.appendChild(icon);
    main.appendChild(iconWrap);
  }
  const labelEl = document.createElement('span');
  labelEl.className = icon ? 'a11y-qrow-label' : 'a11y-lbl';
  labelEl.textContent = label;
  main.appendChild(labelEl);

  const controls = document.createElement('span');
  controls.className = 'a11y-qrow-controls';

  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'a11y-color-input';
  input.value = '#ffffff';
  // Native <input type="color"> has no visible text of its own; the label span next to
  // it isn't a <label for> association, so screen readers get nothing without this.
  input.setAttribute('aria-label', label);
  input.addEventListener('input', () => onChange(input.value));

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'a11y-top-action';
  clearBtn.textContent = clearLabel;
  // Visible text is just "Default" (shared across all three rows) — keep it in the
  // accessible name (WCAG 2.5.3) but add which color it resets.
  clearBtn.setAttribute('aria-label', `${clearLabel} — ${label}`);
  clearBtn.addEventListener('click', () => onChange(null));

  controls.append(input, clearBtn);
  row.append(main, controls);
  return { row, input };
}

/** Top-level, always-expanded section (Profiles / Quick Adjustments) — a label row
 *  with an optional info icon and an optional right-aligned text action (e.g. Reset). */
function topSection(title: string, hint: string, contentEls: HTMLElement[], action?: { label: string; onClick: () => void }): HTMLElement {
  const section = document.createElement('div');
  section.className = 'a11y-top-section';

  const hdr = document.createElement('div');
  hdr.className = 'a11y-top-hdr';

  const left = document.createElement('span');
  left.className = 'a11y-top-title';
  left.textContent = title;
  const info = document.createElement('span');
  info.className = 'a11y-info-icon';
  info.dataset.tip = hint;
  info.setAttribute('aria-label', hint);
  info.setAttribute('tabindex', '0');
  info.setAttribute('role', 'button');
  info.appendChild(infoIcon());
  left.appendChild(info);

  hdr.appendChild(left);

  if (action) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'a11y-top-action';
    actionBtn.textContent = action.label;
    actionBtn.addEventListener('click', action.onClick);
    hdr.appendChild(actionBtn);
  }

  section.append(hdr, ...contentEls);
  return section;
}


/** Shared collapse/expand mechanism: seeds `aria-expanded` + the initial max-height,
 *  wires headerBtn's click to animate content open/closed, and returns a setter so a
 *  caller can also drive it programmatically (e.g. the footer's active-adjustments
 *  list auto-collapses itself once it empties). Every collapsible region in the panel
 *  — the "All Controls" categories, custom sections, and the footer's active-
 *  adjustments list — goes through this one function so they animate identically and
 *  a fix here (e.g. the "content taller than the old fixed cap" bug) covers all of
 *  them at once. */
function attachCollapse(
  headerBtn: HTMLButtonElement,
  content: HTMLElement,
  defaultExpanded = false
): { setExpanded: (next: boolean) => void } {
  headerBtn.setAttribute('aria-expanded', String(defaultExpanded));
  // 'none' (not a fixed px cap) when starting expanded — content that's already open
  // at construction needs no animation, and a fixed cap silently clips anything taller
  // than that cap (a tall customSections body, a category once its card grid wraps to
  // more rows on a narrow viewport, ...).
  content.style.maxHeight = defaultExpanded ? 'none' : '0px';

  function setExpanded(next: boolean): void {
    headerBtn.setAttribute('aria-expanded', String(next));
    if (next) {
      // Animate to the content's real height, then release the cap to 'none' once the
      // transition finishes so later content growth isn't clipped by a stale
      // measurement.
      content.style.maxHeight = `${content.scrollHeight}px`;
      content.addEventListener(
        'transitionend',
        () => {
          if (headerBtn.getAttribute('aria-expanded') === 'true') content.style.maxHeight = 'none';
        },
        { once: true }
      );
    } else {
      // maxHeight may currently be 'none' (fully released above) — a transition can't
      // animate from 'none', so first snap it to the real height, force a synchronous
      // reflow, then collapse to 0 so the transition still has a real starting value.
      content.style.maxHeight = `${content.scrollHeight}px`;
      void content.offsetHeight;
      content.style.maxHeight = '0px';
    }
  }

  headerBtn.addEventListener('click', () => setExpanded(headerBtn.getAttribute('aria-expanded') !== 'true'));

  return { setExpanded };
}

/** A collapsible "All Controls" category: icon box + title + description, chevron
 *  indicator, and a max-height-transitioned body so the collapse can animate (and be
 *  disabled entirely when the panel has a11y-no-motion applied — see panel.css). */
function createCategory(icon: Node, title: string, description: string, contentEls: HTMLElement[], defaultExpanded = false): HTMLElement {
  const category = document.createElement('div');
  category.className = 'a11y-category';

  const bodyId = `accesspath-category-${++sectionIdSeq}`;

  const titleId = `${bodyId}-title`;
  const descId = `${bodyId}-desc`;

  const headerBtn = document.createElement('button');
  headerBtn.type = 'button';
  headerBtn.className = 'a11y-category-hdr';
  headerBtn.setAttribute('aria-expanded', String(defaultExpanded));
  headerBtn.setAttribute('aria-controls', bodyId);
  // Name the button from the title alone; the longer "what's inside" blurb is a
  // description, not part of the name — otherwise a screen reader announces the two
  // run together ("Vision Invert colors, monochrome…") as one label.
  headerBtn.setAttribute('aria-labelledby', titleId);
  headerBtn.setAttribute('aria-describedby', descId);

  const iconBox = document.createElement('span');
  iconBox.className = 'a11y-category-icon-box';
  iconBox.appendChild(icon);

  const text = document.createElement('span');
  text.className = 'a11y-category-text';
  const titleEl = document.createElement('span');
  titleEl.className = 'a11y-category-title';
  titleEl.id = titleId;
  titleEl.textContent = title;
  const descEl = document.createElement('span');
  descEl.className = 'a11y-category-desc';
  descEl.id = descId;
  descEl.textContent = description;
  text.append(titleEl, descEl);

  const chevron = document.createElement('span');
  chevron.className = 'a11y-category-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.appendChild(chevronRightIcon());

  headerBtn.append(iconBox, text, chevron);

  const inner = document.createElement('div');
  inner.className = 'a11y-category-body-inner';
  inner.append(...contentEls);

  const content = document.createElement('div');
  content.id = bodyId;
  content.className = 'a11y-category-body';
  content.appendChild(inner);

  attachCollapse(headerBtn, content, defaultExpanded);

  category.append(headerBtn, content);
  return category;
}

/** Builds the panel's DOM from scratch (createElement-based, no template engine) so it
 *  can be reused by the embed script and the React/Angular wrappers alike. */
export function createPanel(opts: CreatePanelOptions): PanelHandle {
  const { state } = opts;
  const profileKeys = opts.profiles ?? (Object.keys(PROFILES) as ProfileKey[]);
  if (opts.side) state.seedSideIfUnset(opts.side);
  const container = opts.container ?? document.documentElement;
  const L: Labels = resolveLabels(opts.locale, opts.labels);

  const root = document.createElement('div');
  root.className = 'accesspath-panel';
  if (opts.brandColor) applyBrandColor(root, opts.brandColor);

  const backdrop = document.createElement('div');
  backdrop.className = 'a11y-bd';
  backdrop.addEventListener('click', () => state.close());

  const pnl = document.createElement('div');
  pnl.className = state.side === 'left' ? 'a11y-pnl a11y-pnl--left' : 'a11y-pnl';
  pnl.setAttribute('role', 'dialog');
  pnl.setAttribute('aria-modal', 'true');
  pnl.setAttribute('aria-label', L.header.dialogAria);
  pnl.addEventListener('click', (e) => e.stopPropagation());

  // Polite live region for changes a screen reader wouldn't otherwise hear: applying or
  // clearing a profile (flips several prefs at once), Reset, and the audit scan finishing.
  // Per-control toggles already announce via their own aria-pressed, so they don't go here.
  const liveRegion = document.createElement('div');
  liveRegion.id = `accesspath-status-${++sectionIdSeq}`;
  liveRegion.className = 'a11y-sr-only';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  pnl.appendChild(liveRegion);
  let announceTimer: ReturnType<typeof setTimeout> | undefined;
  function announce(msg: string): void {
    // Clear first so re-announcing the same string (e.g. toggling one profile twice) still
    // fires a fresh live-region update.
    liveRegion.textContent = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { liveRegion.textContent = msg; }, 60);
  }
  // A previously-chosen theme (via the header switch below) permanently overrides the
  // isDarkTheme option on future mounts — same precedent as loadTriggerPosition()
  // overriding the position option once a visitor has dragged the trigger.
  if (loadDarkTheme(state.storageKey) ?? opts.isDarkTheme ?? false) pnl.classList.add('dark');

  // Header — single gradient band: title (+ shortcut hint) left, theme switch + close X right
  const hdr = document.createElement('div');
  hdr.className = 'a11y-hdr';
  const title = document.createElement('span');
  title.className = 'a11y-hdr-title';
  title.textContent = L.header.title;
  const shortcutHint = document.createElement('span');
  shortcutHint.className = 'a11y-hdr-shortcut';
  shortcutHint.textContent = L.header.shortcutSuffix(SHORTCUT_LABEL);
  title.appendChild(shortcutHint);

  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.className = 'a11y-theme-btn';
  function updateThemeBtn(): void {
    const isDark = pnl.classList.contains('dark');
    themeBtn.innerHTML = '';
    themeBtn.appendChild(isDark ? sunIcon() : moonIcon());
    themeBtn.setAttribute('aria-label', isDark ? L.header.themeToggle.toLight : L.header.themeToggle.toDark);
  }
  themeBtn.addEventListener('click', () => {
    const next = !pnl.classList.contains('dark');
    pnl.classList.toggle('dark', next);
    saveDarkTheme(state.storageKey, next);
    updateThemeBtn();
  });
  updateThemeBtn();

  const sideBtn = document.createElement('button');
  sideBtn.type = 'button';
  sideBtn.className = 'a11y-side-btn';
  function updateSideBtn(): void {
    sideBtn.innerHTML = '';
    sideBtn.appendChild(panelSideIcon(state.side));
    sideBtn.setAttribute(
      'aria-label',
      state.side === 'left' ? L.header.sideToggle.toRight : L.header.sideToggle.toLeft
    );
  }
  sideBtn.addEventListener('click', () => state.setSide(state.side === 'left' ? 'right' : 'left'));
  updateSideBtn();

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'a11y-close-btn';
  closeBtn.setAttribute('aria-label', L.header.closeAria);
  closeBtn.appendChild(closeIcon());
  closeBtn.addEventListener('click', () => state.close());

  const hdrActions = document.createElement('div');
  hdrActions.className = 'a11y-hdr-actions';
  hdrActions.append(sideBtn, themeBtn, closeBtn);

  hdr.append(title, hdrActions);

  // Body (scrollable)
  const body = document.createElement('div');
  body.className = 'a11y-body';

  // Accessibility Profiles — 2-column card grid, each icon in a profile-colored circle.
  // The Color Blind card doubles as the toggle for a dropdown menu (attachDropdownToCard)
  // so the specific simulation type can be picked right there, instead of a separate
  // control elsewhere in the panel — one click on the card both toggles the profile
  // (as usual) and opens/closes the menu.
  const profilePills = new Map<ProfileKey, Toggleable>();
  const profileGridEls: HTMLElement[] = [];
  let colorBlindSimSelect: { setValue: (value: A11yPrefs['colorBlindSim']) => void } | null = null;
  for (const key of profileKeys) {
    // Color Blind doesn't apply the generic profile-preset bundle (PROFILES.colorblind)
    // on click like every other card — its whole effect is the simulation type picked
    // in its dropdown (colorBlindSim), so clicking the card only opens/closes that
    // menu (wired below via attachDropdownToCard) rather than also toggling a preset.
    const card = createProfileCard(
      key,
      L.profiles.names[key],
      L.profiles.applyAria(L.profiles.names[key]),
      key === 'colorblind'
        ? () => {}
        : () => {
            state.applyProfile(key);
            const name = L.profiles.names[key];
            announce(
              state.activeProfiles.includes(key)
                ? L.announce.profileOn(name)
                : L.announce.profileOff(name),
            );
          },
    );
    profilePills.set(key, card);
    if (key === 'colorblind') {
      const attached = attachDropdownToCard<A11yPrefs['colorBlindSim']>(
        card,
        [
          { value: 'none', label: L.vision.colorBlindSim.none },
          { value: 'protanopia', label: L.vision.colorBlindSim.protanopia },
          { value: 'deuteranopia', label: L.vision.colorBlindSim.deuteranopia },
          { value: 'tritanopia', label: L.vision.colorBlindSim.tritanopia },
          { value: 'achromatopsia', label: L.vision.colorBlindSim.achromatopsia },
        ],
        (val) => state.setColorBlindSim(val)
      );
      colorBlindSimSelect = attached;
      profileGridEls.push(attached.el);
    } else {
      profileGridEls.push(card.button);
    }
  }
  const profilesSection = topSection(
    L.profiles.title,
    L.profiles.hint,
    [profileGrid(profileGridEls)],
    { label: L.profiles.reset, onClick: () => doReset() }
  );

  // Quick Adjustments — icon + label + control, the fastest path to the most-used settings
  const fontSizeRange = rangeRow(fontSizeIcon(), L.quick.textSize.label, L.quick.textSize.aria, (v) =>
    state.setFontSizeLevel(v)
  );
  const contrastRange = rangeRow(contrastIcon(), L.quick.contrast.label, L.quick.contrast.aria, (v) => state.setContrastLevel(v));
  const spacingRange = rangeRow(spacingIcon(), L.quick.spacing.label, L.quick.spacing.aria, (v) => state.setSpacingLevel(v));
  const lineHeightRange = rangeRow(lineHeightIcon(), L.quick.lineHeight.label, L.quick.lineHeight.aria, (v) =>
    state.setLineHeightLevel(v)
  );
  const saturationRange = rangeRow(
    saturationIcon(),
    L.quick.saturation.label,
    L.quick.saturation.aria,
    (v) => state.setSaturationLevel(v),
    -100,
    100
  );
  const motionSwitchRow = switchRow(motionIcon(), L.quick.pauseAnimations.label, L.quick.pauseAnimations.aria, () =>
    state.toggle('reduceMotion')
  );
  const quickSection = topSection(L.quick.title, L.quick.hint, [
    fontSizeRange.row,
    contrastRange.row,
    spacingRange.row,
    lineHeightRange.row,
    saturationRange.row,
    motionSwitchRow.row,
  ]);

  // ── All Controls — grouped by user need, each an expandable category ──

  // Vision
  const invertCard = createCard(
    invertIcon(),
    L.vision.invertColors.label,
    L.vision.invertColors.aria,
    L.vision.invertColors.hint,
    () => state.toggle('invertColors')
  );
  const monochromeCard = createCard(
    saturationIcon(),
    L.vision.monochrome.label,
    L.vision.monochrome.aria,
    L.vision.monochrome.hint,
    () => state.toggle('monochrome')
  );
  const contrastModeSeg = segmentedRow<A11yPrefs['contrastMode']>(
    contrastIcon(),
    L.vision.contrastMode.label,
    [
      { value: 'default', label: L.vision.contrastMode.default },
      { value: 'light', label: L.vision.contrastMode.light },
      { value: 'dark', label: L.vision.contrastMode.dark },
      { value: 'high', label: L.vision.contrastMode.high },
      { value: 'smart', label: L.vision.contrastMode.smart },
    ],
    (val) => {
      state.setContrastMode(val);
      if (val === 'smart') {
        const { bgColor, textColor } = computeSmartContrast(container);
        state.setBgColor(bgColor);
        state.setTextColor(textColor);
      }
    }
  );
  const visionCategory = createCategory(contrastIcon(), L.vision.title, L.vision.desc, [
    cardGrid([invertCard, monochromeCard]),
    contrastModeSeg.row,
  ]);

  // Text & Content
  const contentFontSizeRange = rangeRow(null, L.quick.textSize.label, L.quick.textSize.aria, (v) =>
    state.setFontSizeLevel(v)
  );
  const dyslexiaCard = createCard(
    dyslexiaGlyph(),
    L.content.dyslexia.label,
    L.content.dyslexia.aria,
    L.content.dyslexia.hint,
    () => state.toggle('dyslexia')
  );
  const tooltipsCard = createCard(
    tooltipsIcon(),
    L.content.tooltips.label,
    L.content.tooltips.aria,
    L.content.tooltips.hint,
    () => state.toggle('showTooltips')
  );
  const bgColorRow = colorPickerRow(paletteIcon(), L.content.bgColor.label, L.content.colorDefault, (val) =>
    state.setBgColor(val)
  );
  const textColorRow = colorPickerRow(paletteIcon(), L.content.textColor.label, L.content.colorDefault, (val) =>
    state.setTextColor(val)
  );
  const titleColorRow = colorPickerRow(paletteIcon(), L.content.titleColor.label, L.content.colorDefault, (val) =>
    state.setTitleColor(val)
  );
  const textCategory = createCategory(fontSizeIcon(), L.content.title, L.content.desc, [
    contentFontSizeRange.row,
    cardGrid([dyslexiaCard, tooltipsCard]),
    bgColorRow.row,
    textColorRow.row,
    titleColorRow.row,
  ]);

  // Motion
  const motionCard = createCard(
    motionIcon(),
    L.motion.pauseAnimations.label,
    L.motion.pauseAnimations.aria,
    L.motion.pauseAnimations.hint,
    () => state.toggle('reduceMotion')
  );
  const muteSoundsCard = createCard(
    muteSoundsIcon(),
    L.motion.muteSounds.label,
    L.motion.muteSounds.aria,
    L.motion.muteSounds.hint,
    () => state.toggle('muteSounds')
  );
  let muteSoundsHandle: MuteSoundsHandle | null = null;
  function syncMuteSounds(): void {
    const on = state.prefs.muteSounds;
    if (on && !muteSoundsHandle) {
      muteSoundsHandle = createMuteSounds(container);
    } else if (!on && muteSoundsHandle) {
      muteSoundsHandle.destroy();
      muteSoundsHandle = null;
    }
  }
  const motionCategory = createCategory(motionIcon(), L.motion.title, L.motion.desc, [
    cardGrid([motionCard, muteSoundsCard]),
  ]);

  // Reading
  let isSpeaking = false;
  // Shown to the *visitor* if Read Aloud / Voice Over produced no sound, with guidance
  // matched to the likely cause (no installed voice / Brave Shields / generic block).
  const speechNote = document.createElement('p');
  speechNote.className = 'a11y-inline-hint a11y-inline-hint--warn';
  speechNote.hidden = true;
  speechNote.appendChild(readAloudIcon());
  const speechNoteText = document.createElement('span');
  speechNote.appendChild(speechNoteText);
  let braveDetected = false;
  (navigator as unknown as { brave?: { isBrave?: () => Promise<boolean> } })
    .brave?.isBrave?.()
    .then((b) => { braveDetected = b; })
    .catch(() => {});
  function showSpeechNote(): void {
    speechNoteText.textContent =
      (!hasVoices()
        ? L.reading.speechNoVoice
        : braveDetected
          ? L.reading.speechBrave
          : L.reading.speechBlocked) || L.reading.speechBlocked;
    speechNote.hidden = false;
  }
  const readAloudCard = createCard(
    readAloudIcon(),
    L.reading.readAloud.label,
    L.reading.readAloud.aria,
    isSpeechSupported() ? L.reading.readAloud.hintSupported : L.reading.readAloud.hintUnsupported,
    () => {
      if (isSpeaking) {
        stopSpeaking();
        isSpeaking = false;
        updateReadAloudCard();
      } else {
        speechNote.hidden = true;
        const selected = window.getSelection()?.toString().trim();
        // With nothing selected, prefer the page's <main> so it doesn't start by
        // reading the nav/header aloud; fall back to the whole container.
        const readTarget = container.querySelector<HTMLElement>('main') ?? container;
        const text = selected && selected.length > 0 ? selected : collectReadableText(readTarget);
        isSpeaking = true;
        updateReadAloudCard();
        speak(
          text,
          {
            rateLevel: state.prefs.voiceRateLevel,
            pitchLevel: state.prefs.voicePitchLevel,
            voiceURI: state.prefs.voiceURI,
          },
          () => {
            isSpeaking = false;
            updateReadAloudCard();
          },
          () => {
            isSpeaking = false;
            updateReadAloudCard();
            showSpeechNote();
          }
        );
      }
    }
  );
  if (!isSpeechSupported()) readAloudCard.button.disabled = true;
  function updateReadAloudCard(): void {
    const label = readAloudCard.button.querySelector('.a11y-card-label');
    if (label) label.textContent = isSpeaking ? L.reading.readAloud.stopLabel : L.reading.readAloud.label;
    setActive(readAloudCard, isSpeaking);
  }
  // Armed only by an actual click on the Voice Over card — never by a page-load
  // restore (voice-over.ts defers speech to the next gesture in that case, so a
  // watchdog would false-fire and show the note for no reason).
  let voiceOverJustClicked = false;
  const voiceOverCard = createCard(
    readAloudIcon(),
    L.reading.voiceOver.label,
    L.reading.voiceOver.aria,
    isSpeechSupported() ? L.reading.voiceOver.hint : L.reading.readAloud.hintUnsupported,
    () => {
      speechNote.hidden = true;
      if (!state.prefs.voiceOver) voiceOverJustClicked = true;
      state.toggle('voiceOver');
    }
  );
  if (!isSpeechSupported()) voiceOverCard.button.disabled = true;
  let voiceOverHandle: VoiceOverHandle | null = null;
  function syncVoiceOver(): void {
    const on = state.prefs.voiceOver;
    if (on && !voiceOverHandle) {
      if (voiceOverJustClicked && isSpeechSupported()) {
        window.setTimeout(() => {
          if (state.prefs.voiceOver && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
            showSpeechNote();
          }
        }, 1800);
      }
      voiceOverJustClicked = false;
      voiceOverHandle = createVoiceOver(
        container,
        {
          play: L.reading.voiceOver.play,
          pause: L.reading.voiceOver.pause,
          restart: L.reading.voiceOver.restart,
          stop: L.reading.voiceOver.stop,
          nav: L.reading.voiceOver.nav,
          roleLink: L.reading.voiceOver.roleLink,
          roleButton: L.reading.voiceOver.roleButton,
          roleField: L.reading.voiceOver.roleField,
        },
        () => state.toggle('voiceOver'),
        () => ({
          rateLevel: state.prefs.voiceRateLevel,
          pitchLevel: state.prefs.voicePitchLevel,
          voiceURI: state.prefs.voiceURI,
        })
      );
    } else if (!on && voiceOverHandle) {
      voiceOverHandle.destroy();
      voiceOverHandle = null;
    }
  }

  // Voice Over tuning — speech rate/pitch sliders + a native <select> voice picker.
  // Applied to every utterance via the getSettings() callback above, so changes take
  // effect from the next spoken block without restarting the reader.
  const voiceRateRange = rangeRow(
    null,
    L.reading.voiceOver.rate.label,
    L.reading.voiceOver.rate.aria,
    (v) => state.setVoiceRateLevel(v)
  );
  const voicePitchRange = rangeRow(
    null,
    L.reading.voiceOver.pitch.label,
    L.reading.voiceOver.pitch.aria,
    (v) => state.setVoicePitchLevel(v)
  );
  const voiceSelectRow = document.createElement('div');
  voiceSelectRow.className = 'a11y-row';
  const voiceSelectLabel = document.createElement('span');
  voiceSelectLabel.className = 'a11y-lbl';
  voiceSelectLabel.textContent = L.reading.voiceOver.voice.label;
  const voiceSelect = document.createElement('select');
  voiceSelect.className = 'a11y-voice-select';
  voiceSelect.setAttribute('aria-label', L.reading.voiceOver.voice.aria);
  voiceSelect.addEventListener('change', () => state.setVoiceURI(voiceSelect.value || null));
  voiceSelectRow.append(voiceSelectLabel, voiceSelect);
  function populateVoices(): void {
    const selected = state.prefs.voiceURI ?? '';
    voiceSelect.replaceChildren();
    const def = document.createElement('option');
    def.value = '';
    def.textContent = L.reading.voiceOver.voice.default;
    voiceSelect.appendChild(def);
    for (const v of getVoices()) {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      voiceSelect.appendChild(opt);
    }
    voiceSelect.value = selected;
  }
  populateVoices();
  if (isSpeechSupported()) {
    window.speechSynthesis.addEventListener('voiceschanged', populateVoices);
  } else {
    voiceRateRange.input.disabled = true;
    voicePitchRange.input.disabled = true;
    voiceSelect.disabled = true;
  }

  const highlightLinksCard = createCard(
    highlightLinksIcon(),
    L.reading.highlightLinks.label,
    L.reading.highlightLinks.aria,
    L.reading.highlightLinks.hint,
    () => state.toggle('highlightLinks')
  );
  const hideImagesCard = createCard(
    hideImagesIcon(),
    L.reading.hideImages.label,
    L.reading.hideImages.aria,
    L.reading.hideImages.hint,
    () => state.toggle('hideImages')
  );
  const bigCursorCard = createCard(
    bigCursorIcon(),
    L.reading.bigCursor.label,
    L.reading.bigCursor.aria,
    L.reading.bigCursor.hint,
    () => state.toggle('bigCursor')
  );
  const highlightTitlesCard = createCard(
    headingGlyph(),
    L.reading.highlightTitles.label,
    L.reading.highlightTitles.aria,
    L.reading.highlightTitles.hint,
    () => state.toggle('highlightTitles')
  );
  const highlightHoverCard = createCard(
    hoverIcon(),
    L.reading.highlightHover.label,
    L.reading.highlightHover.aria,
    L.reading.highlightHover.hint,
    () => state.toggle('highlightHover')
  );
  const highlightFocusCard = createCard(
    focusModeIcon(),
    L.reading.highlightFocus.label,
    L.reading.highlightFocus.aria,
    L.reading.highlightFocus.hint,
    () => state.toggle('highlightFocus')
  );
  const cursorColorSeg = segmentedRow<A11yPrefs['cursorColor']>(
    null,
    L.reading.cursorColor.label,
    [
      { value: 'black', label: L.reading.cursorColor.black },
      { value: 'white', label: L.reading.cursorColor.white },
    ],
    (val) => state.setCursorColor(val)
  );
  const textAlignSeg = segmentedRow<A11yPrefs['textAlign']>(
    null,
    L.reading.textAlign.label,
    [
      { value: 'default', label: L.reading.textAlign.default },
      { value: 'left', label: L.reading.textAlign.left },
      { value: 'center', label: L.reading.textAlign.center },
      { value: 'right', label: L.reading.textAlign.right },
    ],
    (val) => state.setTextAlign(val)
  );
  const dictionaryCard = createCard(
    dictionaryIcon(),
    L.reading.dictionary.label,
    L.reading.dictionary.aria,
    L.reading.dictionary.hint,
    () => state.toggle('dictionaryEnabled')
  );
  // Shown under the card grid whenever Dictionary is on, so a visitor actually knows
  // the interaction is "double-click a word on the page".
  const dictionaryHint = document.createElement('p');
  dictionaryHint.className = 'a11y-inline-hint';
  dictionaryHint.hidden = true;
  dictionaryHint.appendChild(dictionaryIcon());
  const dictionaryHintText = document.createElement('span');
  dictionaryHintText.textContent = L.reading.dictionary.activeHint;
  dictionaryHint.appendChild(dictionaryHintText);
  const dictLabels = {
    lookingUp: L.reading.dictionary.lookingUp,
    noDefinition: L.reading.dictionary.noDefinition,
    timedOut: L.reading.dictionary.timedOut,
  };
  let dictAttached = false;
  function onWordDblClick(): void {
    const word = window.getSelection()?.toString().trim();
    if (!word || /\s/.test(word)) return;
    const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null;
    const anchorRect = range?.getBoundingClientRect();
    if (!anchorRect) return;
    showDictionaryPopover(root, word, anchorRect, dictLabels);
    lookupWord(word).then((result) => resolveDictionaryPopover(word, result, dictLabels));
  }
  function syncDictionaryListener(): void {
    const on = state.prefs.dictionaryEnabled;
    dictionaryHint.hidden = !on;
    if (on && !dictAttached) {
      container.addEventListener('dblclick', onWordDblClick);
      dictAttached = true;
    } else if (!on && dictAttached) {
      container.removeEventListener('dblclick', onWordDblClick);
      dictAttached = false;
      closeDictionaryPopover();
    }
  }
  let vkbHandle: VirtualKeyboardHandle | null = null;
  function closeVirtualKeyboard(): void {
    vkbHandle?.destroy();
    vkbHandle = null;
    updateVirtualKeyboardRow();
  }
  const virtualKeyboardRow = switchRow(
    virtualKeyboardIcon(),
    L.reading.virtualKeyboard.label,
    L.reading.virtualKeyboard.aria,
    () => {
      if (vkbHandle) {
        closeVirtualKeyboard();
      } else {
        vkbHandle = createVirtualKeyboard(closeVirtualKeyboard);
        updateVirtualKeyboardRow();
      }
    }
  );
  function updateVirtualKeyboardRow(): void {
    setSwitchActive(virtualKeyboardRow.toggle, vkbHandle !== null);
  }

  const readingCategory = createCategory(readAloudIcon(), L.reading.title, L.reading.desc, [
    cardGrid([
      readAloudCard,
      voiceOverCard,
      dictionaryCard,
      highlightLinksCard,
      highlightTitlesCard,
      highlightHoverCard,
      highlightFocusCard,
      hideImagesCard,
      bigCursorCard,
    ]),
    speechNote,
    dictionaryHint,
    voiceRateRange.row,
    voicePitchRange.row,
    voiceSelectRow,
    cursorColorSeg.row,
    textAlignSeg.row,
    virtualKeyboardRow.row,
  ]);

  // Navigation & Focus — read-only heading list (jump-to) + Reading Guide overlay
  const headingList = document.createElement('div');
  headingList.className = 'a11y-heading-list';
  function renderHeadingList(): void {
    headingList.innerHTML = '';
    const headings = scanHeadings(container);
    if (headings.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'a11y-heading-empty';
      empty.textContent = L.navigation.noHeadings;
      headingList.appendChild(empty);
      return;
    }
    for (const heading of headings) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `a11y-heading-item a11y-heading-h${heading.level}`;
      btn.title = L.navigation.jumpToHeading(heading.text);
      const level = document.createElement('span');
      level.className = 'a11y-heading-level';
      level.textContent = `H${heading.level}`;
      level.setAttribute('aria-hidden', 'true');
      btn.appendChild(level);
      const text = document.createElement('span');
      text.className = 'a11y-heading-text';
      text.textContent = heading.text;
      btn.appendChild(text);
      const chevron = document.createElement('span');
      chevron.className = 'a11y-heading-chevron';
      chevron.appendChild(chevronRightIcon());
      btn.appendChild(chevron);
      btn.addEventListener('click', () => {
        if (!heading.el.hasAttribute('tabindex')) heading.el.setAttribute('tabindex', '-1');
        heading.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        heading.el.focus({ preventScroll: true });
      });
      headingList.appendChild(btn);
    }
  }
  renderHeadingList();
  const readingGuideCard = createCard(
    focusModeIcon(),
    L.navigation.readingGuide.label,
    L.navigation.readingGuide.aria,
    L.navigation.readingGuide.hint,
    () => state.toggle('readingGuide')
  );
  let readingGuideHandle: ReadingGuideHandle | null = null;
  function syncReadingGuide(): void {
    const on = state.prefs.readingGuide;
    if (on && !readingGuideHandle) {
      readingGuideHandle = createReadingGuide();
    } else if (!on && readingGuideHandle) {
      readingGuideHandle.destroy();
      readingGuideHandle = null;
    }
  }
  const navFocusCategory = createCategory(focusModeIcon(), L.navigation.title, L.navigation.desc, [
    cardGrid([readingGuideCard]),
    headingList,
  ]);

  // Tooltips — one-time scan on toggle, not a live MutationObserver (same limitation as
  // the heading scan above: host DOM changes after enabling won't be picked up until
  // toggled off and back on).
  let tooltipsWereOn = state.prefs.showTooltips;
  function syncTooltips(): void {
    const on = state.prefs.showTooltips;
    if (on && !tooltipsWereOn) enableTooltips(container);
    if (!on && tooltipsWereOn) disableTooltips(container);
    tooltipsWereOn = on;
  }

  const allControlsHdr = document.createElement('div');
  allControlsHdr.className = 'a11y-top-hdr a11y-top-hdr--plain';
  const allControlsTitle = document.createElement('span');
  allControlsTitle.className = 'a11y-top-title';
  allControlsTitle.textContent = L.allControlsTitle;
  allControlsHdr.appendChild(allControlsTitle);

  const CATEGORY_ELS: Record<ControlCategoryKey, HTMLElement> = {
    vision: visionCategory,
    content: textCategory,
    motion: motionCategory,
    reading: readingCategory,
    navigation: navFocusCategory,
  };
  const categoriesWrap = document.createElement('div');
  categoriesWrap.className = 'a11y-categories';
  categoriesWrap.append(...(opts.controlCategories ?? DEFAULT_CONTROL_CATEGORIES).map((k) => CATEGORY_ELS[k]));

  const allControlsSection = document.createElement('div');
  allControlsSection.className = 'a11y-top-section';
  allControlsSection.append(allControlsHdr, categoriesWrap);

  // Actions — host-defined buttons (opts.actions), omitted entirely when unset.
  const actionsSection = opts.actions?.length
    ? topSection(L.actions.title, L.actions.hint, [
        cardGrid(opts.actions.map((a) => ({ button: createActionCard(a, container) }))),
      ])
    : null;

  // Accessibility Checker — runs entirely on-device (a11y-scanner.ts, no third-party
  // engine). Clicking "Scan Page" immediately opens a full-viewport in-page overlay
  // (report-page.ts's openReportAndScan(), an iframe mounted at document.documentElement
  // — not a new browser tab, see that file's comment for why), which shows a live
  // progress loader while this window drives the actual scan and streams per-rule
  // progress into it — the overlay's iframe has no access to the host page's DOM
  // itself, so it can't run the scan on its own. The in-panel area only shows a
  // compact summary once that finishes; it never renders the check-by-check
  // breakdown itself — the small drawer has no room to do that justice.
  const auditResults = document.createElement('div');
  auditResults.className = 'a11y-audit-results';
  type AuditState = { kind: 'idle' } | { kind: 'scanning' } | { kind: 'error' } | { kind: 'done'; result: ScanResult };
  let auditState: AuditState = { kind: 'idle' };

  function renderAuditResults(): void {
    auditResults.innerHTML = '';
    if (auditState.kind === 'idle' || auditState.kind === 'scanning' || auditState.kind === 'error') {
      const msg = document.createElement('p');
      msg.className = 'a11y-audit-empty';
      msg.textContent =
        auditState.kind === 'scanning' ? L.audit.scanning : auditState.kind === 'error' ? L.audit.scanFailed : L.audit.idleHint;
      auditResults.appendChild(msg);
      return;
    }

    const { result } = auditState;
    const summary = document.createElement('p');
    summary.className = 'a11y-audit-summary';
    summary.textContent = L.audit.summary(result.failCount, result.passCount, result.notApplicableCount);
    auditResults.appendChild(summary);

    const checkedLine = document.createElement('p');
    checkedLine.className = 'a11y-audit-checked';
    checkedLine.textContent = L.audit.checkedCount(result.checkedElementCount);
    auditResults.appendChild(checkedLine);
  }
  renderAuditResults();

  async function runAudit(): Promise<void> {
    auditState = { kind: 'scanning' };
    renderAuditResults();
    try {
      const result = await openReportAndScan(container, {
        pageTitle: document.title || location.hostname,
        pageUrl: location.href,
        brandColor: opts.brandColor,
      });
      auditState = { kind: 'done', result };
    } catch {
      auditState = { kind: 'error' };
    }
    renderAuditResults();
  }

  const auditSection = topSection(L.audit.title, L.audit.hint, [auditResults], {
    label: L.audit.scanButton,
    onClick: () => void runAudit(),
  });

  /** Custom sections reuse createCategory()'s collapsible chrome (wrapped in the same
   *  .a11y-categories container the built-in categories use, so the styling matches),
   *  with the host's render() filling the body once at construction. */
  function buildCustomSection(cfg: CustomSectionConfig): HTMLElement {
    const bodyEl = document.createElement('div');
    cfg.render(bodyEl);
    const icon = cfg.icon ? ACTION_ICONS[cfg.icon]() : infoIcon();
    const category = createCategory(icon, cfg.title, cfg.description ?? '', [bodyEl], true);
    const wrap = document.createElement('div');
    wrap.className = 'a11y-categories';
    wrap.appendChild(category);
    return wrap;
  }

  const sectionMap = new Map<string, HTMLElement>();
  sectionMap.set('profiles', profilesSection);
  sectionMap.set('quick', quickSection);
  sectionMap.set('controls', allControlsSection);
  if (actionsSection) sectionMap.set('actions', actionsSection);
  sectionMap.set('audit', auditSection);
  for (const cfg of opts.customSections ?? []) {
    sectionMap.set(cfg.id, buildCustomSection(cfg));
  }
  const orderedSections = (opts.sections ?? DEFAULT_SECTION_ORDER)
    .map((key) => sectionMap.get(key))
    .filter((el): el is HTMLElement => Boolean(el));

  // Active adjustments — every non-default pref, each removable. Lives in the footer
  // (see the a11y-ftr-* block below), collapsed by default behind a toggle that
  // replaces "Synced to this device" whenever at least one pref is non-default, using
  // the same attachCollapse() mechanism as the "All Controls" categories.
  const chips = document.createElement('div');
  chips.className = 'a11y-chips';

  function activeAdjustments(): { label: string; clear: () => void }[] {
    const p = state.prefs;
    const list: { label: string; clear: () => void }[] = [];
    if (p.fontSizeLevel > 0) {
      list.push({ label: L.activeBand.textSize(p.fontSizeLevel), clear: () => state.setFontSizeLevel(0) });
    }
    if (p.contrastLevel > 0) list.push({ label: L.activeBand.contrast(p.contrastLevel), clear: () => state.setContrastLevel(0) });
    if (p.invertColors) list.push({ label: L.activeBand.invertColors, clear: () => state.toggle('invertColors') });
    if (p.saturationLevel !== 0) {
      list.push({ label: L.activeBand.saturation(p.saturationLevel), clear: () => state.setSaturationLevel(0) });
    }
    if (p.spacingLevel > 0) list.push({ label: L.activeBand.spacing(p.spacingLevel), clear: () => state.setSpacingLevel(0) });
    if (p.lineHeightLevel > 0) {
      list.push({ label: L.activeBand.lineHeight(p.lineHeightLevel), clear: () => state.setLineHeightLevel(0) });
    }
    if (p.dyslexia) list.push({ label: L.activeBand.dyslexia, clear: () => state.toggle('dyslexia') });
    if (p.reduceMotion) list.push({ label: L.activeBand.pauseAnimations, clear: () => state.toggle('reduceMotion') });
    if (p.highlightLinks) list.push({ label: L.activeBand.highlightLinks, clear: () => state.toggle('highlightLinks') });
    if (p.hideImages) list.push({ label: L.activeBand.hideImages, clear: () => state.toggle('hideImages') });
    if (p.bigCursor) list.push({ label: L.activeBand.bigCursor, clear: () => state.toggle('bigCursor') });
    if (p.textAlign !== 'default') {
      list.push({ label: L.activeBand.textAlign(p.textAlign), clear: () => state.setTextAlign('default') });
    }
    if (p.dictionaryEnabled) list.push({ label: L.activeBand.dictionary, clear: () => state.toggle('dictionaryEnabled') });
    if (p.showTooltips) list.push({ label: L.activeBand.tooltips, clear: () => state.toggle('showTooltips') });
    if (p.readingGuide) list.push({ label: L.activeBand.readingGuide, clear: () => state.toggle('readingGuide') });
    if (p.highlightTitles) list.push({ label: L.activeBand.highlightTitles, clear: () => state.toggle('highlightTitles') });
    if (p.highlightHover) list.push({ label: L.activeBand.highlightHover, clear: () => state.toggle('highlightHover') });
    if (p.highlightFocus) list.push({ label: L.activeBand.highlightFocus, clear: () => state.toggle('highlightFocus') });
    if (p.monochrome) list.push({ label: L.activeBand.monochrome, clear: () => state.toggle('monochrome') });
    if (p.muteSounds) list.push({ label: L.activeBand.muteSounds, clear: () => state.toggle('muteSounds') });
    if (p.voiceOver) list.push({ label: L.activeBand.voiceOver, clear: () => state.toggle('voiceOver') });
    if (p.colorBlindSim !== 'none') {
      list.push({ label: L.activeBand.colorBlindSim(p.colorBlindSim), clear: () => state.setColorBlindSim('none') });
    }
    if (p.bgColor) list.push({ label: L.activeBand.bgColor, clear: () => state.setBgColor(null) });
    if (p.textColor) list.push({ label: L.activeBand.textColor, clear: () => state.setTextColor(null) });
    if (p.titleColor) list.push({ label: L.activeBand.titleColor, clear: () => state.setTitleColor(null) });
    if (p.contrastMode !== 'default') {
      list.push({ label: L.activeBand.contrastMode(p.contrastMode), clear: () => state.setContrastMode('default') });
    }
    return list;
  }

  body.append(...orderedSections);

  // Footer (fixed) — a status row (synced indicator, or the active-adjustments
  // toggle once anything is non-default) + Reset/Clear all, the collapsible chip
  // list, then a small brand credit underneath.
  const footer = document.createElement('div');
  footer.className = 'a11y-ftr';

  const statusRow = document.createElement('div');
  statusRow.className = 'a11y-ftr-status';

  // Shown when nothing is active.
  const statusInfo = document.createElement('span');
  statusInfo.className = 'a11y-ftr-status-info';
  statusInfo.appendChild(checkCircleIcon());
  const statusText = document.createElement('span');
  statusText.textContent = L.footer.synced;
  statusInfo.appendChild(statusText);

  // Shown instead of statusInfo once at least one pref is non-default — replaces the
  // status row's left side with a collapse toggle for the chip list below.
  const chipsWrapId = `accesspath-active-chips-${++sectionIdSeq}`;
  const activeToggleBtn = document.createElement('button');
  activeToggleBtn.type = 'button';
  activeToggleBtn.className = 'a11y-ftr-status-toggle';
  activeToggleBtn.hidden = true;
  activeToggleBtn.setAttribute('aria-controls', chipsWrapId);
  const activeToggleChevron = document.createElement('span');
  activeToggleChevron.className = 'a11y-ftr-status-toggle-chevron';
  activeToggleChevron.setAttribute('aria-hidden', 'true');
  activeToggleChevron.appendChild(chevronRightIcon());
  const activeToggleText = document.createElement('span');
  activeToggleBtn.append(activeToggleChevron, activeToggleText);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'a11y-ftr-reset-btn';
  resetBtn.appendChild(resetIcon());
  const resetText = document.createElement('span');
  resetText.textContent = L.footer.reset;
  resetBtn.appendChild(resetText);
  resetBtn.addEventListener('click', () => doReset());

  statusRow.append(statusInfo, activeToggleBtn, resetBtn);

  const chipsWrap = document.createElement('div');
  chipsWrap.id = chipsWrapId;
  chipsWrap.className = 'a11y-ftr-chips-wrap';
  chipsWrap.appendChild(chips);
  const chipsCollapse = attachCollapse(activeToggleBtn, chipsWrap, false);

  function renderActiveBand(): void {
    const adjustments = activeAdjustments();
    const count = adjustments.length;

    statusInfo.hidden = count > 0;
    activeToggleBtn.hidden = count === 0;
    activeToggleText.textContent = L.activeBand.count(count);
    resetText.textContent = count > 0 ? L.activeBand.clearAll : L.footer.reset;
    // Nothing left to show — collapse so a later toggle-on doesn't silently start
    // pre-expanded over an (about to be repopulated) empty list.
    if (count === 0) chipsCollapse.setExpanded(false);

    chips.innerHTML = '';
    for (const adj of adjustments) {
      const chip = document.createElement('span');
      chip.className = 'a11y-chip';
      const label = document.createElement('span');
      label.textContent = adj.label;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'a11y-chip-remove';
      remove.setAttribute('aria-label', L.activeBand.removeAria(adj.label));
      remove.textContent = '✕';
      remove.addEventListener('click', adj.clear);
      chip.append(label, remove);
      chips.appendChild(chip);
    }
  }

  // (An auto-generated "Accessibility Statement" button used to live here. It was
  // removed: a widget-generated statement asserts a WCAG conformance level the host
  // site may not actually meet, which is a liability rather than a feature. The
  // generateStatement() helper is still exported for hosts that want to render one on
  // their own statement page.)

  const brandRow = document.createElement('div');
  brandRow.className = 'a11y-ftr-brand';
  const brandMark = document.createElement('img');
  brandMark.className = 'a11y-ftr-brand-mark';
  brandMark.src = ACCESSPATH_LOGO_DATA_URI;
  brandMark.alt = '';
  brandMark.setAttribute('aria-hidden', 'true');
  const brandText = document.createElement('span');
  brandText.textContent = L.footer.poweredBy;
  brandRow.append(brandMark, brandText);

  // Report a Problem — per-host config (opts.reportUrl), not a stateful pref, same
  // 3-hop threading as brandColor. Omitted entirely when unset.
  const reportLink = opts.reportUrl ? document.createElement('a') : null;
  if (reportLink) {
    reportLink.className = 'a11y-ftr-link';
    reportLink.href = opts.reportUrl!;
    reportLink.target = '_blank';
    reportLink.rel = 'noopener noreferrer';
    reportLink.textContent = L.footer.reportProblem;
  }

  footer.append(statusRow, chipsWrap, ...(reportLink ? [reportLink] : []), brandRow);

  pnl.append(hdr, body, footer);
  root.append(backdrop, pnl);

  // Replace every native `title` hint (invisible on touch, slow/unstyled on desktop)
  // with a real tooltip shown on hover, focus, and tap.
  createHintTooltips(root).attachAll();

  function doReset(): void {
    stopSpeaking();
    isSpeaking = false;
    updateReadAloudCard();
    state.reset();
    announce(L.announce.reset);
  }

  function setSegActive<T extends string>(seg: SegmentedControl<T>, active: T): void {
    for (const [value, btn] of seg.buttons) {
      btn.classList.toggle('act', value === active);
    }
  }

  const trap = createFocusTrap(pnl, {
    onEscape: () => state.close(),
  });

  // Global shortcut — Ctrl+U toggles the panel open/closed from anywhere on the page.
  function onShortcutKeydown(e: KeyboardEvent): void {
    if (!e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'u') return;
    e.preventDefault();
    if (state.isOpen) state.close();
    else state.open();
  }
  document.addEventListener('keydown', onShortcutKeydown);

  function render(): void {
    pnl.classList.toggle('open', state.isOpen);
    pnl.classList.toggle('a11y-pnl--left', state.side === 'left');
    backdrop.classList.toggle('show', state.isOpen);
    // The speech-failed note is transient — clear it whenever the panel closes so it
    // never greets the visitor on a later open.
    if (!state.isOpen) speechNote.hidden = true;
    updateSideBtn();

    setRangeValue(fontSizeRange.input, state.prefs.fontSizeLevel);
    setRangeValue(contentFontSizeRange.input, state.prefs.fontSizeLevel);
    setRangeValue(saturationRange.input, state.prefs.saturationLevel);
    setRangeValue(contrastRange.input, state.prefs.contrastLevel);
    setRangeValue(spacingRange.input, state.prefs.spacingLevel);
    setRangeValue(lineHeightRange.input, state.prefs.lineHeightLevel);
    setSwitchActive(motionSwitchRow.toggle, state.prefs.reduceMotion);
    setActive(invertCard, state.prefs.invertColors);
    setActive(dyslexiaCard, state.prefs.dyslexia);
    setActive(motionCard, state.prefs.reduceMotion);
    setActive(highlightLinksCard, state.prefs.highlightLinks);
    setActive(hideImagesCard, state.prefs.hideImages);
    setActive(bigCursorCard, state.prefs.bigCursor);
    setSegActive(cursorColorSeg, state.prefs.cursorColor);
    setSegActive(textAlignSeg, state.prefs.textAlign);
    setActive(dictionaryCard, state.prefs.dictionaryEnabled);
    setActive(voiceOverCard, state.prefs.voiceOver);
    setRangeValue(voiceRateRange.input, state.prefs.voiceRateLevel);
    setRangeValue(voicePitchRange.input, state.prefs.voicePitchLevel);
    if (voiceSelect.value !== (state.prefs.voiceURI ?? '')) {
      voiceSelect.value = state.prefs.voiceURI ?? '';
    }
    setActive(tooltipsCard, state.prefs.showTooltips);
    setActive(readingGuideCard, state.prefs.readingGuide);
    setActive(monochromeCard, state.prefs.monochrome);
    setActive(highlightTitlesCard, state.prefs.highlightTitles);
    setActive(highlightHoverCard, state.prefs.highlightHover);
    setActive(highlightFocusCard, state.prefs.highlightFocus);
    setActive(muteSoundsCard, state.prefs.muteSounds);
    colorBlindSimSelect?.setValue(state.prefs.colorBlindSim);
    setSegActive(contrastModeSeg, state.prefs.contrastMode);
    bgColorRow.input.value = state.prefs.bgColor ?? '#ffffff';
    textColorRow.input.value = state.prefs.textColor ?? '#111111';
    titleColorRow.input.value = state.prefs.titleColor ?? '#111111';
    syncDictionaryListener();
    syncVoiceOver();
    syncTooltips();
    syncReadingGuide();
    syncMuteSounds();
    renderActiveBand();

    for (const [key, pill] of profilePills) {
      // Color Blind's "active" look reflects whether a simulation type is picked
      // (colorBlindSim), not activeProfiles — clicking the card no longer applies the
      // generic profile-preset bundle, so it's never actually in activeProfiles.
      setActive(pill, key === 'colorblind' ? state.prefs.colorBlindSim !== 'none' : state.activeProfiles.includes(key));
    }

    if (state.isOpen) trap.activate();
    else trap.deactivate();
  }

  const unsubscribe = state.subscribe(render);
  render();

  return {
    root,
    open: () => state.open(),
    close: () => state.close(),
    setDarkTheme: (isDark: boolean) => {
      pnl.classList.toggle('dark', isDark);
      updateThemeBtn();
    },
    destroy: () => {
      unsubscribe();
      document.removeEventListener('keydown', onShortcutKeydown);
      if (dictAttached) container.removeEventListener('dblclick', onWordDblClick);
      closeDictionaryPopover();
      readingGuideHandle?.destroy();
      voiceOverHandle?.destroy();
      if (isSpeechSupported()) {
        window.speechSynthesis.removeEventListener('voiceschanged', populateVoices);
      }
      muteSoundsHandle?.destroy();
      vkbHandle?.destroy();
    },
  };
}

function headingGlyph(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'a11y-df-icon';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = 'H';
  return span;
}

function dyslexiaGlyph(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'a11y-df-icon';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = 'Df';
  return span;
}
