import { accessibilityBadgeIcon, accessibilityIcon, accessPathLogoIcon, contrastIcon, motionIcon, motorIcon, spacingIcon } from './icons';
import { loadTriggerPosition, saveTriggerPosition } from './trigger-position';
import { prefersReducedMotion } from './reduced-motion';
import { applyBrandColor } from './brand-color';
import { resolveLabels, LocaleKey } from './i18n';

export type TriggerPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type TriggerShape = 'circle' | 'rounded-square' | 'pill';
export type TriggerIconKey = 'accessibility' | 'motion' | 'contrast' | 'spacing' | 'motor' | 'badge' | 'logo';

export interface CreateTriggerButtonOptions {
  onClick: () => void;
  /** Defaults to 'bottom-right'. Ignored once a dragged position has been saved. */
  position?: TriggerPosition;
  ariaLabel?: string;
  /** Defaults to 'accessibility'. Reuses existing icons.ts exports so it works from a
   *  plain string (e.g. the embed script's data-icon attribute) — or pass your own
   *  SVGElement directly for a fully custom icon. The script-tag embed can't accept an
   *  SVGElement (data-* attributes are strings only), so this is core/React/Angular
   *  only — same boundary as CreatePanelOptions.customSections. */
  icon?: TriggerIconKey | SVGElement;
  /** Defaults to 'circle'. */
  shape?: TriggerShape;
  /** Lets visitors drag the trigger to a new spot; the final position persists to
   *  localStorage under `${storageKey}-trigger-pos` (see trigger-position.ts). */
  draggable?: boolean;
  storageKey?: string;
  /** Uses `position:absolute` instead of `position:fixed`. For embedding the trigger
   *  inside a scoped mockup/preview container (e.g. the site's Customize builder)
   *  rather than floating over the real viewport. Defaults to false. */
  absolute?: boolean;
  /** Overrides the --ap-brand-* token set via inline style directly on the button —
   *  see CreatePanelOptions.brandColor / brand-color.ts. */
  brandColor?: string;
  /** Picks the bundled default aria-label translation when `ariaLabel` isn't given.
   *  Defaults to 'en'. See CreatePanelOptions.locale / i18n/. */
  locale?: LocaleKey;
}

const POSITION_STYLES: Record<TriggerPosition, string> = {
  'bottom-right': 'bottom:20px;right:20px;',
  'bottom-left': 'bottom:20px;left:20px;',
  'top-right': 'top:20px;right:20px;',
  'top-left': 'top:20px;left:20px;',
};

const ICONS: Record<TriggerIconKey, () => SVGElement> = {
  accessibility: accessibilityIcon,
  motion: motionIcon,
  contrast: contrastIcon,
  spacing: spacingIcon,
  motor: motorIcon,
  badge: accessibilityBadgeIcon,
  logo: accessPathLogoIcon,
};

const SHAPE_CLASS: Record<TriggerShape, string> = {
  circle: '',
  'rounded-square': 'accesspath-trigger--rounded-square',
  pill: 'accesspath-trigger--pill',
};

/** A ready-made floating trigger button, styled via the `.accesspath-trigger` class in
 *  panel.css. Entirely optional — callers can still build their own trigger and call
 *  state.open()/panel.open() directly instead. */

/** One-shot scale pulse on first paint so a first-time visitor's eye lands on the
 *  trigger — gated behind prefers-reduced-motion like every other motion effect in
 *  core (see reduced-motion.ts), since AccessPath's own site should honor the same
 *  preference its product respects on every host page. Runs once: the animation class
 *  is removed as soon as it finishes, so nothing about interacting with the button
 *  afterward (hover, click, drag) can re-trigger it. */
function firePulseOnce(button: HTMLButtonElement): void {
  if (prefersReducedMotion()) return;
  button.classList.add('accesspath-trigger--pulse');
  button.addEventListener(
    'animationend',
    () => button.classList.remove('accesspath-trigger--pulse'),
    { once: true }
  );
}

export function createTriggerButton(opts: CreateTriggerButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = [
    'accesspath-trigger',
    SHAPE_CLASS[opts.shape ?? 'circle'],
    opts.draggable ? 'accesspath-trigger--draggable' : '',
  ].filter(Boolean).join(' ');
  button.setAttribute('aria-label', opts.ariaLabel ?? resolveLabels(opts.locale).triggerAria);
  const icon = opts.icon instanceof SVGElement ? opts.icon : ICONS[opts.icon ?? 'accessibility']();
  button.appendChild(icon);
  button.addEventListener('click', opts.onClick);
  firePulseOnce(button);

  const saved = opts.draggable && opts.storageKey ? loadTriggerPosition(opts.storageKey) : null;
  const positionRule = opts.absolute ? 'position:absolute;' : 'position:fixed;';
  button.setAttribute(
    'style',
    saved
      ? `${positionRule}left:${saved.x}px;top:${saved.y}px;`
      : `${positionRule}${POSITION_STYLES[opts.position ?? 'bottom-right']}`
  );

  if (opts.draggable) wireDrag(button, opts.storageKey);
  if (opts.brandColor) applyBrandColor(button, opts.brandColor);

  // A saved left/top can predate a viewport/container resize (or, for the site's
  // preview, predate this button moving from the fixed-viewport coordinate space into
  // qc-preview-body's own local one) and land outside the visible area — e.g. a visitor
  // drags it past the bottom edge and reloads. offsetParent is only resolvable once the
  // button is actually in the DOM, which happens right after this function returns, so
  // defer one frame; then persist the corrected spot so it doesn't re-clamp every load.
  if (saved) {
    requestAnimationFrame(() => {
      if (clampToContainer(button) && opts.draggable && opts.storageKey) {
        saveTriggerPosition(opts.storageKey, {
          x: parseFloat(button.style.left),
          y: parseFloat(button.style.top),
        });
      }
    });
  }

  // Re-clamp (without re-saving — a transient resize shouldn't overwrite the chosen
  // spot) if the viewport later shrinks below the trigger's position.
  if (opts.draggable && !opts.absolute) {
    window.addEventListener('resize', () => clampToContainer(button));
  }

  return button;
}

