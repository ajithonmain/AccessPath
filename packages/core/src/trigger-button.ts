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

  // A saved left/top can predate a container resize (or, for the site's preview,
  // predate this button moving from the fixed-viewport coordinate space into
  // qc-preview-body's own local one) and land outside the current containing block.
  // offsetParent is only resolvable once the button is actually in the DOM, which
  // happens right after this function returns, so defer one frame.
  if (saved) requestAnimationFrame(() => clampToContainer(button));

  return button;
}

/** Keeps a dragged trigger inside its containing block (offsetParent) — e.g. so it
 *  can't be dragged/inherit a stale position outside qc-preview-body in the site's
 *  Customize builder preview. No-op when the containing block is the viewport
 *  (offsetParent null, the normal case for a real position:fixed embed). */
function clampToContainer(button: HTMLButtonElement): void {
  const parent = button.offsetParent as HTMLElement | null;
  if (!parent) return;
  const left = parseFloat(button.style.left);
  const top = parseFloat(button.style.top);
  if (Number.isNaN(left) || Number.isNaN(top)) return;
  const maxX = Math.max(parent.clientWidth - button.offsetWidth, 0);
  const maxY = Math.max(parent.clientHeight - button.offsetHeight, 0);
  const clampedLeft = Math.min(Math.max(left, 0), maxX);
  const clampedTop = Math.min(Math.max(top, 0), maxY);
  if (clampedLeft !== left) button.style.left = `${clampedLeft}px`;
  if (clampedTop !== top) button.style.top = `${clampedTop}px`;
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

function wireDrag(button: HTMLButtonElement, storageKey?: string): void {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  button.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    ({ x: originX, y: originY } = containingBlockOffset(button));
    button.setPointerCapture(e.pointerId);
  });

  button.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && !moved) return;
    moved = true;
    originX += dx;
    originY += dy;
    const parent = button.offsetParent as HTMLElement | null;
    if (parent) {
      originX = Math.min(Math.max(originX, 0), Math.max(parent.clientWidth - button.offsetWidth, 0));
      originY = Math.min(Math.max(originY, 0), Math.max(parent.clientHeight - button.offsetHeight, 0));
    }
    button.style.left = `${originX}px`;
    button.style.top = `${originY}px`;
    button.style.right = 'auto';
    button.style.bottom = 'auto';
    startX = e.clientX;
    startY = e.clientY;
  });

  button.addEventListener('pointerup', (e) => {
    dragging = false;
    button.releasePointerCapture(e.pointerId);
    if (!moved) return;
    if (storageKey) {
      saveTriggerPosition(storageKey, { x: originX, y: originY });
    }
    // Swallow the click that immediately follows a drag release so it doesn't open the panel.
    button.addEventListener(
      'click',
      (ce) => {
        ce.stopPropagation();
        ce.preventDefault();
      },
      { capture: true, once: true }
    );
  });
}
