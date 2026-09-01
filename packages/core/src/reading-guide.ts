import { prefersReducedMotion } from './reduced-motion';

export interface ReadingGuideHandle {
  destroy(): void;
}

const BAND_HEIGHT = 120;

/** Fixed-position overlay with a transparent horizontal band that follows the cursor,
 *  dimming everything else. clientY is already viewport-relative so no separate scroll
 *  handling is needed. Skips the smooth-follow transition entirely when the OS has
 *  prefers-reduced-motion set — snaps instead of tweening. */
export function createReadingGuide(): ReadingGuideHandle {
  const smooth = !prefersReducedMotion();
  const smoothClass = smooth ? ' a11y-reading-guide-band--smooth' : '';
  const top = document.createElement('div');
  top.className = `a11y-reading-guide-band a11y-reading-guide-band--top${smoothClass}`;
  const bottom = document.createElement('div');
  bottom.className = `a11y-reading-guide-band a11y-reading-guide-band--bottom${smoothClass}`;
  // document.documentElement, not document.body — same containing-block reasoning as
  // voice-over.ts's control bar (see the comment there): a filter-based effect applied to
  // `container` (which defaults to document.body) would otherwise make these fixed-position
  // bands position relative to body's box instead of the viewport.
  document.documentElement.append(top, bottom);

  function onMove(e: MouseEvent): void {
    top.style.height = `${Math.max(0, e.clientY - BAND_HEIGHT / 2)}px`;
    bottom.style.top = `${e.clientY + BAND_HEIGHT / 2}px`;
  }
  window.addEventListener('mousemove', onMove);

  return {
    destroy(): void {
      window.removeEventListener('mousemove', onMove);
      top.remove();
      bottom.remove();
    },
  };
}