/** Largest left/top that still keeps the button fully inside its containing block:
 *  the offsetParent when there is one (a transformed ancestor, or `absolute` mode),
 *  otherwise the viewport — the normal `position:fixed` embed, where offsetParent is
 *  null. The viewport branch is what stops a real embed from being dragged off-screen. */
function dragBounds(button: HTMLButtonElement): { maxX: number; maxY: number } {
  const parent = button.offsetParent as HTMLElement | null;
  const width = parent ? parent.clientWidth : window.innerWidth;
  const height = parent ? parent.clientHeight : window.innerHeight;
  return {
    maxX: Math.max(width - button.offsetWidth, 0),
    maxY: Math.max(height - button.offsetHeight, 0),
  };
}

/** Pulls a dragged trigger back inside the visible area if its current left/top sits
 *  outside it. Returns true if it actually moved the button. No-op when left/top aren't
 *  set (the default corner-anchored position uses bottom/right instead). */
function clampToContainer(button: HTMLButtonElement): boolean {
  const left = parseFloat(button.style.left);
  const top = parseFloat(button.style.top);
  if (Number.isNaN(left) || Number.isNaN(top)) return false;
  const { maxX, maxY } = dragBounds(button);
  const clampedLeft = Math.min(Math.max(left, 0), maxX);
  const clampedTop = Math.min(Math.max(top, 0), maxY);
  if (clampedLeft === left && clampedTop === top) return false;
  button.style.left = `${clampedLeft}px`;
  button.style.top = `${clampedTop}px`;
  return true;
}

/** button.style.left/top are resolved against its CSS containing block, which for a
 *  position:fixed element is normally the viewport — but isn't always: an ancestor
 *  with a transform/filter/perspective (e.g. the site's Customize builder live
 *  preview, which needs one to clip the real drawer inside its mockup window) becomes
 *  the containing block instead, per spec exposed as button.offsetParent (null when
 *  the containing block is the viewport). getBoundingClientRect() is always
 *  viewport-relative regardless, so it can't be used directly to seed left/top in the
 *  transformed-ancestor case — this converts it to be relative to whatever the actual
 *  containing block is, in both cases. */
function containingBlockOffset(button: HTMLButtonElement): { x: number; y: number } {
  const rect = button.getBoundingClientRect();
  const parent = button.offsetParent as HTMLElement | null;
  const parentRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
  return { x: rect.left - parentRect.left, y: rect.top - parentRect.top };
}

/** Pointer travel (px, from the pointerdown point) before a press is treated as a drag
 *  rather than a click. Small pointer jitter during a tap — common on trackpads and
 *  touch — must stay under this so the panel still opens on a normal click. */
const DRAG_THRESHOLD = 6;

function wireDrag(button: HTMLButtonElement, storageKey?: string): void {
  let dragging = false;
  let moved = false;
  // Fixed for the whole gesture: the pointerdown point, and the button's offset within
  // its containing block at that moment. Position is always recomputed as base + total
  // delta from downX/downY — never accumulated per-move — so sub-threshold jitter on a
  // click can't nudge the button.
  let downX = 0;
  let downY = 0;
  let baseX = 0;
  let baseY = 0;

  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    downX = e.clientX;
    downY = e.clientY;
    ({ x: baseX, y: baseY } = containingBlockOffset(button));
    button.setPointerCapture(e.pointerId);
  });

  button.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // Belt-and-suspenders alongside the CSS touch-action:none on
    // .accesspath-trigger--draggable: that's what actually stops the page from
    // scrolling on touch, but a couple of browsers still let one frame of native pan
    // through immediately after pointerdown before it takes effect.
    e.preventDefault();
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved = true;
    // Clamp against the viewport (or offsetParent, in absolute/transformed-ancestor
    // mode) so the trigger can never be dragged out of the visible area.
    const { maxX, maxY } = dragBounds(button);
    const x = Math.min(Math.max(baseX + dx, 0), maxX);
    const y = Math.min(Math.max(baseY + dy, 0), maxY);
    button.style.left = `${x}px`;
    button.style.top = `${y}px`;
    button.style.right = 'auto';
    button.style.bottom = 'auto';
  });

  const endGesture = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try { button.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!moved) return;
    if (storageKey) {
      saveTriggerPosition(storageKey, {
        x: parseFloat(button.style.left),
        y: parseFloat(button.style.top),
      });
    }
    // Swallow the click that immediately follows a drag release so it doesn't open the
    // panel — but only briefly, so a genuine click a moment later still works even if
    // no click event ever followed the drag.
    const swallow = (ce: Event) => {
      ce.stopPropagation();
      ce.preventDefault();
    };
    button.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => button.removeEventListener('click', swallow, { capture: true } as EventListenerOptions), 300);
  };

  button.addEventListener('pointerup', endGesture);
  button.addEventListener('pointercancel', endGesture);
}
