/** AccessPath's own accessibility scanner — no third-party engine (no axe-core/etc).
 *  Deliberately self-contained: every other ephemeral feature in this codebase
 *  (heading-scan.ts, dictionary.ts, tooltips.ts) is a plain DOM-walking module with zero
 *  dependencies, statically imported by panel-dom.ts — this follows the same shape, so
 *  it costs the embed IIFE build only its own few KB, not a ~500KB third-party payload
 *  inlined into every self-hosted embed.js regardless of whether a site ever uses it.
 *
 *  Rule set and WCAG mappings researched in docs/wcag-check.md — this file implements
 *  that doc's Tier 1 (cheap, high-confidence) and Tier 2 (needs computed-style/layout
 *  math, still zero-dependency-feasible) checks. Tier 3 (needs human judgment or a
 *  backend) is deliberately not attempted here — see that doc for why. */

import type { ProfileKey } from './types';

export type ScanImpact = 'critical' | 'serious' | 'moderate' | 'minor';
/** 'incomplete' means the rule found elements it genuinely could not evaluate either
 *  way (e.g. text sitting on a background image, where contrast can't be sampled
 *  without canvas rasterization) — distinct from 'not-applicable' (the rule found
 *  nothing on the page to check at all). Without this bucket those uncertain cases
 *  were silently dropped from checkedCount, which let a page score 100 on contrast
 *  purely because every text element happened to sit on a background image — see
 *  docs/wcag-check.md Task 2. */
export type ScanStatus = 'fail' | 'pass' | 'not-applicable' | 'incomplete';
export type ScanLevel = 'A' | 'AA' | 'AAA';
/** 'static' = checkable from parsed markup alone (attributes, text content, DOM
 *  structure) — no rendering required. 'needs-layout' = requires getComputedStyle /
 *  getBoundingClientRect / visibility, i.e. a real rendered browser. Feeds any future
 *  scan mode that can only run the static subset (e.g. a fetched-HTML + DOMParser
 *  scan of a remote page with no live rendering — see docs/wcag-check.md Task 7). */
export type ScanScope = 'static' | 'needs-layout';
/** Anything a rule's `run()` can scan against: the host container element itself, or
 *  (via Task 6's discoverScanRoots()) a nested open shadow root or same-origin
 *  iframe's document — all three implement the ParentNode interface every rule
 *  actually uses (.querySelector/.querySelectorAll), so rule bodies never needed to
 *  change to support this. See docs/wcag-check.md Task 6. */
type ScanRoot = Element | Document | ShadowRoot;

/** Groups checks for report display — mirrors how axe-core/Lighthouse group their own
 *  audit lists (Names and Labels, Navigation, Contrast, etc.) rather than presenting one
 *  flat list. */
export type ScanCategory = 'names-labels' | 'navigation' | 'language' | 'aria' | 'contrast' | 'sizing' | 'best-practices';

export const CATEGORY_LABEL: Record<ScanCategory, string> = {
  'names-labels': 'Names and Labels',
  navigation: 'Navigation',
  language: 'Language',
  aria: 'ARIA',
  contrast: 'Contrast',
  sizing: 'Sizing and Spacing',
  'best-practices': 'Best Practices',
};

export interface ScanViolationNode {
  /** Outer HTML of the offending element, truncated for display. */
  html: string;
  /** CSS selector identifying the element, used to re-locate it via querySelector(). */
  target: string;
  /** Plain-English fix instructions, specific to this element. */
  fix: string;
}

/** Every rule produces exactly one ScanCheck, regardless of outcome — this is what
 *  makes the full report a complete list ("what was checked, not just what failed"),
 *  not just a violation list like the old ScanViolation-only shape. */
export interface ScanCheck {
  id: string;
  status: ScanStatus;
  impact: ScanImpact;
  category: ScanCategory;
  /** Which WCAG conformance level this rule maps to. */
  level: ScanLevel;
  /** Short machine tags in the style axe-core/most scanners use, e.g. ['wcag2aa', 'wcag143']
   *  — 'best-practice' for rules with no single numbered success criterion. */
  tags: string[];
  /** Which of AccessPath's own 9 profiles genuinely relate to this check — empty for
   *  pure markup/semantic-correctness checks (alt text, ARIA validity, labels,
   *  landmarks) that no AccessPath profile addresses. The Voice Over profile reads
   *  the page aloud but is not a screen reader (see features-and-profiles.md), so
   *  mapping semantic-markup checks to it would be dishonest. */
  profiles: ProfileKey[];
  /** Short rule name, e.g. "Images must have alternate text". */
  help: string;
  /** What the rule checks and why it matters. */
  description: string;
  /** WCAG success criterion this rule maps to, e.g. "WCAG 2.1 — 1.1.1 Non-text Content". */
  wcag: string;
  /** How many elements this rule definitively evaluated to pass/fail (0 for
   *  'not-applicable'; elements the rule couldn't evaluate at all go in the incomplete
   *  count instead, not here — see ScanStatus). */
  checkedCount: number;
  /** Populated when status === 'fail' (one entry per offending element) or
   *  status === 'incomplete' (one entry per element the rule couldn't evaluate either
   *  way — each node's `fix` field carries what to check manually and why the
   *  automated check couldn't decide, e.g. "sits on a background image — contrast not
   *  measurable, verify manually"). */
  nodes: ScanViolationNode[];
  /** Populated only when status is 'pass' or 'not-applicable' — plain-English reason it
   *  passed, or why the page has nothing for this rule to check. */
  reason?: string;
  /** Whether this rule needs a rendered browser (getComputedStyle/getBoundingClientRect)
   *  or is checkable from parsed markup alone — see ScanScope. */
  scope: ScanScope;
}

export interface ScanResult {
  /** Every rule's result, sorted worst-first: failing checks (by impact), then
   *  incomplete checks, then passing checks, then not-applicable checks — each group in
   *  rule-declaration order. */
  checks: ScanCheck[];
  failCount: number;
  passCount: number;
  notApplicableCount: number;
  /** Rules that found elements they genuinely couldn't evaluate either way — see
   *  ScanStatus's 'incomplete' doc comment. */
  incompleteCount: number;
  /** Sum of every rule's checkedCount — total elements definitively evaluated (pass or
   *  fail) across all rules. Does not include elements only found incomplete. */
  checkedElementCount: number;
  scannedAt: number;
}

function truncateHtml(el: Element, max = 160): string {
  const html = el.outerHTML;
  return html.length > max ? html.slice(0, max) + '…' : html;
}

/** Same idea as truncateHtml() but for the handful of page-level rules that show a
 *  debug snippet of the whole container when they have no single offending element to
 *  point at (page-has-heading-one, bypass-blocks, landmark-one-main) — container may
 *  now be a Document or ShadowRoot (Task 6), neither of which has .outerHTML. */
function describeContainer(container: ScanRoot, max = 60): string {
  if (container instanceof Element) return truncateHtml(container, max);
  if (container instanceof Document) return '<document>';
  return '<shadow-root>';
}

/** Sentinel prefix selectorFor() applies to any element whose root isn't the main
 *  document (Task 6: an element living inside a shadow root or a same-origin
 *  iframe) — the generated path is only ever valid relative to that root, and
 *  running it through document.querySelector() (as highlightScanNode() does) could
 *  silently match the wrong element instead of just failing to find one. Full
 *  cross-boundary "Show on page" support (a compound selector highlightScanNode
 *  knows how to walk through shadow roots/iframes) is a known follow-up — see
 *  docs/wcag-check.md Task 6 — not attempted here; this prefix just makes the
 *  current gap a safe no-op instead of a wrong-element highlight. */
const UNSUPPORTED_ROOT_PREFIX = '::unsupported-root::';

/** Builds a CSS selector that's good enough to re-locate this exact element for the
 *  "Show on page" action — prefers #id, otherwise a tag + nth-of-type path up to a
 *  reasonably unique ancestor (bounded depth, this doesn't need to be a minimal selector,
 *  just one that resolves to the same element on the still-live page). */
function selectorFor(el: Element): string {
  const prefix = el.getRootNode() === document ? '' : UNSUPPORTED_ROOT_PREFIX;
  if (el.id) return prefix + `#${CSS.escape(el.id)}`;
  const parts: string[] = [];
  let node: Element | null = el;
  for (let depth = 0; node && depth < 6; depth++) {
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    const parent: Element | null = node.parentElement;
    if (!parent) {
      parts.unshift(node.tagName.toLowerCase());
      break;
    }
    const siblings = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
    const index = siblings.indexOf(node) + 1;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${index})`);
    node = parent;
  }
  return prefix + parts.join(' > ');
}

/** Resolves an id reference (aria-labelledby, headers, a skip-link's href fragment,
 *  etc.) scoped to whichever root `el` actually lives in. Plain
 *  document.getElementById() only ever sees the main document's id space — it misses
 *  ids scoped inside a shadow tree entirely (Task 6), and ShadowRoot has no
 *  getElementById of its own (unlike Document) — so this always goes through
 *  querySelector('#id') instead, which every ParentNode (Document, ShadowRoot,
 *  Element) implements identically. */
function resolveId(el: Element, id: string): Element | null {
  const root = el.getRootNode() as ParentNode;
  return root.querySelector(`#${CSS.escape(id)}`);
}

function accessibleNameOf(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => resolveId(el, id)?.textContent?.trim() ?? '')
      .join(' ')
      .trim();
    if (text) return text;
  }
  return (el.textContent ?? '').trim();
}

function isVisible(el: Element): boolean {
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

interface RuleContext {
  /** Element | Document | ShadowRoot, not just HTMLElement — see ScanRoot's doc
   *  comment. A container-scoped rule's run() gets called once per discovered root
   *  (Task 6) and never needs to know or care which kind of root it got, since every
   *  rule body only ever calls .querySelector/.querySelectorAll on it (one exception,
   *  the 'region' rule's .tagName check, is narrowed with an 'in' guard). */
  container: ScanRoot;
  push: (node: ScanViolationNode) => void;
  /** Call once per element the rule found but genuinely could not evaluate either way
   *  (e.g. contrast behind a background image) — see ScanStatus's 'incomplete' doc
   *  comment. Do not call push() for the same element too; incomplete and fail are
   *  mutually exclusive per element. */
  pushIncomplete: (node: ScanViolationNode) => void;
}

interface Rule {
  id: string;
  scope: ScanScope;
  /** True for the handful of rules that read global document state directly
   *  (document.title, document.documentElement, a <meta> tag, document.body) and
   *  never touch the container parameter at all — these run exactly once against the
   *  real top-level document, never once per discovered shadow-root/iframe root
   *  (Task 6), or they'd report the same single finding N times over. Defaults to
   *  false/absent — container-scoped is the common case; a new whole-document rule
   *  must opt in explicitly. */
  documentScope?: boolean;
  help: string;
  description: string;
  wcag: string;
  impact: ScanImpact;
  category: ScanCategory;
  level: ScanLevel;
  tags: string[];
  profiles: ProfileKey[];
  /** Runs the check, calling ctx.push()/ctx.pushIncomplete() once per offending/
   *  unevaluable element. Returns the number of elements it definitively evaluated to
   *  pass or fail — do not count elements only reported via pushIncomplete(). */
  run: (ctx: RuleContext) => number;
  /** "Why it passed" text, given how many elements were checked. */
  passReason: (checkedCount: number) => string;
  /** Shown when the rule found zero relevant elements to check at all. */
  notApplicableReason: string;
}

/** Recursively discovers every place a container-scoped rule should look: `root`
 *  itself, every open shadow root nested within it (web-component content is
 *  otherwise invisible to querySelectorAll, which never pierces shadow boundaries),
 *  and every same-origin iframe's document nested within it. A cross-origin iframe's
 *  contentDocument throws (or is inaccessible) — skipped rather than treated as an
 *  error, the same skip-rather-than-guess bias as the rest of this file. Closed
 *  shadow roots are inherently unreachable from outside and are also skipped — a
 *  fundamental limitation of the Shadow DOM API itself, not something this scanner
 *  can work around. See docs/wcag-check.md Task 6. */
function discoverScanRoots(root: ScanRoot, seen: Set<Node> = new Set()): ScanRoot[] {
  if (seen.has(root)) return [];
  seen.add(root);
  const roots: ScanRoot[] = [root];
  const candidates: Element[] = [];
  if (root instanceof Element) candidates.push(root);
  candidates.push(...Array.from(root.querySelectorAll('*')));
  for (const el of candidates) {
    if (el.shadowRoot && !seen.has(el.shadowRoot)) {
      roots.push(...discoverScanRoots(el.shadowRoot, seen));
    }
    if (el.tagName === 'IFRAME') {
      try {
        const doc = (el as HTMLIFrameElement).contentDocument;
        if (doc?.body && !seen.has(doc)) roots.push(...discoverScanRoots(doc, seen));
      } catch {
        // Cross-origin iframe — contentDocument access throws. Skip silently.
      }
    }
  }
  return roots;
}

// --- Color contrast helpers (WCAG 1.4.3) -------------------------------------------
// Pure math, no dependency — the standard WCAG relative-luminance/contrast-ratio
// formulas. Background images/gradients can't be sampled without canvas
// rasterization (see docs/wcag-check.md's Tier 2 note), so any element whose nearest
// solid background is preceded by a background-image ancestor is skipped entirely
// (not counted as pass or fail) rather than risk a false result.

function parseRgb(color: string): [number, number, number, number] | null {
  const m = color.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] !== undefined ? Number(m[4]) : 1];
}

