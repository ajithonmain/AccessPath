export type CursorColor = 'black' | 'white';

/** Generates the `cursor` property's url()+hotspot fragment for Big Cursor, in the
 *  chosen color — an inverted fill/stroke pair so the cursor stays visible against
 *  either a light or dark page background. Returned as the full `url(...) x y`
 *  fragment (not just the URL) since that's what gets assigned to the
 *  --a11y-cursor-url custom property, substituted directly into the `cursor`
 *  declaration in a11y-effects.css. */
export function bigCursorUrlFragment(color: CursorColor): string {
  const fill = color === 'black' ? '%23000' : '%23fff';
  const stroke = color === 'black' ? '%23fff' : '%23000';
  return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><path d="M3 2 20 12 12 13 9 21 3 2z" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/></svg>') 2 2`;
}
