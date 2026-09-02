const POPOVER_CLASS = 'a11y-dict-popover';

export interface DictionaryLabels {
  lookingUp: string;
  noDefinition: string;
  timedOut: string;
}

export type LookupResult =
  | { status: 'ok'; definition: string }
  | { status: 'none' }
  | { status: 'error' };

/** Wiktionary's definition endpoint — keyless, CORS-enabled, and served off Wikimedia's
 *  CDN, so it's far more reliable than the community dictionaryapi.dev (which this used
 *  to call and which is frequently down). Never throws; aborts after `timeoutMs` so a
 *  slow network can't leave the popover stuck on "Looking up…". */
export async function lookupWord(word: string, timeoutMs = 3000): Promise<LookupResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word.toLowerCase())}`,
      { signal: ctrl.signal, headers: { accept: 'application/json' } }
    );
    if (res.status === 404) return { status: 'none' };
    if (!res.ok) return { status: 'error' };
    const data = await res.json();
    const entries: Array<{ definition?: string }> = data?.en?.[0]?.definitions ?? [];
    for (const entry of entries) {
      // Definitions come back with inline <a>/<i> markup — strip to plain text.
      const text = (entry.definition ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text) return { status: 'ok', definition: text };
    }
    return { status: 'none' };
  } catch {
    return { status: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

let popoverEl: HTMLElement | null = null;
let currentWord: string | null = null;
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
let escapeHandler: ((e: KeyboardEvent) => void) | null = null;

export function closeDictionaryPopover(): void {
  if (outsideClickHandler) document.removeEventListener('mousedown', outsideClickHandler);
  if (escapeHandler) document.removeEventListener('keydown', escapeHandler);
  outsideClickHandler = null;
  escapeHandler = null;
  popoverEl?.remove();
  popoverEl = null;
  currentWord = null;
}

/** Opens the popover immediately in a "Looking up…" state, anchored near `anchorRect`.
 *  Appended to `parent` (the panel root) — its CSS lives in panel.css so it renders
 *  correctly whether the panel is in the light DOM (React/Angular) or the embed's
 *  Shadow DOM. Call `resolveDictionaryPopover()` once the lookup returns. */
export function showDictionaryPopover(
  parent: HTMLElement,
  word: string,
  anchorRect: DOMRect,
  labels: DictionaryLabels
): void {
  closeDictionaryPopover();

  const el = document.createElement('div');
  el.className = POPOVER_CLASS;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');

  const title = document.createElement('div');
  title.className = 'a11y-dict-word';
  title.textContent = word;

  const body = document.createElement('div');
  body.className = 'a11y-dict-def';
  body.textContent = labels.lookingUp;

  el.append(title, body);

  const top = anchorRect.bottom + 8;
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 268));
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;

  parent.appendChild(el);
  popoverEl = el;
  currentWord = word;

  // composedPath(), not e.target — Shadow DOM retargets a document-level listener's
  // e.target to the shadow host, making every click look "outside" el.
  outsideClickHandler = (e: MouseEvent) => {
    if (!e.composedPath().includes(el)) closeDictionaryPopover();
  };
  escapeHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeDictionaryPopover();
  };
  document.addEventListener('mousedown', outsideClickHandler);
  document.addEventListener('keydown', escapeHandler);
}

/** Fills in the definition once the lookup resolves — no-op if the visitor has since
 *  closed the popover or double-clicked a different word. */
export function resolveDictionaryPopover(
  word: string,
  result: LookupResult,
  labels: DictionaryLabels
): void {
  if (!popoverEl || currentWord !== word) return;
  const body = popoverEl.querySelector<HTMLElement>('.a11y-dict-def');
  if (!body) return;
  body.textContent =
    result.status === 'ok'
      ? result.definition
      : result.status === 'error'
        ? labels.timedOut
        : labels.noDefinition;
}