function relativeLuminance([r, g, b]: number[]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(rgb1: number[], rgb2: number[]): number {
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Walks up from `el` looking for the nearest solid (opaque) background color.
 *  Returns null if a background-image ancestor is hit first (unreliable to sample) or
 *  no solid color is found before the document root (defaults white in that case, the
 *  browser's own default canvas color). */
function effectiveBackgroundColor(el: Element): [number, number, number] | null {
  let node: Element | null = el;
  while (node) {
    const style = getComputedStyle(node);
    if (style.backgroundImage !== 'none') return null;
    const bg = parseRgb(style.backgroundColor);
    if (bg && bg[3] >= 0.99) return [bg[0], bg[1], bg[2]];
    node = node.parentElement;
  }
  return [255, 255, 255];
}

/** True leaf text elements only — mirrors the leaf-detection intent already used by
 *  a11y-effects.css's font-scaling selector, so contrast is measured once per run of
 *  text rather than once per wrapper div too. */
function isLeafTextElement(el: Element): boolean {
  if (el.children.length > 0) return false;
  return (el.textContent ?? '').trim().length > 0;
}

// --- ARIA validity data ---------------------------------------------------------
// Curated (not 100% of the WAI-ARIA spec's every role/attribute combination) —
// covers the roles/attributes that actually show up on real pages. Where a role or
// attribute isn't in these tables, the relevant rule below skips it rather than
// guessing, matching this file's existing bias toward skipping over false-flagging
// (see effectiveBackgroundColor's background-image skip for the same reasoning).

const VALID_ARIA_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption', 'cell',
  'checkbox', 'code', 'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'deletion',
  'dialog', 'directory', 'document', 'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'gridcell',
  'group', 'heading', 'img', 'insertion', 'link', 'list', 'listbox', 'listitem', 'log', 'main', 'mark',
  'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'meter',
  'navigation', 'none', 'note', 'option', 'paragraph', 'presentation', 'progressbar', 'radio', 'radiogroup',
  'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider',
  'spinbutton', 'status', 'strong', 'subscript', 'superscript', 'switch', 'tab', 'table', 'tablist',
  'tabpanel', 'term', 'textbox', 'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
]);

const VALID_ARIA_ATTRS = new Set([
  'aria-activedescendant', 'aria-atomic', 'aria-autocomplete', 'aria-busy', 'aria-checked', 'aria-colcount',
  'aria-colindex', 'aria-colspan', 'aria-controls', 'aria-current', 'aria-describedby', 'aria-details',
  'aria-disabled', 'aria-dropeffect', 'aria-errormessage', 'aria-expanded', 'aria-flowto', 'aria-grabbed',
  'aria-haspopup', 'aria-hidden', 'aria-invalid', 'aria-keyshortcuts', 'aria-label', 'aria-labelledby',
  'aria-level', 'aria-live', 'aria-modal', 'aria-multiline', 'aria-multiselectable', 'aria-orientation',
  'aria-owns', 'aria-placeholder', 'aria-posinset', 'aria-pressed', 'aria-readonly', 'aria-relevant',
  'aria-required', 'aria-roledescription', 'aria-rowcount', 'aria-rowindex', 'aria-rowspan', 'aria-selected',
  'aria-setsize', 'aria-sort', 'aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext',
]);

/** Enum/boolean-valued attributes — anything not listed here (e.g. free-text aria-label,
 *  numeric aria-valuenow) isn't value-checked by aria-valid-attr-value below. */
const ARIA_ATTR_VALID_VALUES: Record<string, string[]> = {
  'aria-checked': ['true', 'false', 'mixed'],
  'aria-pressed': ['true', 'false', 'mixed'],
  'aria-expanded': ['true', 'false'],
  'aria-selected': ['true', 'false'],
  'aria-hidden': ['true', 'false'],
  'aria-disabled': ['true', 'false'],
  'aria-required': ['true', 'false'],
  'aria-readonly': ['true', 'false'],
  'aria-multiline': ['true', 'false'],
  'aria-multiselectable': ['true', 'false'],
  'aria-modal': ['true', 'false'],
  'aria-busy': ['true', 'false'],
  'aria-atomic': ['true', 'false'],
  'aria-grabbed': ['true', 'false'],
  'aria-invalid': ['true', 'false', 'grammar', 'spelling'],
  'aria-live': ['off', 'polite', 'assertive'],
  'aria-orientation': ['horizontal', 'vertical'],
  'aria-haspopup': ['false', 'true', 'menu', 'listbox', 'tree', 'grid', 'dialog'],
  'aria-current': ['page', 'step', 'location', 'date', 'time', 'true', 'false'],
  'aria-autocomplete': ['inline', 'list', 'both', 'none'],
  'aria-sort': ['none', 'ascending', 'descending', 'other'],
};

/** Extra (beyond the global set every role accepts — label/labelledby/describedby/
 *  hidden/disabled/live/atomic/relevant/busy/controls/owns/flowto/keyshortcuts/
 *  roledescription/details) states+properties each role supports. Curated for the
 *  common interactive/widget roles; roles not listed here are skipped by
 *  aria-allowed-attr rather than flagged. */
const ROLE_ALLOWED_EXTRA_ATTRS: Record<string, string[]> = {
  checkbox: ['aria-checked', 'aria-required', 'aria-readonly'],
  radio: ['aria-checked', 'aria-required'],
  switch: ['aria-checked'],
  button: ['aria-expanded', 'aria-pressed'],
  combobox: ['aria-expanded', 'aria-autocomplete', 'aria-required', 'aria-readonly', 'aria-activedescendant'],
  listbox: ['aria-multiselectable', 'aria-required', 'aria-activedescendant', 'aria-orientation'],
  option: ['aria-selected', 'aria-checked', 'aria-posinset', 'aria-setsize'],
  tab: ['aria-selected'],
  tabpanel: [],
  menuitem: ['aria-expanded'],
  menuitemcheckbox: ['aria-checked'],
  menuitemradio: ['aria-checked'],
  slider: ['aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext', 'aria-orientation', 'aria-readonly'],
  spinbutton: ['aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext', 'aria-required', 'aria-readonly'],
  progressbar: ['aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext'],
  meter: ['aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext'],
  textbox: ['aria-multiline', 'aria-required', 'aria-readonly', 'aria-placeholder', 'aria-activedescendant', 'aria-autocomplete'],
  searchbox: ['aria-multiline', 'aria-required', 'aria-readonly', 'aria-placeholder', 'aria-activedescendant', 'aria-autocomplete'],
  grid: ['aria-multiselectable', 'aria-readonly', 'aria-colcount', 'aria-rowcount', 'aria-activedescendant'],
  gridcell: ['aria-selected', 'aria-readonly', 'aria-required', 'aria-colindex', 'aria-rowindex', 'aria-colspan', 'aria-rowspan', 'aria-expanded'],
  row: ['aria-selected', 'aria-level', 'aria-rowindex', 'aria-posinset', 'aria-setsize', 'aria-expanded'],
  heading: ['aria-level'],
  tree: ['aria-multiselectable', 'aria-required', 'aria-activedescendant'],
  treeitem: ['aria-selected', 'aria-checked', 'aria-expanded', 'aria-level', 'aria-posinset', 'aria-setsize'],
  dialog: ['aria-modal'],
  alertdialog: ['aria-modal'],
  region: [],
  article: [],
  feed: ['aria-busy', 'aria-activedescendant'],
  separator: ['aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-orientation'],
  scrollbar: ['aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-orientation', 'aria-controls'],
};

const GLOBAL_ARIA_ATTRS = new Set([
  'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-details', 'aria-hidden', 'aria-disabled',
  'aria-live', 'aria-atomic', 'aria-relevant', 'aria-busy', 'aria-controls', 'aria-owns', 'aria-flowto',
  'aria-keyshortcuts', 'aria-roledescription', 'aria-current', 'aria-errormessage', 'aria-haspopup',
  'aria-invalid', 'aria-dropeffect', 'aria-grabbed',
]);

/** Landmark-ish elements/roles used by the region/nesting rules below. */
const LANDMARK_SELECTOR =
  'header, [role="banner"], nav, [role="navigation"], main, [role="main"], aside, [role="complementary"], ' +
  'footer, [role="contentinfo"], form[aria-label], form[aria-labelledby], [role="form"], search, [role="search"], ' +
  'section[aria-label], section[aria-labelledby], [role="region"]';

const INTERACTIVE_SELECTOR =
  'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="checkbox"], ' +
  '[role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], ' +
  '[role="option"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="textbox"], [role="searchbox"]';

// --- ARIA required-context data (docs/wcag-check.md Task 4 item 3) ---------------
// Same curated-not-exhaustive shape and false-positive-averse bias as the ARIA
// validity tables above: only the roles listed here are checked at all, and only
// their explicit role="..." usage (never native-element implicit semantics, which
// browsers already get right without any of this).

/** Roles that are meaningless without a specific state/value attribute. */
const ROLE_REQUIRED_ATTRS: Record<string, string[]> = {
  checkbox: ['aria-checked'],
  switch: ['aria-checked'],
  radio: ['aria-checked'],
  combobox: ['aria-expanded'],
  slider: ['aria-valuenow'],
  spinbutton: ['aria-valuenow'],
};

/** Container roles that need at least one matching child role somewhere inside them. */
const ROLE_REQUIRED_CHILDREN: Record<string, string[]> = {
  list: ['listitem'],
  listbox: ['option'],
  tablist: ['tab'],
  menu: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
  menubar: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
  radiogroup: ['radio'],
  tree: ['treeitem', 'group'],
  grid: ['row', 'rowgroup'],
  treegrid: ['row', 'rowgroup'],
  row: ['cell', 'gridcell', 'columnheader', 'rowheader'],
};

/** Roles that only make sense inside a specific ancestor role. */
const ROLE_REQUIRED_PARENT: Record<string, string[]> = {
  listitem: ['list'],
  option: ['listbox'],
  tab: ['tablist'],
  menuitem: ['menu', 'menubar'],
  menuitemcheckbox: ['menu', 'menubar'],
  menuitemradio: ['menu', 'menubar'],
  radio: ['radiogroup'],
  treeitem: ['tree', 'group'],
  row: ['grid', 'treegrid', 'rowgroup', 'table'],
  gridcell: ['row'],
  columnheader: ['row'],
  rowheader: ['row'],
};

/** Weak, page-wide signal for the css-blink-animation heuristic below: does *any*
 *  accessible stylesheet on the page contain a prefers-reduced-motion media query at
 *  all? Not scoped to the specific animated element (verifying the guard actually
 *  covers that element's own animation-name would need parsing selectors against the
 *  DOM, which is a lot of complexity for a heuristic rule) — deliberately coarse, in
 *  keeping with this file's bias toward under- rather than over-flagging. Cross-origin
 *  stylesheets throw on .cssRules access; skipped rather than treated as a guard. */
function pageHasReducedMotionGuard(): boolean {
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule && /prefers-reduced-motion/i.test(rule.media.mediaText)) {
          return true;
        }
      }
    }
  } catch {
    // Unexpected stylesheet access failure — treat as "no guard found" rather than throw.
  }
  return false;
}

