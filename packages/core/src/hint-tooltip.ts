/** A single reusable hint tooltip for the panel. Native `title` tooltips don't appear
 *  on touch at all and are slow/unstyled on desktop, so every `[data-tip]` element in
 *  the panel gets this instead: shows on hover, on keyboard focus, and on tap (toggle),
 *  hides on leave / blur / Escape / outside tap.
 *
 *  The bubble is appended to `panelRoot` (`.accesspath-panel`) so its styles — which
 *  live in panel.css — apply whether the panel is in the light DOM (React/Angular) or
 *  the embed's Shadow DOM. It's `position: fixed`, so it still anchors to the viewport
 *  from inside the shadow tree. */
export interface HintTooltipController {
  /** Wire hover/focus/tap on `trigger` to show `text`. Removes any `title` on it so
   *  the browser's own tooltip doesn't also fire. Adds an `aria-describedby` link to a
   *  visually-hidden copy of the text so assistive tech gets the hint too. */
  attach(trigger: HTMLElement, text: string): void;
  /** Attach to every `[data-tip]` under `panelRoot`, using the attribute's value. */
  attachAll(): void;
}

let seq = 0;

export function createHintTooltips(panelRoot: HTMLElement): HintTooltipController {
  const bubble = document.createElement('div');
  bubble.className = 'a11y-tip';
  bubble.setAttribute('role', 'tooltip');
  bubble.hidden = true;
  panelRoot.appendChild(bubble);

  let activeTrigger: HTMLElement | null = null;
  let pinned = false; // opened by tap — stays until an outside tap / Escape

  function place(trigger: HTMLElement): void {
    const r = trigger.getBoundingClientRect();
    bubble.hidden = false;
    // measure, then position centred below (or above if it would clip the viewport)
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    let left = r.left + r.width / 2 - bw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    let top = r.bottom + 8;
    if (top + bh > window.innerHeight - 8) top = r.top - bh - 8;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  function show(trigger: HTMLElement): void {
    const text = trigger.dataset.tip;
    if (!text) return;
    activeTrigger = trigger;
    bubble.textContent = text;
    place(trigger);
    bubble.classList.add('show');
  }

  function hide(): void {
    activeTrigger = null;
    pinned = false;
    bubble.classList.remove('show');
    bubble.hidden = true;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeTrigger) hide();
  });
  // Scrolling the panel (or the page) moves the trigger out from under a tooltip that
  // was positioned for its old spot — just dismiss it.
  document.addEventListener('scroll', () => { if (activeTrigger) hide(); }, true);
  // Outside tap dismisses a pinned tooltip.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!pinned || !activeTrigger) return;
      const path = e.composedPath();
      if (!path.includes(activeTrigger) && !path.includes(bubble)) hide();
    },
    true
  );

  function attach(trigger: HTMLElement, text: string): void {
    trigger.removeAttribute('title');
    trigger.dataset.tip = text;

    const srId = `a11y-tip-${++seq}`;
    const sr = document.createElement('span');
    sr.id = srId;
    sr.className = 'a11y-tip-sr';
    sr.textContent = text;
    trigger.appendChild(sr);
    const described = trigger.getAttribute('aria-describedby');
    trigger.setAttribute('aria-describedby', described ? `${described} ${srId}` : srId);

    trigger.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return; // touch is handled by the click toggle
      show(trigger);
    });
    trigger.addEventListener('pointerleave', () => {
      if (!pinned) hide();
    });
    trigger.addEventListener('focus', () => show(trigger));
    trigger.addEventListener('blur', () => {
      if (!pinned) hide();
    });
    trigger.addEventListener('click', () => {
      // On a real control (a card button) the click also does its normal job; the
      // tooltip just flashes. On the bare info icon (not a button) this is the only
      // way to see it on touch.
      if (activeTrigger === trigger && pinned) {
        hide();
      } else {
        show(trigger);
        pinned = true;
      }
    });
  }

  function attachAll(): void {
    panelRoot.querySelectorAll<HTMLElement>('[data-tip]').forEach((el) => {
      if (el === bubble) return;
      const t = el.dataset.tip;
      if (t) attach(el, t);
    });
  }

  return { attach, attachAll };
}
