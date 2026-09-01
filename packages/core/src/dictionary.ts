const POPOVER_CLASS = 'a11y-dict-popover';

/** Free, keyless dictionary API — never throws, returns null on any failure. */
export async function lookupWord(word: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const def = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
    return typeof def === 'string' ? def : null;
  } catch {
    return null;
  }
}

let popoverEl: HTMLElement | null = null;
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
let escapeHandler: ((e: KeyboardEvent) => void) | null = null;

export function closeDictionaryPopover(): void {
  if (outsideClickHandler) document.removeEventListener('mousedown', outsideClickHandler);
  if (escapeHandler) document.removeEventListener('keydown', escapeHandler);
  outsideClickHandler = null;
  escapeHandler = null;
  popoverEl?.remove();
  popoverEl = null;
}

/** Renders a small fixed-position popover near `anchorRect` showing the word + definition
 *  (or a "no definition found" message). Appended to `parent` — position: fixed still
 *  resolves against the viewport even from inside a Shadow DOM tree. */
export function showDictionaryPopover(
  parent: HTMLElement,
  word: string,
  definition: string | null,
  anchorRect: DOMRect,
  noDefinitionText = 'No definition found.'
): void {
  closeDictionaryPopover();

  const el = document.createElement('div');
  el.className = POPOVER_CLASS;
  el.setAttribute('role', 'status');

  const title = document.createElement('div');
  title.className = 'a11y-dict-word';
  title.textContent = word;

  const body = document.createElement('div');
  body.className = 'a11y-dict-def';
  body.textContent = definition ?? noDefinitionText;

  el.append(title, body);

  const top = anchorRect.bottom + 8;
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 260));
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;

  parent.appendChild(el);
  popoverEl = el;

  // composedPath(), not e.target — same Shadow DOM retargeting pitfall as
  // attachDropdownToCard()'s onDocClick in panel-dom.ts: when the panel is mounted
  // inside the embed script's shadow root, e.target for a document-level listener
  // gets retargeted to the shadow host, making every click look "outside" el
  // regardless of what was actually clicked.
  outsideClickHandler = (e: MouseEvent) => {
    if (!e.composedPath().includes(el)) closeDictionaryPopover();
  };
  escapeHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeDictionaryPopover();
  };
  document.addEventListener('mousedown', outsideClickHandler);
  document.addEventListener('keydown', escapeHandler);
}