const RULES: Rule[] = [
  {
    id: 'img-alt',
    scope: 'static',
    help: 'Images must have alternate text',
    description: 'Screen readers can\'t describe an image with no alt text — visitors relying on one hear nothing where the image is.',
    wcag: 'WCAG 2.1 — 1.1.1 Non-text Content',
    impact: 'critical',
    category: 'names-labels',
    level: 'A',
    tags: ['wcag2a', 'wcag111'],
    profiles: [],
    run({ container, push }) {
      const imgs = Array.from(container.querySelectorAll('img'));
      for (const img of imgs) {
        const hasAlt = img.hasAttribute('alt');
        const isPresentational = img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true';
        if (!hasAlt && !isPresentational) {
          push({
            html: truncateHtml(img),
            target: selectorFor(img),
            fix: 'Add an alt attribute describing the image, e.g. alt="A dog catching a frisbee in a park". If the image is purely decorative, use alt="" instead so screen readers skip it.',
          });
        }
      }
      return imgs.length;
    },
    passReason: (n) => `All ${n} image${n === 1 ? '' : 's'} on the page have alt text (or are marked decorative).`,
    notApplicableReason: 'No images found on this page.',
  },
  {
    id: 'image-redundant-alt',
    scope: 'static',
    help: 'Image alt text should not repeat adjacent text',
    description: 'When an image\'s alt text just repeats the visible text right next to it (e.g. a logo linking home with alt="Company logo" beside the visible words "Company logo"), a screen reader announces the same thing twice.',
    wcag: 'WCAG 2.1 — 1.1.1 Non-text Content (best practice)',
    impact: 'minor',
    category: 'names-labels',
    level: 'A',
    tags: ['best-practice'],
    profiles: [],
    run({ container, push }) {
      const imgs = Array.from(container.querySelectorAll('img[alt]')).filter((img) => img.getAttribute('alt')?.trim());
      for (const img of imgs) {
        const alt = img.getAttribute('alt')!.trim().toLowerCase();
        const parent = img.parentElement;
        const siblingText = parent
          ? Array.from(parent.childNodes)
              .filter((n) => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && n !== img))
              .map((n) => n.textContent ?? '')
              .join(' ')
              .trim()
              .toLowerCase()
          : '';
        if (alt.length > 0 && siblingText.includes(alt)) {
          push({
            html: truncateHtml(img),
            target: selectorFor(img),
            fix: 'Either remove the redundant alt text (use alt="" since the adjacent visible text already conveys it) or remove the duplicate visible text.',
          });
        }
      }
      return imgs.length;
    },
    passReason: (n) => `None of the ${n} image${n === 1 ? '' : 's'} with alt text repeat their adjacent visible text.`,
    notApplicableReason: 'No images with alt text found on this page.',
  },
  {
    id: 'input-label',
    scope: 'static',
    help: 'Form fields must have a label',
    description: 'A field with no associated label announces only as its input type ("edit text") — visitors using a screen reader can\'t tell what to enter.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value',
    impact: 'critical',
    category: 'names-labels',
    level: 'A',
    tags: ['wcag2a', 'wcag412', 'wcag131'],
    profiles: [],
    run({ container, push }) {
      const fields = Array.from(container.querySelectorAll('input, select, textarea')).filter(
        (f) => (f as HTMLInputElement).type !== 'hidden' && (f as HTMLInputElement).type !== 'submit' && (f as HTMLInputElement).type !== 'button'
      );
      for (const field of fields) {
        const id = field.getAttribute('id');
        const hasLabelFor = id && container.querySelector(`label[for="${CSS.escape(id)}"]`);
        const hasWrappingLabel = field.closest('label');
        const hasAriaLabel = field.getAttribute('aria-label')?.trim();
        const hasAriaLabelledby = field.getAttribute('aria-labelledby');
        if (!hasLabelFor && !hasWrappingLabel && !hasAriaLabel && !hasAriaLabelledby) {
          push({
            html: truncateHtml(field),
            target: selectorFor(field),
            fix: 'Add a <label for="..."> pointing at this field\'s id, wrap the field in a <label>, or add an aria-label/aria-labelledby attribute directly on it.',
          });
        }
      }
      return fields.length;
    },
    passReason: (n) => `All ${n} form field${n === 1 ? '' : 's'} have an associated label.`,
    notApplicableReason: 'No form fields found on this page.',
  },
  {
    id: 'link-name',
    scope: 'static',
    help: 'Links must have discernible text',
    description: 'A link with no text (and no accessible name from aria-label or an inner image\'s alt) announces as just "link" — visitors can\'t tell where it goes.',
    wcag: 'WCAG 2.1 — 2.4.4 Link Purpose, 4.1.2 Name, Role, Value',
    impact: 'serious',
    category: 'names-labels',
    level: 'A',
    tags: ['wcag2a', 'wcag244', 'wcag412'],
    profiles: [],
    run({ container, push }) {
      const links = Array.from(container.querySelectorAll('a[href]'));
      for (const link of links) {
        const hasImgAlt = Array.from(link.querySelectorAll('img')).some((img) => img.getAttribute('alt')?.trim());
        if (!accessibleNameOf(link) && !hasImgAlt) {
          push({
            html: truncateHtml(link),
            target: selectorFor(link),
            fix: 'Add visible link text, an aria-label describing the destination, or (if the link wraps only an image) an alt attribute on that image.',
          });
        }
      }
      return links.length;
    },
    passReason: (n) => `All ${n} link${n === 1 ? '' : 's'} have discernible text.`,
    notApplicableReason: 'No links found on this page.',
  },
  {
    id: 'button-name',
    scope: 'static',
    help: 'Buttons must have discernible text',
    description: 'A button with no text and no aria-label announces as just "button" — visitors can\'t tell what it does.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value',
    impact: 'serious',
    category: 'names-labels',
    level: 'A',
    tags: ['wcag2a', 'wcag412'],
    profiles: [],
    run({ container, push }) {
      const buttons = Array.from(container.querySelectorAll('button, [role="button"]'));
      for (const btn of buttons) {
        if (!accessibleNameOf(btn)) {
          push({
            html: truncateHtml(btn),
            target: selectorFor(btn),
            fix: 'Add visible text inside the button, or an aria-label describing what it does (e.g. aria-label="Close dialog" for an icon-only close button).',
          });
        }
      }
      return buttons.length;
    },
    passReason: (n) => `All ${n} button${n === 1 ? '' : 's'} have discernible text.`,
    notApplicableReason: 'No buttons found on this page.',
  },
  {
    id: 'iframe-title',
    scope: 'static',
    help: 'iframes must have a title',
    description: 'Screen readers announce an iframe by its title so visitors know what the embedded content is before entering it — with none, it announces as just "iframe".',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value',
    impact: 'moderate',
    category: 'names-labels',
    level: 'A',
    tags: ['wcag2a', 'wcag412'],
    profiles: [],
    run({ container, push }) {
      const iframes = Array.from(container.querySelectorAll('iframe'));
      for (const frame of iframes) {
        if (!frame.getAttribute('title')?.trim()) {
          push({
            html: truncateHtml(frame),
            target: selectorFor(frame),
            fix: 'Add a title attribute describing the embedded content, e.g. title="YouTube video: product demo".',
          });
        }
      }
      return iframes.length;
    },
    passReason: (n) => `All ${n} iframe${n === 1 ? '' : 's'} have a title.`,
    notApplicableReason: 'No iframes found on this page.',
  },
  {
    id: 'document-lang',
    documentScope: true,
    scope: 'static',
    help: 'The page must have a lang attribute',
    description: 'Without a lang attribute, screen readers guess the page\'s language and often mispronounce every word.',
    wcag: 'WCAG 2.1 — 3.1.1 Language of Page',
    impact: 'serious',
    category: 'language',
    level: 'A',
    tags: ['wcag2a', 'wcag311'],
    profiles: [],
    run({ push }) {
      const html = document.documentElement;
      if (!html.getAttribute('lang')?.trim()) {
        push({
          html: truncateHtml(html, 60),
          target: 'html',
          fix: 'Add a lang attribute to the <html> tag, e.g. <html lang="en">.',
        });
      }
      return 1;
    },
    passReason: () => `The <html> tag declares lang="${document.documentElement.getAttribute('lang')}".`,
    notApplicableReason: 'No document to check.',
  },
  {
    id: 'html-lang-valid',
    documentScope: true,
    scope: 'static',
    help: 'The lang attribute value must be a real language code',
    description: 'A lang attribute that\'s present but not a valid BCP-47 language code (e.g. lang="xyz") passes a simple presence check but still doesn\'t tell assistive tech the actual language.',
    wcag: 'WCAG 2.1 — 3.1.1 Language of Page',
    impact: 'serious',
    category: 'language',
    level: 'A',
    tags: ['wcag2a', 'wcag311'],
    profiles: [],
    run({ push }) {
      const lang = document.documentElement.getAttribute('lang')?.trim();
      if (lang) {
        try {
          // Intl.getCanonicalLocales is well-supported at runtime (Baseline since 2020)
          // but not in this project's configured TS lib target — cast rather than widen
          // the shared tsconfig.base.json's lib list for one call site.
          const getCanonicalLocales = (Intl as unknown as { getCanonicalLocales: (locale: string) => string[] }).getCanonicalLocales;
          const canonical = getCanonicalLocales(lang);
          if (canonical.length === 0) {
            push({ html: truncateHtml(document.documentElement, 60), target: 'html', fix: `"${lang}" isn't a recognized language code — use a valid BCP-47 code like "en", "en-US", or "es".` });
          }
        } catch {
          push({ html: truncateHtml(document.documentElement, 60), target: 'html', fix: `"${lang}" isn't a recognized language code — use a valid BCP-47 code like "en", "en-US", or "es".` });
        }
      }
      return lang ? 1 : 0;
    },
    passReason: () => `"${document.documentElement.getAttribute('lang')}" is a valid language code.`,
    notApplicableReason: 'No lang attribute is set (see the separate "page must have a lang attribute" check).',
  },
  {
    id: 'document-title',
    documentScope: true,
    scope: 'static',
    help: 'The page must have a title',
    description: 'The <title> is usually the first thing a screen reader announces on page load, and it\'s what shows in browser tabs/history — an empty one leaves visitors with no idea where they are.',
    wcag: 'WCAG 2.1 — 2.4.2 Page Titled',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['wcag2a', 'wcag242'],
    profiles: [],
    run({ push }) {
      if (!document.title.trim()) {
        push({
          html: '<title></title>',
          target: 'title',
          fix: 'Add a descriptive <title> to the page\'s <head>, e.g. <title>Contact Us — Acme Inc.</title>.',
        });
      }
      return 1;
    },
    passReason: () => `The page title is "${document.title}".`,
    notApplicableReason: 'No document to check.',
  },
  {
    id: 'page-has-heading-one',
    scope: 'static',
    help: 'The page should have a top-level heading',
    description: 'A page with no <h1> has no clear entry point for screen-reader users navigating by heading — one of the most common structural misses.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships (best practice)',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['best-practice'],
    profiles: ['dyslexia'],
    run({ container, push }) {
      if (!container.querySelector('h1')) {
        push({ html: describeContainer(container, 60), target: 'body', fix: 'Add a single <h1> describing the main content of this page.' });
      }
      return 1;
    },
    passReason: () => 'The page has at least one <h1>.',
    notApplicableReason: 'No document to check.',
  },
  {
    id: 'heading-order',
    scope: 'static',
    help: 'Heading levels should not skip',
    description: 'Jumping from an h2 straight to an h4 (skipping h3) breaks the outline visitors using a screen reader\'s heading navigation rely on to understand page structure.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['best-practice', 'wcag131'],
    profiles: ['dyslexia'],
    run({ container, push }) {
      const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      let prevLevel = 0;
      for (const h of headings) {
        const level = Number(h.tagName[1]);
        if (prevLevel > 0 && level > prevLevel + 1) {
          push({
            html: truncateHtml(h),
            target: selectorFor(h),
            fix: `This is an h${level} directly after an h${prevLevel} — add an h${prevLevel + 1} in between, or change this heading's level, so the outline doesn't skip a step.`,
          });
        }
        prevLevel = level;
      }
      return headings.length;
    },
    passReason: (n) => `The ${n} heading${n === 1 ? '' : 's'} on this page step down in order with no skipped levels.`,
    notApplicableReason: 'No headings found on this page.',
  },
  {
    id: 'empty-heading',
    scope: 'static',
    help: 'Headings must not be empty',
    description: 'An empty heading is announced as a blank stop in a screen reader\'s heading list, with no information about what section follows.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships, 2.4.6 Headings and Labels',
    impact: 'minor',
    category: 'navigation',
    level: 'AA',
    tags: ['wcag2aa', 'wcag246'],
    profiles: ['dyslexia'],
    run({ container, push }) {
      const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      for (const h of headings) {
        if (!h.textContent?.trim()) {
          push({
            html: truncateHtml(h),
            target: selectorFor(h),
            fix: 'Add text describing the section this heading introduces, or remove the empty heading tag if it\'s not needed.',
          });
        }
      }
      return headings.length;
    },
    passReason: (n) => `All ${n} heading${n === 1 ? '' : 's'} have text.`,
    notApplicableReason: 'No headings found on this page.',
  },
  {
    id: 'bypass-blocks',
    scope: 'static',
    help: 'The page should offer a way to skip repeated content',
    description: 'Without a skip link or landmark structure, a keyboard user has to tab through the entire header/nav on every single page before reaching the main content.',
    wcag: 'WCAG 2.1 — 2.4.1 Bypass Blocks',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['wcag2a', 'wcag241'],
    profiles: ['motor', 'adhd'],
    run({ container, push }) {
      const hasMainLandmark = !!container.querySelector('main, [role="main"]');
      const hasSkipLink = !!container.querySelector('a[href^="#main"], a[href^="#content"], [class*="skip-link" i], [class*="skip-to" i]');
      if (!hasMainLandmark && !hasSkipLink) {
        push({
          html: describeContainer(container, 60),
          target: 'body',
          fix: 'Add a <main> landmark around the primary content, or add a "Skip to content" link as the first focusable element on the page.',
        });
      }
      return 1;
    },
    passReason: () => 'The page has a <main> landmark or a skip link.',
    notApplicableReason: 'No document to check.',
  },
  {
    id: 'positive-tabindex',
    scope: 'static',
    help: 'tabindex values greater than 0 should be avoided',
    description: 'A positive tabindex forces this element earlier in tab order than the page\'s natural reading order, which is confusing for keyboard users and rarely intentional.',
    wcag: 'WCAG 2.1 — 2.4.3 Focus Order',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['best-practice', 'wcag243'],
    profiles: ['motor'],
    run({ container, push }) {
      const els = Array.from(container.querySelectorAll('[tabindex]'));
      for (const el of els) {
        const value = Number(el.getAttribute('tabindex'));
        if (Number.isFinite(value) && value > 0) {
          push({
            html: truncateHtml(el),
            target: selectorFor(el),
            fix: `tabindex="${value}" forces an out-of-order tab stop — use tabindex="0" (natural order) or restructure the markup instead.`,
          });
        }
      }
      return els.length;
    },
    passReason: (n) => `All ${n} tabindex attribute${n === 1 ? '' : 's'} on this page are 0 or negative.`,
    notApplicableReason: 'No tabindex attributes found on this page.',
  },
  {
    id: 'focus-outline-removed',
    scope: 'static',
    help: 'Focus outline should not be disabled inline',
    description: 'An inline style that turns off the focus outline (outline: none/0) with nothing visible replacing it leaves keyboard users with no way to see which element is focused.',
    wcag: 'WCAG 2.1 — 2.4.7 Focus Visible',
    impact: 'serious',
    category: 'navigation',
    level: 'AA',
    tags: ['wcag2aa', 'wcag247'],
    profiles: ['motor', 'low-vision'],
    run({ container, push }) {
      const focusable = Array.from(container.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'));
      const candidates = focusable.filter((el) => /outline\s*:\s*(none|0)/i.test(el.getAttribute('style') ?? ''));
      for (const el of candidates) {
        push({
          html: truncateHtml(el),
          target: selectorFor(el),
          fix: 'Remove the inline outline:none/0, or replace it with another clearly visible focus style (e.g. a box-shadow or border change) applied via :focus-visible.',
        });
      }
      return focusable.length;
    },
    passReason: (n) => `None of the ${n} focusable element${n === 1 ? '' : 's'} disable their focus outline via inline style.`,
    notApplicableReason: 'No focusable elements found on this page.',
  },
  {
    id: 'duplicate-id',
    scope: 'static',
    help: 'id attributes must be unique',
    description: 'Duplicate ids break aria-labelledby/aria-describedby references and <label for> associations, since only the first match resolves.',
    wcag: 'WCAG 2.1 — 4.1.1 Parsing',
    impact: 'moderate',
    category: 'best-practices',
    level: 'A',
    tags: ['wcag2a', 'wcag411'],
    profiles: [],
    run({ container, push }) {
      const seen = new Map<string, Element>();
      const withIds = Array.from(container.querySelectorAll('[id]'));
      for (const el of withIds) {
        const id = el.id;
        if (seen.has(id)) {
          push({
            html: truncateHtml(el),
            target: selectorFor(el),
            fix: `The id "${id}" is used more than once on this page — give each element a unique id.`,
          });
        } else {
          seen.set(id, el);
        }
      }
      return withIds.length;
    },
    passReason: (n) => `All ${n} id attribute${n === 1 ? '' : 's'} on this page are unique.`,
    notApplicableReason: 'No id attributes found on this page.',
  },
  {
    id: 'aria-hidden-focusable',
    scope: 'static',
    help: 'aria-hidden elements must not contain focusable content',
    description: 'aria-hidden="true" removes an element from the accessibility tree, but a keyboard user can still Tab into a focusable descendant — landing on something a screen reader was told doesn\'t exist.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value',
    impact: 'serious',
    category: 'aria',
    level: 'A',
    tags: ['wcag2a', 'wcag412'],
    profiles: ['motor'],
    run({ container, push }) {
      const hidden = Array.from(container.querySelectorAll('[aria-hidden="true"]'));
      const focusableSelector = 'a[href], button, input, select, textarea, [tabindex]';
      for (const el of hidden) {
        const focusableInside = el.matches(focusableSelector) || el.querySelector(focusableSelector);
        if (focusableInside) {
          push({
            html: truncateHtml(el),
            target: selectorFor(el),
            fix: 'Remove aria-hidden from this element, or add tabindex="-1" (and disable any inputs) on every focusable element inside it so keyboard users can\'t reach hidden content.',
          });
        }
      }
      return hidden.length;
    },
    passReason: (n) => `None of the ${n} aria-hidden element${n === 1 ? '' : 's'} on this page trap focusable content.`,
    notApplicableReason: 'No aria-hidden elements found on this page.',
  },
  {
    id: 'aria-valid-reference',
    scope: 'static',
    help: 'ARIA id references must point to a real element',
    description: 'aria-labelledby/aria-describedby/aria-controls/aria-owns pointing at an id that doesn\'t exist silently fails — assistive tech gets nothing instead of the intended label or relationship.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value',
    impact: 'serious',
    category: 'aria',
    level: 'A',
    tags: ['wcag2a', 'wcag412'],
    profiles: [],
    run({ container, push }) {
      const attrs = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant'];
      const els = Array.from(container.querySelectorAll(attrs.map((a) => `[${a}]`).join(', ')));
      for (const el of els) {
        for (const attr of attrs) {
          const value = el.getAttribute(attr);
          if (!value) continue;
          const missing = value.split(/\s+/).filter((id) => id && !resolveId(el, id));
          if (missing.length > 0) {
            push({
              html: truncateHtml(el),
              target: selectorFor(el),
              fix: `${attr}="${value}" references id${missing.length === 1 ? '' : 's'} "${missing.join(', ')}" which don't exist on the page — fix the id, or add the missing element.`,
            });
            break;
          }
        }
      }
      return els.length;
    },
    passReason: (n) => `All ${n} ARIA id reference${n === 1 ? '' : 's'} on this page resolve to a real element.`,
    notApplicableReason: 'No aria-labelledby/describedby/controls/owns/activedescendant attributes found on this page.',
  },
  {
    id: 'color-contrast',
    scope: 'needs-layout',
    help: 'Text must have sufficient contrast against its background',
    description: 'Low-contrast text is the single most common accessibility failure on the web (present on over 80% of home pages per WebAIM\'s annual scan) — it\'s unreadable for visitors with low vision and hard to read for everyone in bright light.',
    wcag: 'WCAG 2.1 — 1.4.3 Contrast (Minimum)',
    impact: 'critical',
    category: 'contrast',
    level: 'AA',
    tags: ['wcag2aa', 'wcag143'],
    profiles: ['low-vision', 'colorblind'],
    run({ container, push, pushIncomplete }) {
      const candidates = Array.from(container.querySelectorAll<HTMLElement>('*')).filter(
        (el) => isLeafTextElement(el) && isVisible(el)
      );
      let checked = 0;
      for (const el of candidates) {
        const style = getComputedStyle(el);
        const textColor = parseRgb(style.color);
        if (!textColor) continue;
        const bgColor = effectiveBackgroundColor(el);
        if (!bgColor) {
          // background-image ancestor — can't reliably sample without canvas
          // rasterization, so this genuinely can't be decided pass/fail. Surface it
          // as incomplete rather than silently excluding it (see ScanStatus's
          // 'incomplete' doc comment — this is the case that motivated the tier).
          pushIncomplete({
            html: truncateHtml(el),
            target: selectorFor(el),
            fix: 'This text sits on a background image, so contrast can\'t be measured automatically — check it manually against the image behind it, or add a solid background-color fallback the text can be measured against.',
          });
          continue;
        }
        checked++;
        const fontSize = parseFloat(style.fontSize);
        const fontWeight = Number(style.fontWeight) || (style.fontWeight === 'bold' ? 700 : 400);
        const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        const threshold = isLarge ? 3 : 4.5;
        const ratio = contrastRatio([textColor[0], textColor[1], textColor[2]], bgColor);
        if (ratio < threshold) {
          push({
            html: truncateHtml(el),
            target: selectorFor(el),
            fix: `Contrast ratio is ${ratio.toFixed(2)}:1, below the required ${threshold}:1 for ${isLarge ? 'large' : 'normal-size'} text — darken the text color, lighten the background, or both, until the ratio clears ${threshold}:1.`,
          });
        }
      }
      return checked;
    },
    passReason: (n) => `All ${n} checked text element${n === 1 ? '' : 's'} meet the required contrast ratio. (Elements with a background image behind them can't be automatically measured — see the incomplete/needs-review section if any were found.)`,
    notApplicableReason: 'No text elements with a checkable (non-image) background were found on this page.',
  },
  {
    id: 'target-size',
    scope: 'needs-layout',
    help: 'Touch targets should be at least 24x24 CSS pixels',
    description: 'A tap target smaller than 24x24px is hard to hit accurately for visitors with limited fine motor control, especially on touchscreens.',
    wcag: 'WCAG 2.2 — 2.5.8 Target Size (Minimum)',
    impact: 'moderate',
    category: 'sizing',
    level: 'AA',
    tags: ['wcag22aa', 'wcag258'],
    profiles: ['motor'],
    run({ container, push }) {
      const targets = Array.from(container.querySelectorAll<HTMLElement>('a[href], button, input:not([type="hidden"]), select, [role="button"]')).filter(
        (el) => isVisible(el) && getComputedStyle(el).display !== 'inline'
      );
      for (const el of targets) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24)) {
          push({
            html: truncateHtml(el),
            target: selectorFor(el),
            fix: `This target is ${Math.round(rect.width)}x${Math.round(rect.height)}px — increase padding or min-width/min-height until it's at least 24x24px, or ensure adequate spacing from neighboring targets.`,
          });
        }
      }
      return targets.length;
    },
    passReason: (n) => `All ${n} checked touch target${n === 1 ? '' : 's'} are at least 24x24px. (Inline text links are exempt per WCAG 2.5.8.)`,
    notApplicableReason: 'No non-inline interactive elements found on this page.',
  },
  {
    id: 'text-spacing-override',
    scope: 'static',
    help: 'Text spacing should not be locked with !important',
    description: 'Some visitors apply a custom stylesheet to increase line-height/letter-spacing/word-spacing for readability — an inline !important on those properties blocks that override entirely.',
    wcag: 'WCAG 2.1 — 1.4.12 Text Spacing',
    impact: 'minor',
    category: 'sizing',
    level: 'AA',
    tags: ['wcag2aa', 'wcag1412'],
    profiles: ['dyslexia', 'low-vision'],
    run({ container, push }) {
      const els = Array.from(container.querySelectorAll<HTMLElement>('[style]'));
      const candidates = els.filter((el) => /(line-height|letter-spacing|word-spacing)\s*:[^;]+!important/i.test(el.getAttribute('style') ?? ''));
      for (const el of candidates) {
        push({
          html: truncateHtml(el),
          target: selectorFor(el),
          fix: 'Remove !important from the inline line-height/letter-spacing/word-spacing declaration so a visitor\'s own stylesheet (or AccessPath\'s own spacing controls) can still override it.',
        });
      }
      return els.length;
    },
    passReason: (n) => `None of the ${n} element${n === 1 ? '' : 's'} with inline styles lock text spacing with !important.`,
    notApplicableReason: 'No elements with inline styles found on this page.',
  },
  {
    id: 'banned-elements',
    scope: 'static',
    help: 'Deprecated blinking/scrolling elements should not be used',
    description: '<blink> and <marquee> force distracting, uncontrollable motion that can\'t be paused — both are obsolete and actively harmful for visitors with attention or vestibular conditions.',
    wcag: 'WCAG 2.1 — 2.2.2 Pause, Stop, Hide',
    impact: 'moderate',
    category: 'best-practices',
    level: 'A',
    tags: ['wcag2a', 'wcag222'],
    profiles: ['seizure', 'adhd'],
    run({ container, push }) {
      const els = Array.from(container.querySelectorAll('blink, marquee'));
      for (const el of els) {
        push({ html: truncateHtml(el), target: selectorFor(el), fix: `Replace this <${el.tagName.toLowerCase()}> with normal markup and, if animation is wanted, a CSS animation that respects prefers-reduced-motion.` });
      }
      return 1;
    },
    passReason: () => 'No <blink> or <marquee> elements found.',
    notApplicableReason: 'No document to check.',
  },
  {
    id: 'meta-refresh',
    documentScope: true,
    scope: 'static',
    help: 'The page should not auto-refresh with a fixed delay',
    description: 'A timed <meta http-equiv="refresh"> redirect can fire before a visitor using a screen reader or extra reading time has finished the page, with no way to stop or extend it.',
    wcag: 'WCAG 2.1 — 2.2.1 Timing Adjustable, 2.2.4 Interruptions',
    impact: 'serious',
    category: 'best-practices',
    level: 'A',
    tags: ['wcag2a', 'wcag221'],
    profiles: ['seizure', 'adhd'],
    run({ push }) {
      const meta = document.querySelector('meta[http-equiv="refresh" i]');
      const content = meta?.getAttribute('content') ?? '';
      const delay = parseFloat(content);
      if (meta && Number.isFinite(delay) && delay > 0) {
        push({ html: truncateHtml(meta, 100), target: 'meta[http-equiv="refresh"]', fix: 'Remove the timed refresh, or replace it with a mechanism the visitor can pause/extend/turn off themselves.' });
      }
      return 1;
    },
    passReason: () => 'No timed meta-refresh redirect found.',
    notApplicableReason: 'No document to check.',
  },
  {
    id: 'meta-viewport',
    documentScope: true,
    scope: 'static',
    help: 'The viewport should allow zooming to at least 200%',
    description: 'user-scalable=no or a low maximum-scale in the viewport meta tag blocks visitors with low vision from zooming in, which WCAG requires be possible up to 200%.',
    wcag: 'WCAG 2.1 — 1.4.4 Resize Text',
    impact: 'serious',
    category: 'sizing',
    level: 'AA',
    tags: ['wcag2aa', 'wcag144'],
    profiles: ['low-vision'],
    run({ push }) {
      const meta = document.querySelector('meta[name="viewport" i]');
      const content = meta?.getAttribute('content') ?? '';
      const blocksZoom = /user-scalable\s*=\s*no/i.test(content);
      const maxScaleMatch = content.match(/maximum-scale\s*=\s*([\d.]+)/i);
      const maxScale = maxScaleMatch ? parseFloat(maxScaleMatch[1]) : null;
      if (meta && (blocksZoom || (maxScale !== null && maxScale < 2))) {
        push({ html: truncateHtml(meta, 100), target: 'meta[name="viewport"]', fix: 'Remove user-scalable=no and any maximum-scale below 2 from the viewport meta tag so visitors can zoom to at least 200%.' });
      }
      return 1;
    },
    passReason: () => 'The viewport meta tag allows zooming to at least 200% (or sets no restriction).',
    notApplicableReason: 'No viewport meta tag found.',
  },
  {
    id: 'autocomplete-valid',
    scope: 'static',
    help: 'autocomplete values should be recognized tokens',
    description: 'A misspelled or made-up autocomplete value (e.g. autocomplete="fullname") silently does nothing — browsers and assistive tech only act on the standard token list.',
    wcag: 'WCAG 2.1 — 1.3.5 Identify Input Purpose',
    impact: 'minor',
    category: 'best-practices',
    level: 'AA',
    tags: ['wcag2aa', 'wcag135'],
    profiles: ['motor'],
    run({ container, push }) {
      const KNOWN = new Set([
        'on', 'off', 'name', 'honorific-prefix', 'given-name', 'additional-name', 'family-name', 'honorific-suffix',
        'nickname', 'email', 'username', 'new-password', 'current-password', 'one-time-code', 'organization-title',
        'organization', 'street-address', 'address-line1', 'address-line2', 'address-line3', 'address-level4',
        'address-level3', 'address-level2', 'address-level1', 'country', 'country-name', 'postal-code', 'cc-name',
        'cc-given-name', 'cc-additional-name', 'cc-family-name', 'cc-number', 'cc-exp', 'cc-exp-month', 'cc-exp-year',
        'cc-csc', 'cc-type', 'transaction-currency', 'transaction-amount', 'language', 'bday', 'bday-day', 'bday-month',
        'bday-year', 'sex', 'tel', 'tel-country-code', 'tel-national', 'tel-area-code', 'tel-local', 'tel-extension',
        'url', 'photo',
      ]);
      const els = Array.from(container.querySelectorAll<HTMLElement>('[autocomplete]'));
      for (const el of els) {
        const raw = el.getAttribute('autocomplete')!.trim().toLowerCase();
        const tokens = raw.split(/\s+/);
        const lastToken = tokens[tokens.length - 1];
        if (!KNOWN.has(lastToken)) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: `autocomplete="${raw}" isn't a recognized token — use one from the WHATWG autofill field list, e.g. "email", "given-name", "street-address".` });
        }
      }
      return els.length;
    },
    passReason: (n) => `All ${n} autocomplete attribute${n === 1 ? '' : 's'} use a recognized token.`,
    notApplicableReason: 'No autocomplete attributes found on this page.',
  },
  {
    id: 'color-contrast-enhanced',
    scope: 'needs-layout',
    help: 'Text should meet AAA enhanced contrast where possible',
    description: 'WCAG\'s enhanced (AAA) contrast threshold — 7:1 for normal text, 4.5:1 for large text — goes beyond the AA minimum and helps visitors with more significant low vision.',
    wcag: 'WCAG 2.1 — 1.4.6 Contrast (Enhanced)',
    impact: 'minor',
    category: 'contrast',
    level: 'AAA',
    tags: ['wcag2aaa', 'wcag146'],
    profiles: ['low-vision', 'colorblind'],
    run({ container, push, pushIncomplete }) {
      const candidates = Array.from(container.querySelectorAll<HTMLElement>('*')).filter((el) => isLeafTextElement(el) && isVisible(el));
      let checked = 0;
      for (const el of candidates) {
        const style = getComputedStyle(el);
        const textColor = parseRgb(style.color);
        if (!textColor) continue;
        const bgColor = effectiveBackgroundColor(el);
        if (!bgColor) {
          pushIncomplete({
            html: truncateHtml(el),
            target: selectorFor(el),
            fix: 'This text sits on a background image, so contrast can\'t be measured automatically — check it manually against the image behind it.',
          });
          continue;
        }
        checked++;
        const fontSize = parseFloat(style.fontSize);
        const fontWeight = Number(style.fontWeight) || (style.fontWeight === 'bold' ? 700 : 400);
        const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        const threshold = isLarge ? 4.5 : 7;
        const ratio = contrastRatio([textColor[0], textColor[1], textColor[2]], bgColor);
        if (ratio < threshold) {
          push({
            html: truncateHtml(el),
            target: selectorFor(el),
            fix: `Contrast ratio is ${ratio.toFixed(2)}:1, below the AAA-enhanced ${threshold}:1 for ${isLarge ? 'large' : 'normal-size'} text. This is a stretch goal beyond the AA minimum, not required for standard compliance.`,
          });
        }
      }
      return checked;
    },
    passReason: (n) => `All ${n} checked text element${n === 1 ? '' : 's'} meet the AAA enhanced contrast ratio.`,
    notApplicableReason: 'No text elements with a checkable (non-image) background were found on this page.',
  },
  {
    id: 'identical-links-same-purpose',
    scope: 'static',
    help: 'Links with the same name should lead to the same place',
    description: 'Two different links sharing identical accessible text (e.g. two "Read more" links) but pointing at different destinations forces a screen-reader user navigating by link name to guess which is which.',
    wcag: 'WCAG 2.1 — 2.4.9 Link Purpose (Link Only)',
    impact: 'minor',
    category: 'names-labels',
    level: 'AAA',
    tags: ['wcag2aaa', 'wcag249'],
    profiles: ['adhd'],
    run({ container, push }) {
      const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'));
      const byName = new Map<string, Set<string>>();
      for (const link of links) {
        const name = accessibleNameOf(link).trim().toLowerCase();
        if (!name) continue;
        const dest = link.getAttribute('href') ?? '';
        if (!byName.has(name)) byName.set(name, new Set());
        byName.get(name)!.add(dest);
      }
      const flagged = new Set<string>();
      for (const [name, dests] of byName) {
        if (dests.size > 1) flagged.add(name);
      }
      for (const link of links) {
        const name = accessibleNameOf(link).trim().toLowerCase();
        if (flagged.has(name)) {
          push({ html: truncateHtml(link), target: selectorFor(link), fix: `Multiple links share the text "${name}" but point at different destinations — give each a more specific accessible name (e.g. "Read more about pricing"), or make them point to the same place.` });
        }
      }
      return links.length;
    },
    passReason: (n) => `None of the ${n} link${n === 1 ? '' : 's'} share identical text while pointing at different destinations.`,
    notApplicableReason: 'No links found on this page.',
  },
  {
    id: 'aria-hidden-body',
    documentScope: true,
    scope: 'static',
    help: 'aria-hidden="true" must not be present on the document body',
    description: 'aria-hidden on <body> would hide the entire page from assistive technology — almost always a mistake, typically left over from a modal library that forgot to clean up.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value',
    impact: 'critical',
    category: 'aria',
    level: 'A',
    tags: ['wcag2a', 'wcag412'],
    profiles: [],
    run({ push }) {
      const body = document.body;
      if (body?.getAttribute('aria-hidden') === 'true') {
        push({ html: truncateHtml(body, 60), target: 'body', fix: 'Remove aria-hidden="true" from <body> — this hides the entire page from screen readers.' });
      }
      return 1;
    },
    passReason: () => 'aria-hidden="true" is not present on <body>.',
    notApplicableReason: 'No document to check.',
  },
  {
    id: 'aria-valid-attr',
    scope: 'static',
    help: 'Attributes starting with aria- must be real ARIA attributes',
    description: 'A misspelled ARIA attribute (e.g. aria-lable instead of aria-label) is silently ignored by browsers and assistive tech — it looks right in the markup but does nothing.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value',
    impact: 'serious',
    category: 'aria',
    level: 'A',
    tags: ['wcag2a', 'wcag412'],
    profiles: [],
    run({ container, push }) {
      const els = Array.from(container.querySelectorAll<HTMLElement>('*'));
      let checked = 0;
      for (const el of els) {
        for (const attr of Array.from(el.attributes)) {
          if (!attr.name.startsWith('aria-')) continue;
          checked++;
          if (!VALID_ARIA_ATTRS.has(attr.name)) {
            push({ html: truncateHtml(el), target: selectorFor(el), fix: `"${attr.name}" isn't a recognized ARIA attribute — check for a typo (e.g. aria-label, not aria-lable).` });
          }
        }
      }
      return checked;
    },
    passReason: (n) => `All ${n} aria-* attribute${n === 1 ? '' : 's'} on this page are recognized ARIA attributes.`,
    notApplicableReason: 'No aria-* attributes found on this page.',
  },
  {
    id: 'aria-valid-attr-value',
    scope: 'static',
    help: 'ARIA attributes must have valid values',
    description: 'Boolean/enum ARIA attributes like aria-checked or aria-live only work with a specific set of values — an unrecognized value (e.g. aria-checked="yes") is treated as invalid and ignored.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value',
    impact: 'serious',
    category: 'aria',
    level: 'A',
    tags: ['wcag2a', 'wcag412'],
    profiles: [],
    run({ container, push }) {
      let checked = 0;
      for (const [attr, validValues] of Object.entries(ARIA_ATTR_VALID_VALUES)) {
        const els = Array.from(container.querySelectorAll<HTMLElement>(`[${attr}]`));
        for (const el of els) {
          checked++;
          const value = el.getAttribute(attr)!.trim().toLowerCase();
          if (!validValues.includes(value)) {
            push({ html: truncateHtml(el), target: selectorFor(el), fix: `${attr}="${value}" isn't valid — use one of: ${validValues.join(', ')}.` });
          }
        }
      }
      return checked;
    },
    passReason: (n) => `All ${n} checked ARIA attribute value${n === 1 ? '' : 's'} are valid.`,
    notApplicableReason: 'No value-checkable ARIA attributes (aria-checked, aria-live, aria-current, etc.) found on this page.',
  },
  {
    id: 'aria-allowed-attr',
    scope: 'static',
    help: 'ARIA attributes must be supported by the element\'s role',
    description: 'An ARIA state/property that the element\'s role doesn\'t support (e.g. aria-checked on a plain button) is ignored by assistive tech — it looks meaningful in the markup but does nothing.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value',
    impact: 'moderate',
    category: 'aria',
    level: 'A',
    tags: ['wcag2a', 'wcag412'],
    profiles: [],
    run({ container, push }) {
      const roleNames = Object.keys(ROLE_ALLOWED_EXTRA_ATTRS);
      const els = Array.from(container.querySelectorAll<HTMLElement>(roleNames.map((r) => `[role="${r}"]`).join(', ')));
      for (const el of els) {
        const role = el.getAttribute('role')!;
        const allowed = new Set([...GLOBAL_ARIA_ATTRS, ...(ROLE_ALLOWED_EXTRA_ATTRS[role] ?? [])]);
        const unsupported = Array.from(el.attributes)
          .map((a) => a.name)
          .filter((name) => name.startsWith('aria-') && VALID_ARIA_ATTRS.has(name) && !allowed.has(name));
        if (unsupported.length > 0) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: `role="${role}" doesn't support ${unsupported.join(', ')} — remove ${unsupported.length === 1 ? 'it' : 'them'}, or use a role that does.` });
        }
      }
      return els.length;
    },
    passReason: (n) => `All ${n} checked element${n === 1 ? '' : 's'} only use ARIA attributes their role supports.`,
    notApplicableReason: 'No elements with a checkable ARIA role were found on this page.',
  },
  {
    id: 'aria-allowed-role',
    scope: 'static',
    help: 'role values must be valid ARIA roles',
    description: 'A misspelled or made-up role attribute (e.g. role="buton") is not a recognized ARIA role, so the element falls back to no semantic role at all.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value (best practice)',
    impact: 'moderate',
    category: 'aria',
    level: 'A',
    tags: ['best-practice', 'wcag412'],
    profiles: [],
    run({ container, push }) {
      const els = Array.from(container.querySelectorAll<HTMLElement>('[role]'));
      for (const el of els) {
        const role = (el.getAttribute('role') ?? '').trim().split(/\s+/)[0].toLowerCase();
        if (role && !VALID_ARIA_ROLES.has(role)) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: `role="${role}" isn't a recognized ARIA role — check for a typo, or remove it if it's not needed.` });
        }
      }
      return els.length;
    },
    passReason: (n) => `All ${n} role attribute${n === 1 ? '' : 's'} on this page use a recognized ARIA role.`,
    notApplicableReason: 'No role attributes found on this page.',
  },
  {
    id: 'aria-prohibited-attr',
    scope: 'static',
    help: 'aria-label/aria-labelledby/aria-describedby must not be used on presentational elements',
    description: 'role="presentation"/"none" tells assistive tech this element carries no semantic meaning — adding an accessible-name attribute on top of that is contradictory and gets dropped.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value (best practice)',
    impact: 'minor',
    category: 'aria',
    level: 'A',
    tags: ['best-practice', 'wcag412'],
    profiles: [],
    run({ container, push }) {
      const els = Array.from(container.querySelectorAll<HTMLElement>('[role="presentation"], [role="none"]'));
      for (const el of els) {
        const naming = ['aria-label', 'aria-labelledby', 'aria-describedby'].filter((a) => el.hasAttribute(a));
        if (naming.length > 0) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: `role="${el.getAttribute('role')}" conflicts with ${naming.join(', ')} — remove the naming attribute${naming.length === 1 ? '' : 's'}, or remove the presentational role if this element does carry meaning.` });
        }
      }
      return els.length;
    },
    passReason: (n) => `None of the ${n} presentational element${n === 1 ? '' : 's'} also carry a naming attribute.`,
    notApplicableReason: 'No role="presentation"/"none" elements found on this page.',
  },
  {
    id: 'landmark-one-main',
    scope: 'static',
    help: 'The document should have exactly one main landmark',
    description: 'A <main>/[role="main"] landmark tells assistive tech where the primary content starts — having none (or more than one) removes that single clear jump-to-content target.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships (best practice)',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['best-practice'],
    profiles: ['motor', 'adhd'],
    run({ container, push }) {
      const mains = Array.from(container.querySelectorAll('main, [role="main"]'));
      if (mains.length !== 1) {
        push({ html: describeContainer(container, 60), target: 'body', fix: mains.length === 0 ? 'Add a single <main> element wrapping the primary content.' : `There are ${mains.length} main landmarks — keep only one.` });
      }
      return 1;
    },
    passReason: () => 'The document has exactly one main landmark.',
    notApplicableReason: 'No document to check.',
  },
  {
    id: 'landmark-no-duplicate-main',
    scope: 'static',
    help: 'The document should have at most one main landmark',
    description: 'Multiple <main>/[role="main"] elements confuse assistive tech\'s "jump to main content" navigation — it should point at exactly one place.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships (best practice)',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['best-practice'],
    profiles: ['motor', 'adhd'],
    run({ container, push }) {
      const mains = Array.from(container.querySelectorAll('main, [role="main"]'));
      if (mains.length > 1) {
        for (const m of mains) push({ html: truncateHtml(m), target: selectorFor(m), fix: `There are ${mains.length} main landmarks on this page — keep only one.` });
      }
      return 1;
    },
    passReason: () => 'The document has at most one main landmark.',
    notApplicableReason: 'No document to check.',
  },
  {
    id: 'landmark-no-duplicate-banner',
    scope: 'static',
    help: 'The document should have at most one banner landmark',
    description: 'A <header>/[role="banner"] at the page level represents site-wide header content — more than one is ambiguous for assistive tech users jumping between landmarks.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships (best practice)',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['best-practice'],
    profiles: ['motor', 'adhd'],
    run({ container, push }) {
      const banners = Array.from(container.querySelectorAll('body > header, [role="banner"]'));
      if (banners.length > 1) {
        for (const b of banners) push({ html: truncateHtml(b), target: selectorFor(b), fix: `There are ${banners.length} banner landmarks on this page — keep only one top-level <header>.` });
      }
      return 1;
    },
    passReason: () => 'The document has at most one banner landmark.',
    notApplicableReason: 'No document to check.',
  },
  {
    id: 'landmark-no-duplicate-contentinfo',
    scope: 'static',
    help: 'The document should have at most one contentinfo landmark',
    description: 'A <footer>/[role="contentinfo"] at the page level represents site-wide footer content (copyright, sitemap links) — more than one is ambiguous for assistive tech users.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships (best practice)',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['best-practice'],
    profiles: ['motor', 'adhd'],
    run({ container, push }) {
      const footers = Array.from(container.querySelectorAll('body > footer, [role="contentinfo"]'));
      if (footers.length > 1) {
        for (const f of footers) push({ html: truncateHtml(f), target: selectorFor(f), fix: `There are ${footers.length} contentinfo landmarks on this page — keep only one top-level <footer>.` });
      }
      return 1;
    },
    passReason: () => 'The document has at most one contentinfo landmark.',
    notApplicableReason: 'No document to check.',
  },
  {
    id: 'landmark-banner-is-top-level',
    scope: 'static',
    help: 'The banner landmark must not be nested inside another landmark',
    description: 'A <header>/[role="banner"] only counts as the page banner when it\'s a direct top-level landmark — nested inside <main> or another landmark, it loses that meaning.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships (best practice)',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['best-practice'],
    profiles: ['motor', 'adhd'],
    run({ container, push }) {
      const banners = Array.from(container.querySelectorAll('header, [role="banner"]'));
      for (const b of banners) {
        const nested = b.parentElement?.closest(LANDMARK_SELECTOR);
        if (nested && nested !== b) {
          push({ html: truncateHtml(b), target: selectorFor(b), fix: 'Move this <header> so it\'s a direct child of <body> (or otherwise not nested inside another landmark), or remove role="banner" if it\'s not meant to be the page banner.' });
        }
      }
      return banners.length;
    },
    passReason: (n) => `All ${n} banner landmark${n === 1 ? '' : 's'} are top-level, not nested inside another landmark.`,
    notApplicableReason: 'No banner landmarks found on this page.',
  },
  {
    id: 'landmark-main-is-top-level',
    scope: 'static',
    help: 'The main landmark must not be nested inside another landmark',
    description: 'A <main>/[role="main"] only counts as the primary-content landmark when it\'s top-level — nested inside another landmark, assistive tech\'s "skip to main" loses its meaning.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships (best practice)',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['best-practice'],
    profiles: ['motor', 'adhd'],
    run({ container, push }) {
      const mains = Array.from(container.querySelectorAll('main, [role="main"]'));
      for (const m of mains) {
        const nested = m.parentElement?.closest(LANDMARK_SELECTOR);
        if (nested && nested !== m) {
          push({ html: truncateHtml(m), target: selectorFor(m), fix: 'Move this <main> so it\'s not nested inside another landmark (header/nav/aside/footer/etc).' });
        }
      }
      return mains.length;
    },
    passReason: (n) => `All ${n} main landmark${n === 1 ? '' : 's'} are top-level, not nested inside another landmark.`,
    notApplicableReason: 'No main landmarks found on this page.',
  },
  {
    id: 'landmark-unique',
    scope: 'static',
    help: 'Repeated landmark roles must have distinct accessible names',
    description: 'Two <nav> elements (or two <section aria-label>, etc.) with the same role and no distinguishing name both announce as just "navigation" — a visitor can\'t tell them apart when jumping between landmarks.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships (best practice)',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['best-practice'],
    profiles: ['motor', 'adhd'],
    run({ container, push }) {
      const repeatable = Array.from(container.querySelectorAll('nav, [role="navigation"], aside, [role="complementary"], section[aria-label], section[aria-labelledby], [role="region"]'));
      const seen = new Map<string, number>();
      for (const el of repeatable) {
        const role = el.getAttribute('role') ?? el.tagName.toLowerCase();
        const name = accessibleNameOf(el).trim().toLowerCase();
        const key = role + '|' + name;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      for (const el of repeatable) {
        const role = el.getAttribute('role') ?? el.tagName.toLowerCase();
        const name = accessibleNameOf(el).trim().toLowerCase();
        const key = role + '|' + name;
        if ((seen.get(key) ?? 0) > 1) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: `Multiple "${role}" landmarks share the ${name ? `name "${name}"` : 'same (empty) name'} — add a distinct aria-label to each so they can be told apart.` });
        }
      }
      return repeatable.length;
    },
    passReason: (n) => `All ${n} repeatable landmark${n === 1 ? '' : 's'} on this page have distinct names.`,
    notApplicableReason: 'No repeatable landmarks (nav, aside, labeled section/region) found on this page.',
  },
  {
    id: 'region',
    scope: 'static',
    help: 'Page content should be contained by a landmark',
    description: 'Text or controls sitting directly in <body> (outside any header/nav/main/aside/footer) fall outside the landmark structure assistive tech users rely on to navigate by region.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships (best practice)',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['best-practice'],
    profiles: ['motor', 'adhd'],
    run({ container, push }) {
      // 'in' narrows container to the Element branch of ScanRoot — Document/ShadowRoot
      // roots (Task 6) have no tagName at all, so they always fall through to
      // querySelector('body'), which correctly finds nothing for a ShadowRoot (no
      // <body> ever exists inside one) and the real body for an iframe's Document.
      const body = 'tagName' in container && container.tagName === 'BODY' ? container : container.querySelector('body');
      if (!body) return 0;
      const strays = Array.from(body.children).filter((el) => {
        const tag = el.tagName.toLowerCase();
        if (['script', 'style', 'link', 'noscript', 'template'].includes(tag)) return false;
        if (el.closest(LANDMARK_SELECTOR)) return false;
        if (el.matches(LANDMARK_SELECTOR)) return false;
        return (el.textContent ?? '').trim().length > 0 || el.querySelector('a, button, input, select, textarea');
      });
      for (const el of strays) {
        push({ html: truncateHtml(el), target: selectorFor(el), fix: 'Wrap this content in a landmark region — <main> for primary content, <nav> for navigation, <aside> for tangential content, or <footer> for site-wide footer content.' });
      }
      return 1;
    },
    passReason: () => 'All top-level page content is contained within a landmark region.',
    notApplicableReason: 'No document to check.',
  },
  {
    id: 'nested-interactive',
    scope: 'static',
    help: 'Interactive controls should not be nested inside each other',
    description: 'A button inside a link (or any interactive-in-interactive nesting) is not reliably announced by screen readers, and click targets become ambiguous.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value (best practice)',
    impact: 'serious',
    category: 'aria',
    level: 'A',
    tags: ['best-practice', 'wcag412'],
    profiles: ['motor'],
    run({ container, push }) {
      const interactive = Array.from(container.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR));
      for (const el of interactive) {
        const nestedInside = el.parentElement?.closest(INTERACTIVE_SELECTOR);
        if (nestedInside) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: 'Restructure the markup so interactive elements don\'t nest — e.g. move this control outside the enclosing link/button, or replace the outer wrapper with a non-interactive element plus a separate click handler.' });
        }
      }
      return interactive.length;
    },
    passReason: (n) => `None of the ${n} interactive element${n === 1 ? '' : 's'} are nested inside another interactive element.`,
    notApplicableReason: 'No interactive elements found on this page.',
  },
  {
    id: 'presentation-role-conflict',
    scope: 'static',
    help: 'Presentational elements should not carry global ARIA or tabindex',
    description: 'role="presentation"/"none" tells assistive tech to ignore this element\'s semantics — a global ARIA attribute or tabindex on it contradicts that and can produce inconsistent behavior across screen readers.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value (best practice)',
    impact: 'minor',
    category: 'aria',
    level: 'A',
    tags: ['best-practice', 'wcag412'],
    profiles: [],
    run({ container, push }) {
      const els = Array.from(container.querySelectorAll<HTMLElement>('[role="presentation"], [role="none"]'));
      for (const el of els) {
        const hasGlobalAria = Array.from(el.attributes).some((a) => a.name.startsWith('aria-') && GLOBAL_ARIA_ATTRS.has(a.name) && a.name !== 'aria-hidden');
        const hasTabindex = el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1';
        if (hasGlobalAria || hasTabindex) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: 'Remove the global ARIA attribute(s) and/or tabindex from this presentational element, or remove role="presentation"/"none" if it does need to be exposed to assistive tech.' });
        }
      }
      return els.length;
    },
    passReason: (n) => `None of the ${n} presentational element${n === 1 ? '' : 's'} carry a conflicting global ARIA attribute or tabindex.`,
    notApplicableReason: 'No role="presentation"/"none" elements found on this page.',
  },
  {
    id: 'scrollable-region-focusable',
    scope: 'needs-layout',
    help: 'Scrollable regions must be keyboard accessible',
    description: 'An element with its own scrollable overflow that contains no focusable child needs tabindex="0" itself, or keyboard users can\'t scroll it — Safari in particular won\'t let arrow keys reach an unfocusable scroll container.',
    wcag: 'WCAG 2.1 — 2.1.1 Keyboard',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['wcag2a', 'wcag211'],
    profiles: ['motor'],
    run({ container, push }) {
      const all = Array.from(container.querySelectorAll<HTMLElement>('*'));
      const scrollable = all.filter((el) => {
        const style = getComputedStyle(el);
        const overflowsY = style.overflowY === 'auto' || style.overflowY === 'scroll';
        const overflowsX = style.overflowX === 'auto' || style.overflowX === 'scroll';
        if (!overflowsY && !overflowsX) return false;
        return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
      });
      for (const el of scrollable) {
        const hasFocusableChild = !!el.querySelector(INTERACTIVE_SELECTOR);
        const isFocusable = el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1';
        if (!hasFocusableChild && !isFocusable) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: 'Add tabindex="0" to this scrollable element so keyboard users can focus and scroll it.' });
        }
      }
      return scrollable.length;
    },
    passReason: (n) => `All ${n} scrollable region${n === 1 ? '' : 's'} are keyboard accessible.`,
    notApplicableReason: 'No scrollable regions found on this page.',
  },

  // --- Table semantics (docs/wcag-check.md Task 4 item 1) --------------------------
  {
    id: 'scope-attr-valid',
    scope: 'static',
    help: 'The scope attribute must have a valid value',
    description: 'The scope attribute on a table header cell only works with a specific set of values — an invalid value (e.g. scope="cell") is ignored, leaving the header/data-cell relationship unclear to assistive tech.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships',
    impact: 'moderate',
    category: 'best-practices',
    level: 'A',
    tags: ['wcag2a', 'wcag131'],
    profiles: [],
    run({ container, push }) {
      const VALID = ['row', 'col', 'rowgroup', 'colgroup'];
      const els = Array.from(container.querySelectorAll<HTMLElement>('[scope]'));
      for (const el of els) {
        const value = (el.getAttribute('scope') ?? '').trim().toLowerCase();
        if (!VALID.includes(value)) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: `scope="${value}" isn't valid — use one of: row, col, rowgroup, colgroup.` });
        }
      }
      return els.length;
    },
    passReason: (n) => `All ${n} scope attribute${n === 1 ? '' : 's'} on this page use a valid value.`,
    notApplicableReason: 'No scope attributes found on this page.',
  },
  {
    id: 'td-headers-attr',
    scope: 'static',
    help: 'The headers attribute must reference real header cells',
    description: 'A table cell\'s headers attribute lists the ids of the header cells that describe it — if an id doesn\'t exist (or doesn\'t point at a <th>), assistive tech loses that header/data relationship entirely.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships',
    impact: 'serious',
    category: 'best-practices',
    level: 'A',
    tags: ['wcag2a', 'wcag131'],
    profiles: [],
    run({ container, push }) {
      const cells = Array.from(container.querySelectorAll<HTMLElement>('td[headers], th[headers]'));
      for (const cell of cells) {
        const ids = (cell.getAttribute('headers') ?? '').trim().split(/\s+/).filter(Boolean);
        const bad = ids.filter((id) => resolveId(cell, id)?.tagName !== 'TH');
        if (bad.length > 0) {
          push({ html: truncateHtml(cell), target: selectorFor(cell), fix: `headers="${cell.getAttribute('headers')}" references id${bad.length === 1 ? '' : 's'} "${bad.join(', ')}" that don't exist or aren't a <th> — fix the id(s) or add the missing header cell.` });
        }
      }
      return cells.length;
    },
    passReason: (n) => `All ${n} headers attribute${n === 1 ? '' : 's'} on this page reference a real <th> element.`,
    notApplicableReason: 'No table cells with a headers attribute found on this page.',
  },
  {
    id: 'th-has-data-cells',
    scope: 'static',
    help: 'Header cells in complex tables need an explicit scope or headers association',
    description: 'A table with header cells spread across more than one row or column (a "complex" table) can\'t rely on simple first-row/first-column position to convey which header goes with which data — each header needs a scope attribute or an explicit headers reference, or assistive tech can\'t tell which one applies.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships',
    impact: 'moderate',
    category: 'best-practices',
    level: 'A',
    tags: ['wcag2a', 'wcag131'],
    profiles: [],
    run({ container, push }) {
      const tables = Array.from(container.querySelectorAll('table'));
      let checked = 0;
      for (const table of tables) {
        const ths = Array.from(table.querySelectorAll('th'));
        if (ths.length === 0) continue;
        const headerRows = new Set(ths.map((th) => th.closest('tr')));
        // A table is "complex" only if header cells span more than one row AND at
        // least one of those rows mixes headers with plain data cells — a simple
        // single header row (or a single header column) is exempt, since implicit
        // position-based association is unambiguous there. False-positive-averse,
        // same bias as the rest of this file.
        const isComplex = headerRows.size > 1 && ths.some((th) => (th.closest('tr')?.querySelectorAll('td').length ?? 0) > 0);
        if (!isComplex) continue;
        const referencedIds = new Set<string>();
        table.querySelectorAll('[headers]').forEach((el) => {
          (el.getAttribute('headers') ?? '').trim().split(/\s+/).filter(Boolean).forEach((id) => referencedIds.add(id));
        });
        for (const th of ths) {
          checked++;
          const hasScope = !!th.getAttribute('scope')?.trim();
          const isReferenced = !!th.id && referencedIds.has(th.id);
          if (!hasScope && !isReferenced) {
            push({ html: truncateHtml(th), target: selectorFor(th), fix: 'This table mixes header cells across multiple rows/columns — add a scope="col"/"row" attribute to this header, or give it an id and reference it from the data cells\' headers attribute.' });
          }
        }
      }
      return checked;
    },
    passReason: (n) => `All ${n} header cell${n === 1 ? '' : 's'} in complex tables on this page have an explicit scope or headers association.`,
    notApplicableReason: 'No complex data tables (header cells spanning multiple rows/columns) found on this page.',
  },
  {
    id: 'table-caption',
    scope: 'static',
    help: 'Data tables should have a caption or accessible name',
    description: 'A <caption> (or aria-label/aria-labelledby) tells a screen-reader user what a table is for before they start navigating its cells — without one, a visitor has to infer the table\'s purpose from its contents alone.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships (best practice)',
    impact: 'minor',
    category: 'best-practices',
    level: 'A',
    tags: ['best-practice'],
    profiles: ['dyslexia'],
    run({ container, push }) {
      const tables = Array.from(container.querySelectorAll('table')).filter((t) => t.querySelector('th'));
      for (const table of tables) {
        const hasCaption = !!table.querySelector('caption')?.textContent?.trim();
        const hasAriaName = !!(table.getAttribute('aria-label')?.trim() || table.getAttribute('aria-labelledby'));
        if (!hasCaption && !hasAriaName) {
          push({ html: truncateHtml(table, 100), target: selectorFor(table), fix: 'Add a <caption> as the table\'s first child describing what the table shows, or an aria-label/aria-labelledby on the <table>.' });
        }
      }
      return tables.length;
    },
    passReason: (n) => `All ${n} data table${n === 1 ? '' : 's'} have a caption or accessible name.`,
    notApplicableReason: 'No data tables (tables with header cells) found on this page.',
  },

  // --- Grouped form controls (docs/wcag-check.md Task 4 item 2) --------------------
  {
    id: 'fieldset-legend-group',
    scope: 'static',
    help: 'Radio and checkbox groups need a fieldset/legend or a named group role',
    description: 'When two or more radio buttons or checkboxes share a name (a single question with multiple options), a screen-reader user needs to hear the group\'s question once, not repeated per option — a <fieldset>+<legend> (or a named role="group"/"radiogroup") provides that.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships',
    impact: 'serious',
    category: 'best-practices',
    level: 'A',
    tags: ['wcag2a', 'wcag131'],
    profiles: [],
    run({ container, push }) {
      const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"][name], input[type="checkbox"][name]'));
      const byName = new Map<string, HTMLInputElement[]>();
      for (const input of inputs) {
        const key = input.type + '|' + input.name;
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key)!.push(input);
      }
      let checked = 0;
      for (const group of byName.values()) {
        if (group.length < 2) continue;
        checked++;
        const hasFieldset = group.every((input) => {
          const fieldset = input.closest('fieldset');
          return !!fieldset && !!fieldset.querySelector('legend')?.textContent?.trim();
        });
        const namedGroupAncestor = group[0].closest('[role="group"], [role="radiogroup"]');
        const hasNamedGroupRole = !!namedGroupAncestor && group.every((input) => namedGroupAncestor.contains(input)) && !!accessibleNameOf(namedGroupAncestor);
        if (!hasFieldset && !hasNamedGroupRole) {
          push({ html: truncateHtml(group[0]), target: selectorFor(group[0]), fix: `These ${group.length} ${group[0].type} inputs share the name "${group[0].name}" but aren't wrapped in a <fieldset> with a <legend>, and no named role="group"/"radiogroup" wraps them — a screen reader can't tell they're one question.` });
        }
      }
      return checked;
    },
    passReason: (n) => `All ${n} radio/checkbox group${n === 1 ? '' : 's'} on this page have a fieldset/legend or a named group role.`,
    notApplicableReason: 'No radio or checkbox groups (2+ inputs sharing a name) found on this page.',
  },

  // --- ARIA required context (docs/wcag-check.md Task 4 item 3) --------------------
  {
    id: 'aria-required-attr',
    scope: 'static',
    help: 'Elements must have the ARIA attributes their role requires',
    description: 'Some ARIA roles are meaningless without a specific state attribute — a role="checkbox" with no aria-checked, for instance, tells assistive tech "this is a checkbox" but never says whether it\'s checked.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value',
    impact: 'serious',
    category: 'aria',
    level: 'A',
    tags: ['wcag2a', 'wcag412'],
    profiles: [],
    run({ container, push }) {
      const roleNames = Object.keys(ROLE_REQUIRED_ATTRS);
      const els = Array.from(container.querySelectorAll<HTMLElement>(roleNames.map((r) => `[role="${r}"]`).join(', ')));
      for (const el of els) {
        const role = el.getAttribute('role')!;
        const required = ROLE_REQUIRED_ATTRS[role];
        const missing = required.filter((attr) => !el.hasAttribute(attr));
        if (missing.length > 0) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: `role="${role}" requires ${missing.join(', ')} — add ${missing.length === 1 ? 'it' : 'them'} so assistive tech knows this element's current state.` });
        }
      }
      return els.length;
    },
    passReason: (n) => `All ${n} checked element${n === 1 ? '' : 's'} carry the ARIA attributes their role requires.`,
    notApplicableReason: 'No elements with a role that requires a specific ARIA attribute were found on this page.',
  },
  {
    id: 'aria-required-children',
    scope: 'static',
    help: 'Elements with a container role must contain the right child roles',
    description: 'A role="list" that contains no role="listitem" children (or role="tablist" with no role="tab" children, etc.) breaks the parent/child relationship assistive tech relies on to announce "list with N items", "tab 2 of 5", and similar structural cues.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships',
    impact: 'serious',
    category: 'aria',
    level: 'A',
    tags: ['wcag2a', 'wcag131'],
    profiles: [],
    run({ container, push }) {
      const roleNames = Object.keys(ROLE_REQUIRED_CHILDREN);
      const els = Array.from(container.querySelectorAll<HTMLElement>(roleNames.map((r) => `[role="${r}"]`).join(', ')));
      let checked = 0;
      for (const el of els) {
        // aria-owns can supply children that aren't DOM descendants — skip rather
        // than false-flag, since resolving aria-owns targets reliably here isn't
        // worth the complexity for a curated, false-positive-averse rule.
        if (el.hasAttribute('aria-owns')) continue;
        checked++;
        const role = el.getAttribute('role')!;
        const allowedChildRoles = ROLE_REQUIRED_CHILDREN[role];
        const hasRequiredChild = allowedChildRoles.some((childRole) => el.querySelector(`[role="${childRole}"]`));
        if (!hasRequiredChild) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: `role="${role}" should contain at least one element with role="${allowedChildRoles.join('" or role="')}" — add the expected child role, or remove role="${role}" if this isn't really a ${role}.` });
        }
      }
      return checked;
    },
    passReason: (n) => `All ${n} checked container${n === 1 ? '' : 's'} contain the child role their role requires.`,
    notApplicableReason: 'No elements with a role requiring specific child roles were found on this page.',
  },
  {
    id: 'aria-required-parent',
    scope: 'static',
    help: 'Elements with a child role must sit inside the right parent role',
    description: 'A role="listitem" with no ancestor role="list" (or role="tab" with no ancestor role="tablist", etc.) is announced out of context — assistive tech can\'t tell a visitor "item 2 of a list" if it never finds the list.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships',
    impact: 'serious',
    category: 'aria',
    level: 'A',
    tags: ['wcag2a', 'wcag131'],
    profiles: [],
    run({ container, push }) {
      const roleNames = Object.keys(ROLE_REQUIRED_PARENT);
      const els = Array.from(container.querySelectorAll<HTMLElement>(roleNames.map((r) => `[role="${r}"]`).join(', ')));
      let checked = 0;
      for (const el of els) {
        // Same aria-owns carve-out as aria-required-children above — an owned
        // element's "parent" for accessibility purposes may not be its DOM parent.
        const ownedElsewhere = !!el.id && !!container.querySelector(`[aria-owns~="${CSS.escape(el.id)}"]`);
        if (ownedElsewhere) continue;
        checked++;
        const role = el.getAttribute('role')!;
        const allowedParents = ROLE_REQUIRED_PARENT[role];
        const parentSelector = allowedParents.map((r) => `[role="${r}"]`).join(', ');
        const hasParent = !!el.parentElement?.closest(parentSelector);
        if (!hasParent) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: `role="${role}" should sit inside an element with role="${allowedParents.join('" or role="')}" — move it there, or remove role="${role}" if it isn't really a ${role} in this context.` });
        }
      }
      return checked;
    },
    passReason: (n) => `All ${n} checked element${n === 1 ? '' : 's'} sit inside the parent role their role requires.`,
    notApplicableReason: 'No elements with a role requiring a specific parent role were found on this page.',
  },

  // --- Label/name mismatch (docs/wcag-check.md Task 4 item 4) ----------------------
  {
    id: 'label-content-name-mismatch',
    scope: 'static',
    help: 'Visible label text must be included in the accessible name',
    description: 'Voice-control users say the text they see ("click Submit") to activate a control — if the accessible name (aria-label) doesn\'t contain the visible label text, that command fails even though the visible label looks right.',
    wcag: 'WCAG 2.1 — 2.5.3 Label in Name',
    impact: 'serious',
    category: 'names-labels',
    level: 'A',
    tags: ['wcag2a', 'wcag253'],
    profiles: ['motor'],
    run({ container, push }) {
      const candidates = Array.from(
        container.querySelectorAll<HTMLElement>('button, a[href], [role="button"], [role="link"], input[type="submit"], input[type="button"]')
      ).filter((el) => el.hasAttribute('aria-label'));
      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      for (const el of candidates) {
        const visibleText = (el.tagName === 'INPUT' ? (el as HTMLInputElement).value : el.textContent) ?? '';
        const visible = visibleText.trim();
        if (!visible) continue;
        const accessibleName = (el.getAttribute('aria-label') ?? '').trim();
        if (!accessibleName) continue;
        if (!normalize(accessibleName).includes(normalize(visible))) {
          push({
            html: truncateHtml(el),
            target: selectorFor(el),
            fix: `The visible text "${visible}" isn't contained in aria-label="${accessibleName}" — voice-control users saying the visible text won't activate this control. Include the visible text in the aria-label, e.g. aria-label="${visible} — additional context".`,
          });
        }
      }
      return candidates.length;
    },
    passReason: (n) => `All ${n} checked control${n === 1 ? '' : 's'} have their visible text included in the accessible name.`,
    notApplicableReason: 'No controls with both visible text and an aria-label were found on this page.',
  },

  // --- Media (docs/wcag-check.md Task 4 item 5) -------------------------------------
  {
    id: 'video-caption',
    scope: 'static',
    help: 'Videos should have a captions track',
    description: 'Without a <track kind="captions"> element, a deaf or hard-of-hearing visitor has no way to follow a video\'s dialogue or important sound cues.',
    wcag: 'WCAG 2.1 — 1.2.2 Captions (Prerecorded)',
    impact: 'serious',
    category: 'best-practices',
    level: 'A',
    tags: ['wcag2a', 'wcag122'],
    profiles: [],
    run({ container, push }) {
      const videos = Array.from(container.querySelectorAll('video'));
      for (const video of videos) {
        const hasCaptions = !!video.querySelector('track[kind="captions"], track[kind="subtitles"]');
        if (!hasCaptions) {
          push({ html: truncateHtml(video, 100), target: selectorFor(video), fix: 'Add a <track kind="captions" src="..." srclang="en" label="English"> child to this <video>, or confirm the video genuinely has no dialogue or important audio if captions don\'t apply.' });
        }
      }
      return videos.length;
    },
    passReason: (n) => `All ${n} video${n === 1 ? '' : 's'} on this page have a captions or subtitles track.`,
    notApplicableReason: 'No <video> elements found on this page.',
  },
  {
    id: 'no-autoplay-media',
    scope: 'static',
    help: 'Audio/video should not autoplay without user control',
    description: 'Audio or video that starts playing on page load without the visitor\'s say-so can drown out a screen reader, and a visitor with limited fine motor control may struggle to find and hit stop in time.',
    wcag: 'WCAG 2.1 — 1.4.2 Audio Control, 2.2.2 Pause, Stop, Hide',
    impact: 'serious',
    category: 'best-practices',
    level: 'A',
    tags: ['wcag2a', 'wcag142'],
    profiles: ['seizure', 'adhd'],
    run({ container, push }) {
      const media = Array.from(container.querySelectorAll<HTMLMediaElement>('video[autoplay], audio[autoplay]'));
      for (const el of media) {
        const isMuted = el.hasAttribute('muted');
        const hasControls = el.hasAttribute('controls');
        if (!isMuted && !hasControls) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: 'Remove autoplay, add muted (video only), or add controls so the visitor can immediately pause/stop the audio.' });
        }
      }
      return media.length;
    },
    passReason: (n) => `All ${n} autoplaying media element${n === 1 ? '' : 's'} on this page are muted or provide visible controls.`,
    notApplicableReason: 'No autoplaying <video>/<audio> elements found on this page.',
  },

  // --- List structure (docs/wcag-check.md Task 4 item 6) ---------------------------
  {
    id: 'list-structure',
    scope: 'static',
    help: 'Lists must only contain list item children',
    description: 'A <ul>/<ol> is announced to screen readers as "list, N items" — a direct child that isn\'t an <li> (a stray <div> or <p>, say) breaks that count and confuses the structure being announced.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships',
    impact: 'moderate',
    category: 'best-practices',
    level: 'A',
    tags: ['wcag2a', 'wcag131'],
    profiles: ['dyslexia'],
    run({ container, push }) {
      const lists = Array.from(container.querySelectorAll('ul, ol'));
      const ALLOWED = new Set(['LI', 'SCRIPT', 'TEMPLATE']);
      for (const list of lists) {
        const badChildren = Array.from(list.children).filter((c) => !ALLOWED.has(c.tagName));
        for (const bad of badChildren) {
          push({ html: truncateHtml(bad), target: selectorFor(bad), fix: `<${bad.tagName.toLowerCase()}> is a direct child of <${list.tagName.toLowerCase()}> — only <li> (and <script>/<template>) may be direct children of a list; wrap this content in an <li>, or move it outside the list.` });
        }
      }
      return lists.length;
    },
    passReason: (n) => `All ${n} list${n === 1 ? '' : 's'} on this page only directly contain list items.`,
    notApplicableReason: 'No <ul>/<ol> elements found on this page.',
  },
  {
    id: 'listitem-in-list',
    scope: 'static',
    help: '<li> elements must sit inside a list',
    description: 'An <li> with no list parent has no list for a screen reader to announce it as part of — it loses its "item N of M" context entirely.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships',
    impact: 'moderate',
    category: 'best-practices',
    level: 'A',
    tags: ['wcag2a', 'wcag131'],
    profiles: ['dyslexia'],
    run({ container, push }) {
      const items = Array.from(container.querySelectorAll('li'));
      for (const item of items) {
        const parent = item.parentElement;
        const validParent = !!parent && (parent.tagName === 'UL' || parent.tagName === 'OL' || parent.getAttribute('role') === 'list');
        if (!validParent) {
          push({ html: truncateHtml(item), target: selectorFor(item), fix: 'Move this <li> inside a <ul>, <ol>, or an element with role="list" — an <li> outside a list loses its list context for screen readers.' });
        }
      }
      return items.length;
    },
    passReason: (n) => `All ${n} <li> element${n === 1 ? '' : 's'} on this page sit inside a list.`,
    notApplicableReason: 'No <li> elements found on this page.',
  },
  {
    id: 'definition-list-structure',
    scope: 'static',
    help: 'Definition lists must only contain dt/dd (and grouping divs)',
    description: 'A <dl> should alternate <dt> (term) and <dd> (description) children — any other direct child breaks the term/description pairing assistive tech relies on to announce a definition list correctly.',
    wcag: 'WCAG 2.1 — 1.3.1 Info and Relationships',
    impact: 'moderate',
    category: 'best-practices',
    level: 'A',
    tags: ['wcag2a', 'wcag131'],
    profiles: ['dyslexia'],
    run({ container, push }) {
      const lists = Array.from(container.querySelectorAll('dl'));
      // <div> grouping wrappers around dt/dd pairs are valid per the HTML spec, so a
      // <div> child is allowed as long as everything inside it is itself dt/dd/
      // script/template — anything else (at either level) gets flagged.
      const ALLOWED = new Set(['DT', 'DD', 'SCRIPT', 'TEMPLATE']);
      for (const list of lists) {
        const badChildren = Array.from(list.children).filter((c) => {
          if (ALLOWED.has(c.tagName)) return false;
          if (c.tagName === 'DIV') return Array.from(c.children).some((gc) => !ALLOWED.has(gc.tagName));
          return true;
        });
        for (const bad of badChildren) {
          push({ html: truncateHtml(bad), target: selectorFor(bad), fix: `<${bad.tagName.toLowerCase()}> is a direct child of <dl> — only <dt>/<dd> (optionally grouped in a <div>) may appear directly inside a definition list.` });
        }
      }
      return lists.length;
    },
    passReason: (n) => `All ${n} definition list${n === 1 ? '' : 's'} on this page only contain dt/dd children.`,
    notApplicableReason: 'No <dl> elements found on this page.',
  },

  // --- Remaining accessible-name rules (docs/wcag-check.md Task 5 item 1) ----------
  // <select> is deliberately not duplicated here — the existing 'input-label' rule
  // already covers input/select/textarea (see its selector), so a separate
  // select-name rule would just re-flag the same elements.
  {
    id: 'svg-img-alt',
    scope: 'static',
    help: 'SVGs used as images must have an accessible name',
    description: 'An <svg role="img"> is announced to assistive tech as an image — with no accessible name (aria-label, aria-labelledby, or a <title> child) it announces as nothing at all, the same problem as a missing alt attribute.',
    wcag: 'WCAG 2.1 — 1.1.1 Non-text Content',
    impact: 'serious',
    category: 'names-labels',
    level: 'A',
    tags: ['wcag2a', 'wcag111'],
    profiles: [],
    run({ container, push }) {
      const svgs = Array.from(container.querySelectorAll('svg[role="img"]'));
      for (const svg of svgs) {
        const hasAriaLabel = svg.getAttribute('aria-label')?.trim();
        const hasAriaLabelledby = svg.getAttribute('aria-labelledby');
        const hasTitle = svg.querySelector('title')?.textContent?.trim();
        if (!hasAriaLabel && !hasAriaLabelledby && !hasTitle) {
          push({ html: truncateHtml(svg), target: selectorFor(svg), fix: 'Add an aria-label, aria-labelledby, or a <title> child element describing what this SVG shows.' });
        }
      }
      return svgs.length;
    },
    passReason: (n) => `All ${n} svg[role="img"] element${n === 1 ? '' : 's'} have an accessible name.`,
    notApplicableReason: 'No svg[role="img"] elements found on this page.',
  },
  {
    id: 'area-alt',
    scope: 'static',
    help: 'Image map areas must have alt text',
    description: 'An <area> inside an image map with no alt text announces as nothing to a screen reader — the visitor has no way to know what that clickable region does.',
    wcag: 'WCAG 2.1 — 1.1.1 Non-text Content',
    impact: 'serious',
    category: 'names-labels',
    level: 'A',
    tags: ['wcag2a', 'wcag111'],
    profiles: [],
    run({ container, push }) {
      const areas = Array.from(container.querySelectorAll('area[href]'));
      for (const area of areas) {
        if (!area.getAttribute('alt')?.trim()) {
          push({ html: truncateHtml(area), target: selectorFor(area), fix: 'Add an alt attribute describing where this image-map region links to.' });
        }
      }
      return areas.length;
    },
    passReason: (n) => `All ${n} image-map area${n === 1 ? '' : 's'} have alt text.`,
    notApplicableReason: 'No <area> elements found on this page.',
  },
  {
    id: 'input-image-alt',
    scope: 'static',
    help: 'Image-type inputs must have alt text',
    description: 'An <input type="image"> is a clickable image acting as a submit button — with no alt text a screen reader announces it as an unlabeled image, giving no clue it\'s actually a button.',
    wcag: 'WCAG 2.1 — 1.1.1 Non-text Content',
    impact: 'serious',
    category: 'names-labels',
    level: 'A',
    tags: ['wcag2a', 'wcag111'],
    profiles: [],
    run({ container, push }) {
      const inputs = Array.from(container.querySelectorAll('input[type="image"]'));
      for (const input of inputs) {
        if (!input.getAttribute('alt')?.trim()) {
          push({ html: truncateHtml(input), target: selectorFor(input), fix: 'Add an alt attribute describing what this image button does, e.g. alt="Submit search".' });
        }
      }
      return inputs.length;
    },
    passReason: (n) => `All ${n} image input${n === 1 ? '' : 's'} have alt text.`,
    notApplicableReason: 'No input[type="image"] elements found on this page.',
  },
  {
    id: 'input-button-name',
    scope: 'static',
    help: 'Submit/button/reset inputs must have a discernible name',
    description: 'An <input type="button"> with an empty value and no aria-label has no text at all for a screen reader to announce — unlike submit/reset, type="button" has no built-in default label to fall back on.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value',
    impact: 'serious',
    category: 'names-labels',
    level: 'A',
    tags: ['wcag2a', 'wcag412'],
    profiles: [],
    run({ container, push }) {
      const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="submit"], input[type="button"], input[type="reset"]'));
      for (const input of inputs) {
        const hasAriaName = input.getAttribute('aria-label')?.trim() || input.getAttribute('aria-labelledby');
        const hasValue = input.getAttribute('value')?.trim();
        // submit/reset get a browser-supplied default label ("Submit"/"Reset") when no
        // value attribute is present at all — only flag when a value attribute exists
        // but is empty, or (for type="button", which has no default) when there's no
        // value and no aria-label either.
        const hasImplicitDefault = input.type !== 'button' && !input.hasAttribute('value');
        if (!hasAriaName && !hasValue && !hasImplicitDefault) {
          const suggestion = input.type === 'submit' ? 'Submit' : input.type === 'reset' ? 'Reset' : 'Click me';
          push({ html: truncateHtml(input), target: selectorFor(input), fix: `Add a value attribute (e.g. value="${suggestion}") or an aria-label so this button has a name.` });
        }
      }
      return inputs.length;
    },
    passReason: (n) => `All ${n} submit/button/reset input${n === 1 ? '' : 's'} have a discernible name.`,
    notApplicableReason: 'No input[type="submit"|"button"|"reset"] elements found on this page.',
  },
  {
    id: 'summary-name',
    scope: 'static',
    help: '<summary> elements must have text',
    description: 'A <summary> with no text announces as an empty toggle button — a visitor navigating a <details> element has no idea what section it expands.',
    wcag: 'WCAG 2.1 — 4.1.2 Name, Role, Value',
    impact: 'serious',
    category: 'names-labels',
    level: 'A',
    tags: ['wcag2a', 'wcag412'],
    profiles: [],
    run({ container, push }) {
      const summaries = Array.from(container.querySelectorAll('summary'));
      for (const s of summaries) {
        if (!accessibleNameOf(s)) {
          push({ html: truncateHtml(s), target: selectorFor(s), fix: 'Add text inside this <summary> describing what the <details> section contains, or an aria-label.' });
        }
      }
      return summaries.length;
    },
    passReason: (n) => `All ${n} <summary> element${n === 1 ? '' : 's'} have text.`,
    notApplicableReason: 'No <summary> elements found on this page.',
  },

  // --- Small cleanups (docs/wcag-check.md Task 5 items 2-3) ------------------------
  {
    id: 'duplicate-accesskey',
    scope: 'static',
    help: 'accesskey values must be unique',
    description: 'Two elements sharing the same accesskey means the keyboard shortcut only ever reaches one of them (exact behavior varies by browser) — the other becomes unreachable via that shortcut.',
    wcag: 'WCAG 2.1 — 2.1.1 Keyboard (best practice)',
    impact: 'minor',
    category: 'best-practices',
    level: 'A',
    tags: ['best-practice', 'wcag211'],
    profiles: ['motor'],
    run({ container, push }) {
      const els = Array.from(container.querySelectorAll<HTMLElement>('[accesskey]'));
      const seen = new Map<string, Element>();
      for (const el of els) {
        const key = (el.getAttribute('accesskey') ?? '').trim().toLowerCase();
        if (!key) continue;
        if (seen.has(key)) {
          push({ html: truncateHtml(el), target: selectorFor(el), fix: `accesskey="${key}" is used by more than one element on this page — give each element a unique accesskey.` });
        } else {
          seen.set(key, el);
        }
      }
      return els.length;
    },
    passReason: (n) => `All ${n} accesskey attribute${n === 1 ? '' : 's'} on this page are unique.`,
    notApplicableReason: 'No accesskey attributes found on this page.',
  },
  {
    id: 'skip-link-target',
    scope: 'static',
    help: 'Skip links must point at a real, focusable target',
    description: 'A "Skip to content" link whose href fragment doesn\'t match any element on the page does nothing when activated — and even where the id exists, the target needs to be focusable (or have tabindex="-1") for focus to actually move there for keyboard/screen-reader users.',
    wcag: 'WCAG 2.1 — 2.4.1 Bypass Blocks',
    impact: 'moderate',
    category: 'navigation',
    level: 'A',
    tags: ['wcag2a', 'wcag241'],
    profiles: ['motor', 'adhd'],
    run({ container, push }) {
      const links = Array.from(
        container.querySelectorAll<HTMLAnchorElement>('a[href^="#main"], a[href^="#content"], a[class*="skip-link" i], a[class*="skip-to" i]')
      );
      const NATIVE_FOCUSABLE = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'IFRAME'];
      for (const link of links) {
        const id = (link.getAttribute('href') ?? '').slice(1);
        if (!id) continue;
        const target = resolveId(link, id);
        if (!target) {
          push({ html: truncateHtml(link), target: selectorFor(link), fix: `This skip link points at "#${id}" but no element on the page has that id — add id="${id}" to the main content container, or fix the link's href.` });
          continue;
        }
        const isFocusable = target.hasAttribute('tabindex') || NATIVE_FOCUSABLE.includes(target.tagName);
        if (!isFocusable) {
          push({ html: truncateHtml(target), target: selectorFor(target), fix: `The skip link's target (#${id}) isn't natively focusable — add tabindex="-1" to it so focus actually moves there when the link is activated.` });
        }
      }
      return links.length;
    },
    passReason: (n) => `All ${n} skip link${n === 1 ? '' : 's'} point at a real, focusable target.`,
    notApplicableReason: 'No skip links found on this page (see the separate "bypass blocks" check).',
  },
  {
    id: 'css-blink-animation',
    scope: 'needs-layout',
    help: 'Fast, looping CSS animations should respect prefers-reduced-motion',
    description: 'A CSS animation that loops faster than about 3 times per second (a duration under ~333ms) reads as blinking or flashing — potentially triggering for visitors with seizure disorders — unless the page also provides a prefers-reduced-motion: reduce fallback that turns it off. This is a heuristic based purely on animation timing (it can\'t tell whether the animation actually toggles a visually flashing property like opacity or background-color), so findings are marked as needing manual review rather than a definite failure.',
    wcag: 'WCAG 2.1 — 2.3.1 Three Flashes or Below Threshold, 2.2.2 Pause, Stop, Hide',
    impact: 'serious',
    category: 'best-practices',
    level: 'A',
    tags: ['wcag2a', 'wcag231'],
    profiles: ['seizure'],
    run({ container, pushIncomplete }) {
      // A page-wide prefers-reduced-motion guard is trusted wholesale rather than
      // matched per-element — see pageHasReducedMotionGuard()'s doc comment for why.
      if (pageHasReducedMotionGuard()) return 0;
      const all = Array.from(container.querySelectorAll<HTMLElement>('*'));
      for (const el of all) {
        const style = getComputedStyle(el);
        if (style.animationName === 'none') continue;
        const durations = style.animationDuration.split(',').map((d) => parseFloat(d));
        const iterations = style.animationIterationCount.split(',').map((s) => s.trim());
        const fastLoop = durations.some((d, i) => d > 0 && d < 0.333 && iterations[i % iterations.length] === 'infinite');
        if (fastLoop) {
          pushIncomplete({
            html: truncateHtml(el),
            target: selectorFor(el),
            fix: 'This element has a looping animation faster than ~3 times per second with no page-wide prefers-reduced-motion fallback detected — verify manually whether it actually flashes/blinks a visible property (opacity, visibility, background), and if so, slow it down or add an @media (prefers-reduced-motion: reduce) rule that disables it.',
          });
        }
      }
      // Every finding from this rule is incomplete by design (a timing-only heuristic
      // can't responsibly decide pass/fail on its own) — checkedCount always stays 0.
      return 0;
    },
    passReason: () => 'No fast-looping CSS animations found.',
    notApplicableReason: 'No animation on this page loops fast enough to warrant a manual flash/blink review (or the page already provides a prefers-reduced-motion fallback).',
  },
];

