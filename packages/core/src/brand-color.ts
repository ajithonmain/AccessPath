function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function mix([r, g, b]: [number, number, number], target: number, amount: number): string {
  const m = (c: number) => Math.round(c + (target - c) * amount);
  return `${m(r)}, ${m(g)}, ${m(b)}`;
}

/** Derives the full --ap-brand-* token set (docs/brand.md) from a single hex color and
 *  applies them as an inline style on `el` — never a global `:root` stylesheet.
 *  Inline style has the highest CSS specificity, so it can't be silently overridden by
 *  cascade order (a `<style>` block injected before the host page's own CSS would lose
 *  to it), and it only ever touches the element AccessPath itself created (panel.root /
 *  the trigger button), never the host page's `:root` — no risk of colliding with
 *  unrelated `--ap-*` usage elsewhere on the page, and no dependency on where in the
 *  document a snippet happens to get pasted. */
export function applyBrandColor(el: HTMLElement, hex: string): void {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const [r, g, b] = rgb;
  el.style.setProperty('--ap-brand', hex);
  el.style.setProperty('--ap-brand-2', `rgb(${mix(rgb, 0, 0.12)})`);
  el.style.setProperty('--ap-brand-soft', `rgba(${r}, ${g}, ${b}, 0.08)`);
  el.style.setProperty('--ap-brand-border', `rgba(${r}, ${g}, ${b}, 0.25)`);
  el.style.setProperty('--ap-brand-glow', `rgb(${mix(rgb, 255, 0.55)})`);
}
