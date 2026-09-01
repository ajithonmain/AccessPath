export interface FocusTrap {
  activate(): void;
  deactivate(): void;
}

export interface FocusTrapOptions {
  onEscape?: () => void;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Tab/Shift+Tab cycling within `container`, Escape callback, and focus return to the
 *  previously-focused element on deactivate. */
export function createFocusTrap(container: HTMLElement, opts: FocusTrapOptions = {}): FocusTrap {
  let previouslyFocused: HTMLElement | null = null;
  let isActive = false;

  function getFocusable(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null
    );
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      opts.onEscape?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = getFocusable();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  return {
    // Idempotent: callers may re-invoke activate() while already active (e.g. a trigger
    // button that's still reachable behind the open panel gets clicked again) — in that
    // case just make sure focus is inside, without clobbering the original previouslyFocused.
    activate() {
      if (isActive) {
        if (!container.contains(document.activeElement)) {
          const focusable = getFocusable();
          // preventScroll: true — plain .focus() scrolls its element into view by
          // default, which visibly jerks/jumps the surrounding page when the panel
          // sits deep in a scroll container (e.g. the site's Customize builder live
          // preview) — the drawer's own slide-in transition already draws the eye to
          // it, so an extra scroll-into-view is pure jank, not a real a11y need.
          (focusable[0] ?? container).focus({ preventScroll: true });
        }
        return;
      }
      isActive = true;
      previouslyFocused = document.activeElement as HTMLElement | null;
      container.addEventListener('keydown', onKeydown);
      const focusable = getFocusable();
      (focusable[0] ?? container).focus({ preventScroll: true });
    },
    deactivate() {
      if (!isActive) return;
      isActive = false;
      container.removeEventListener('keydown', onKeydown);
      previouslyFocused?.focus({ preventScroll: true });
      previouslyFocused = null;
    },
  };
}