// 'incomplete' sorts right after 'fail' — it's a needs-review case, not a clean pass,
// so it belongs with the other things a visitor should look at before 'pass'/
// 'not-applicable' (see ScanStatus's doc comment).
const STATUS_ORDER: Record<ScanStatus, number> = { fail: 0, incomplete: 1, pass: 2, 'not-applicable': 3 };
const IMPACT_ORDER: Record<ScanImpact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

/** Total number of rules the scanner runs — exposed so a driving UI (report-page.ts)
 *  can render "X of N checks" progress without importing the rule table itself. */
export const TOTAL_RULE_COUNT = RULES.length;

/** Runs every rule against `container` (the same element passed to applyClasses()/
 *  createPanel({ container })) and returns the full check list — every rule always
 *  produces exactly one ScanCheck, not just the failing ones, sorted worst-first.
 *
 *  Yields to the event loop between each rule (a short setTimeout, not just a
 *  microtask) so a driving UI can actually repaint a progress indicator between
 *  steps — without it, ~44 synchronous DOM-query rules complete in well under a
 *  second and any "scanning…" UI would just flash to 100% instead of being
 *  legible. 90ms/rule puts a 44-rule scan at ~4s total — long enough to actually
 *  read the "Checking: <rule>" label as it changes, short enough not to feel slow. */
