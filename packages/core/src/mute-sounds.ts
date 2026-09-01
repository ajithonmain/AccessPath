export interface MuteSoundsHandle {
  destroy(): void;
}

/** Mutes every <audio>/<video> in `container`, remembering each element's original
 *  `.muted` state in a WeakMap so disable can restore it exactly rather than force-
 *  unmuting something the host page had already muted itself. A MutationObserver
 *  catches elements added after the toggle is switched on — unlike tooltips.ts's
 *  one-time scan, media elements are commonly injected by players/ads well after page
 *  load, so a one-shot scan alone would miss them. */
export function createMuteSounds(container: HTMLElement): MuteSoundsHandle {
  const original = new WeakMap<HTMLMediaElement, boolean>();

  function mute(el: HTMLMediaElement): void {
    if (!original.has(el)) original.set(el, el.muted);
    el.muted = true;
  }

  function scan(root: Element): void {
    if (root instanceof HTMLMediaElement) mute(root);
    root.querySelectorAll<HTMLMediaElement>('audio, video').forEach(mute);
  }

  scan(container);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) scan(node);
      }
    }
  });
  observer.observe(container, { childList: true, subtree: true });

  return {
    destroy(): void {
      observer.disconnect();
      container.querySelectorAll<HTMLMediaElement>('audio, video').forEach((el) => {
        const wasMuted = original.get(el);
        if (wasMuted !== undefined) el.muted = wasMuted;
      });
    },
  };
}
