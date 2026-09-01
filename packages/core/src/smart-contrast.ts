/** "Smart Contrast" — a one-time read of `container`'s effective background luminance,
 *  picking a readable bg/text override pair. Same read-only, no-mutation DOM-walking
 *  shape as a11y-scanner.ts's checks; deliberately simplified to a single effective
 *  background rather than a full per-element walk, since the result only ever feeds
 *  the same bgColor/textColor override every other Contrast preset uses
 *  (apply-classes.ts applies it uniformly across the whole target regardless).
 *
 *  `background-color` is almost never set on the element people actually mean —
 *  computed style only ever reflects what THIS element itself declared, not what's
 *  visually painted behind it (CSS doesn't computed-inherit a rendered background
 *  through ancestors). A container that's transparent over a colored page (the common
 *  case) would otherwise always read as transparent -> misdetected as black. Walk up
 *  until a non-transparent background is found, falling back to white. */
export function computeSmartContrast(container: HTMLElement): { bgColor: string; textColor: string } {
  const bg = findEffectiveBackground(container) ?? { r: 255, g: 255, b: 255 };
  const luminance = relativeLuminance(bg);
  return luminance < 0.5
    ? { bgColor: '#0b0b0f', textColor: '#f5f5f7' }
    : { bgColor: '#ffffff', textColor: '#111111' };
}

function findEffectiveBackground(el: HTMLElement | null): { r: number; g: number; b: number } | null {
  for (let node = el; node; node = node.parentElement) {
    const parsed = parseRgb(getComputedStyle(node).backgroundColor);
    if (parsed && parsed.a !== 0) return parsed;
  }
  return null;
}

function parseRgb(value: string): { r: number; g: number; b: number; a: number } | null {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}