export async function runAccessibilityScan(
  container: HTMLElement,
  onProgress?: (completed: number, total: number, ruleHelp: string) => void
): Promise<ScanResult> {
  const checks: ScanCheck[] = [];
  let checkedElementCount = 0;
  // Discovered once, reused for every container-scoped rule — see discoverScanRoots()
  // and Rule.documentScope's doc comments (Task 6).
  const scanRoots = discoverScanRoots(container);

  for (let i = 0; i < RULES.length; i++) {
    const rule = RULES[i];
    await new Promise<void>((resolve) => setTimeout(resolve, 90));

    const nodes: ScanViolationNode[] = [];
    const incompleteNodes: ScanViolationNode[] = [];
    const push = (n: ScanViolationNode) => nodes.push(n);
    const pushIncomplete = (n: ScanViolationNode) => incompleteNodes.push(n);

    let checkedCount = 0;
    if (rule.documentScope) {
      // Ignores container entirely (reads document.title/documentElement/a <meta>
      // tag/document.body directly) — run exactly once, never once per discovered
      // root, or a shadow-DOM-heavy page would report the same single finding
      // (e.g. "page has no lang attribute") once per shadow root.
      checkedCount = rule.run({ container, push, pushIncomplete });
    } else {
      for (const root of scanRoots) {
        checkedCount += rule.run({ container: root, push, pushIncomplete });
      }
    }
    checkedElementCount += checkedCount;

    const base = {
      id: rule.id,
      impact: rule.impact,
      category: rule.category,
      level: rule.level,
      tags: rule.tags,
      profiles: rule.profiles,
      help: rule.help,
      description: rule.description,
      wcag: rule.wcag,
      scope: rule.scope,
      checkedCount,
    };

    // Fail takes priority over incomplete when a rule produces both — a page can have
    // both real failures and elements it couldn't evaluate; the fail status is what a
    // visitor needs to act on first, but the incomplete nodes for that rule are simply
    // not surfaced as their own check in that case (the rule's status is unambiguous:
    // it did fail).
    if (nodes.length > 0) {
      checks.push({ ...base, status: 'fail', nodes });
    } else if (incompleteNodes.length > 0) {
      checks.push({ ...base, status: 'incomplete', nodes: incompleteNodes });
    } else if (checkedCount === 0) {
      checks.push({ ...base, status: 'not-applicable', nodes: [], reason: rule.notApplicableReason });
    } else {
      checks.push({ ...base, status: 'pass', nodes: [], reason: rule.passReason(checkedCount) });
    }

    onProgress?.(i + 1, RULES.length, rule.help);
  }

  checks.sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    return IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact];
  });

  return {
    checks,
    failCount: checks.filter((c) => c.status === 'fail').length,
    passCount: checks.filter((c) => c.status === 'pass').length,
    notApplicableCount: checks.filter((c) => c.status === 'not-applicable').length,
    incompleteCount: checks.filter((c) => c.status === 'incomplete').length,
    checkedElementCount,
    scannedAt: Date.now(),
  };
}

/** Scrolls the offending element into view and briefly outlines it
 *  (a11y-effects.css's `.a11y-scan-highlight`), mirroring heading-scan.ts's jump-to
 *  pattern. No-ops silently if the target selector no longer matches (host DOM may have
 *  changed since the scan ran — scans are one-shot, not live). */
export function highlightScanNode(target: string): void {
  if (!target) return;
  // Elements found inside a shadow root or same-origin iframe (Task 6) get a
  // selector that's only valid relative to their own root — see
  // UNSUPPORTED_ROOT_PREFIX's doc comment. Bail out rather than run it through
  // document.querySelector(), which could match an unrelated element by coincidence.
  if (target.startsWith(UNSUPPORTED_ROOT_PREFIX)) return;
  const el = document.querySelector<HTMLElement>(target);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('a11y-scan-highlight');
  window.setTimeout(() => el.classList.remove('a11y-scan-highlight'), 2200);
}
