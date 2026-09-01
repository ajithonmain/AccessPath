export interface VirtualKeyboardHandle {
  destroy(): void;
}

const LETTER_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];
const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

function isEditableElement(el: Element | null): el is HTMLElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || Boolean((el as HTMLElement)?.isContentEditable);
}

/** On-screen keyboard overlay that types into whichever input/textarea/contenteditable
 *  currently has host-page focus. The target is tracked live via a document-level
 *  `focusin` listener, not captured once at open time — opening the keyboard is only
 *  reachable by clicking its toggle switch inside the panel, which is itself the
 *  focused element at that instant, so a one-time `document.activeElement` snapshot
 *  would always point at the switch, never a real page field. The flow is: open the
 *  keyboard, THEN click the field you want to type into (each key's own `pointerdown`
 *  handler calls preventDefault() so pressing keys afterward doesn't itself steal focus
 *  away from that field). Mounted at document.documentElement — same reasoning as
 *  panel.root: must never be filtered by applyClasses() (see CLAUDE.md's "must never be
 *  a descendant of container" rule).
 *
 *  `onClose` fires when the overlay's own close button is clicked — the caller (not
 *  this module) owns tearing the overlay down via the returned handle's destroy(), so
 *  the on-panel toggle stays in sync whichever way the keyboard closes. */
export function createVirtualKeyboard(onClose: () => void): VirtualKeyboardHandle {
  let target: HTMLElement | null = isEditableElement(document.activeElement) ? document.activeElement : null;

  let capsLock = false;
  let shiftActive = false;
  const letterKeys: { btn: HTMLButtonElement; char: string }[] = [];

  function effectiveCase(char: string): string {
    return capsLock || shiftActive ? char.toUpperCase() : char;
  }

  function refreshLetterLabels(): void {
    for (const { btn, char } of letterKeys) btn.textContent = effectiveCase(char);
  }

  function insert(text: string): void {
    if (!target) return;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const input = target;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, start) + text + input.value.slice(end);
      input.selectionStart = input.selectionEnd = start + text.length;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('insertText', false, text);
    }
    target.focus();
  }

  function backspace(): void {
    if (!target) return;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const input = target;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const deleteFrom = start === end ? Math.max(0, start - 1) : start;
      input.value = input.value.slice(0, deleteFrom) + input.value.slice(end);
      input.selectionStart = input.selectionEnd = deleteFrom;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('delete');
    }
    target.focus();
  }

  function pressEnter(): void {
    if (!target) return;
    if (target instanceof HTMLTextAreaElement) {
      insert('\n');
      return;
    }
    // Native inputs have no literal newline to insert — dispatch the real key events
    // instead, so a host page's own "submit on Enter" keydown listener still fires.
    const opts = { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent('keydown', opts));
    target.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  function pressLetter(char: string): void {
    insert(effectiveCase(char));
    if (shiftActive) {
      shiftActive = false;
      shiftBtn.classList.remove('act');
      refreshLetterLabels();
    }
  }

  const root = document.createElement('div');
  root.className = 'a11y-vkb';

  const header = document.createElement('div');
  header.className = 'a11y-vkb-hdr';
  const title = document.createElement('span');
  title.textContent = 'Virtual Keyboard';
  const hint = document.createElement('span');
  hint.className = 'a11y-vkb-hint';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'a11y-vkb-close';
  closeBtn.setAttribute('aria-label', 'Close virtual keyboard');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  closeBtn.addEventListener('click', onClose);
  header.append(title, hint, closeBtn);
  root.appendChild(header);

  function updateHint(): void {
    root.classList.toggle('a11y-vkb--no-target', !target);
    hint.textContent = target ? '' : 'Click a text field to type into';
  }

  function onFocusIn(e: FocusEvent): void {
    const el = e.target as Element | null;
    // Ignore the keyboard's own buttons — its keys never take focus anyway
    // (pointerdown preventDefault), but the close/toggle controls elsewhere in the
    // panel could otherwise overwrite `target` right back to themselves.
    if (root.contains(el)) return;
    target = isEditableElement(el) ? el : target;
    updateHint();
  }
  document.addEventListener('focusin', onFocusIn, true);

  function key(label: string, onPress: () => void, extraClass = ''): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = extraClass ? `a11y-vkb-key ${extraClass}` : 'a11y-vkb-key';
    btn.textContent = label;
    btn.addEventListener('pointerdown', (e) => e.preventDefault());
    btn.addEventListener('click', onPress);
    return btn;
  }

  function letterKey(char: string): HTMLButtonElement {
    const btn = key(effectiveCase(char), () => pressLetter(char));
    letterKeys.push({ btn, char });
    return btn;
  }

  const numberRow = document.createElement('div');
  numberRow.className = 'a11y-vkb-row';
  for (const digit of NUMBER_ROW) numberRow.appendChild(key(digit, () => insert(digit)));
  numberRow.appendChild(key('⌫', backspace, 'a11y-vkb-key--back'));
  root.appendChild(numberRow);

  for (const row of LETTER_ROWS) {
    const rowEl = document.createElement('div');
    rowEl.className = 'a11y-vkb-row';
    for (const char of row) rowEl.appendChild(letterKey(char));
    if (row === LETTER_ROWS[1]) rowEl.appendChild(key('Enter', pressEnter, 'a11y-vkb-key--enter'));
    root.appendChild(rowEl);
  }

  const shiftBtn = key('⇧', () => {
    shiftActive = !shiftActive;
    shiftBtn.classList.toggle('act', shiftActive);
    refreshLetterLabels();
  }, 'a11y-vkb-key--shift');
  const capsBtn = key('Caps', () => {
    capsLock = !capsLock;
    capsBtn.classList.toggle('act', capsLock);
    refreshLetterLabels();
  }, 'a11y-vkb-key--caps');
  const bottomRow = document.createElement('div');
  bottomRow.className = 'a11y-vkb-row';
  bottomRow.append(
    shiftBtn,
    capsBtn,
    key(',', () => insert(',')),
    key('Space', () => insert(' '), 'a11y-vkb-key--space'),
    key('.', () => insert('.')),
    key('?', () => insert('?')),
    key('!', () => insert('!'))
  );
  root.appendChild(bottomRow);

  updateHint();
  document.documentElement.appendChild(root);

  return {
    destroy(): void {
      document.removeEventListener('focusin', onFocusIn, true);
      root.remove();
    },
  };
}
