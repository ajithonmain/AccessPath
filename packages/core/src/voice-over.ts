import { closeIcon, pauseIcon, playIcon, restartIcon } from './icons';
import { isSpeechSupported } from './tts';

/** Sequential whole-page reader for the Voice Over profile (A11yPrefs.voiceOver).
 *
 *  Unlike tts.ts's one-shot speak(), this walks the host container's readable blocks
 *  in DOM order and speaks them one utterance at a time, so it can pause/resume/restart
 *  and visually mark the block currently being read. A small fixed control bar
 *  (play-pause / restart / stop) is appended to <body> — outside the host container,
 *  same as the reading guide — so it never inherits the a11y-* filter effects.
 *
 *  This is NOT a screen reader and does not try to be one (see CLAUDE.md / a11y-scanner):
 *  real blind users run JAWS/NVDA/VoiceOver at the OS level. It is the one thing a
 *  widget genuinely can do — read the visible page text aloud, start to finish. */

const READABLE_SELECTOR =
  'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dt,dd,th,td,summary,caption';

export interface VoiceOverStrings {
  play: string;
  pause: string;
  restart: string;
  stop: string;
  /** Spoken once when Voice Over turns on, to tell the user how to navigate. */
  nav: string;
  roleLink: string;
  roleButton: string;
  roleField: string;
}

const FOCUSABLE_SELECTOR =
  'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"]),[role="button"],[role="link"]';

/** Best-effort accessible name — mirrors the order a screen reader roughly uses. */
function accessibleName(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim();
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const ref = labelledby
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (ref) return ref;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const labelled = el.labels?.[0]?.textContent?.trim();
    if (labelled) return labelled;
    if (el.placeholder) return el.placeholder.trim();
  }
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (text) return text;
  return (el.getAttribute('title') || el.getAttribute('alt') || '').trim();
}

function roleWord(el: HTMLElement, s: VoiceOverStrings): string {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  if (role === 'link' || tag === 'a') return s.roleLink;
  if (role === 'button' || tag === 'button' || tag === 'summary') return s.roleButton;
  if (tag === 'select' || tag === 'textarea') return s.roleField;
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type;
    return type === 'button' || type === 'submit' || type === 'reset' ? s.roleButton : s.roleField;
  }
  return '';
}

export interface VoiceOverSettings {
  /** A11yPrefs.voiceRateLevel, 0-100. */
  rateLevel: number;
  /** A11yPrefs.voicePitchLevel, 0-100. */
  pitchLevel: number;
  /** A11yPrefs.voiceURI, or null for the browser default. */
  voiceURI: string | null;
}

export interface VoiceOverHandle {
  destroy(): void;
}

/** Joins `container`'s readable blocks (same block detection collectBlocks() uses for the
 *  sequential reader — skips hidden/aria-hidden/zero-rect elements and script/style text)
 *  into one string. Used by tts.ts's Read Aloud fallback so it doesn't read raw
 *  `container.textContent`, which would include hidden and non-visible markup. */
export function collectReadableText(container: HTMLElement): string {
  return collectBlocks(container)
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('. ');
}

/** 0-100 level -> a 0.5x..2x multiplier centred on 1x at level 50. Shared by rate
 *  (SpeechSynthesisUtterance.rate) and pitch (.pitch, whose valid range is 0-2). */
function levelToFactor(level: number): number {
  return 2 ** ((level - 50) / 50);
}

/** speechSynthesis.getVoices() is populated asynchronously in some browsers — it can
 *  return [] on first call and only fill in after the 'voiceschanged' event. Callers
 *  that build a picker should also listen for that event. */
export function getVoices(): SpeechSynthesisVoice[] {
  return isSpeechSupported() ? window.speechSynthesis.getVoices() : [];
}

export function collectBlocks(container: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of Array.from(container.querySelectorAll<HTMLElement>(READABLE_SELECTOR))) {
    if (el.closest('[aria-hidden="true"]')) continue;
    // querySelectorAll yields document order, so a wrapping <li>/<td> is seen before
    // its inner <p> — skip anything already covered by a queued ancestor to avoid
    // reading the same text twice.
    if (out.some((q) => q.contains(el))) continue;
    if (!(el.textContent ?? '').replace(/\s+/g, ' ').trim()) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (!el.getClientRects().length) continue;
    out.push(el);
  }
  return out;
}

export function createVoiceOver(
  container: HTMLElement,
  strings: VoiceOverStrings,
  onStop: () => void,
  /** Read fresh on every utterance so slider/voice changes take effect from the next
   *  spoken block or focus announcement without recreating the reader. */
  getSettings: () => VoiceOverSettings
): VoiceOverHandle {
  if (!isSpeechSupported()) return { destroy() {} };

  function makeUtterance(text: string): SpeechSynthesisUtterance {
    const u = new SpeechSynthesisUtterance(text);
    const s = getSettings();
    u.rate = levelToFactor(s.rateLevel);
    u.pitch = Math.max(0, Math.min(2, levelToFactor(s.pitchLevel)));
    if (s.voiceURI) {
      const match = window.speechSynthesis.getVoices().find((v) => v.voiceURI === s.voiceURI);
      if (match) u.voice = match;
    }
    return u;
  }

  const synth = window.speechSynthesis;
  const blocks = collectBlocks(container);
  let index = 0;
  let paused = false;
  let destroyed = false;

  // Bumped on every (re)start so a stale utterance.onend fired by a preceding
  // speechSynthesis.cancel() can't advance the queue for a run we've moved on from.
  let generation = 0;

  /** Split a long block so no single utterance runs long enough to hit Chrome's ~15s
   *  single-utterance cutoff — more reliable than a pause()/resume() keep-alive hack
   *  (which breaks reading outright on some engines). */
  function chunk(text: string): string[] {
    if (text.length <= 200) return [text];
    const parts: string[] = [];
    let buf = '';
    for (const piece of text.split(/(?<=[.!?。！？])\s+/)) {
      if (buf && (buf + ' ' + piece).length > 200) {
        parts.push(buf);
        buf = piece;
      } else {
        buf = buf ? buf + ' ' + piece : piece;
      }
    }
    if (buf) parts.push(buf);
    return parts;
  }

  /** speechSynthesis can be stuck 'paused' from a previous page — resume() clears that.
   *  Only cancel() when something is actually playing/queued: calling cancel() on an idle
   *  engine wedges Chrome so the next speak() is silently dropped (this was the "still
   *  not working" bug). And Chrome also drops a speak() in the same tick as a cancel(),
   *  so when we do have to interrupt, the real speak waits a tick. */
  function speakNow(u: SpeechSynthesisUtterance, interrupt: boolean): void {
    synth.resume();
    if (interrupt && (synth.speaking || synth.pending)) {
      synth.cancel();
      window.setTimeout(() => {
        if (!destroyed) synth.speak(u);
      }, 120);
    } else {
      synth.speak(u);
    }
  }

  const bar = document.createElement('div');
  bar.className = 'a11y-voiceover-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Voice Over controls');

  const playPauseBtn = document.createElement('button');
  playPauseBtn.type = 'button';
  playPauseBtn.className = 'a11y-voiceover-btn';
  const restartBtn = document.createElement('button');
  restartBtn.type = 'button';
  restartBtn.className = 'a11y-voiceover-btn';
  restartBtn.setAttribute('aria-label', strings.restart);
  restartBtn.appendChild(restartIcon());
  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'a11y-voiceover-btn';
  stopBtn.setAttribute('aria-label', strings.stop);
  stopBtn.appendChild(closeIcon());

  const status = document.createElement('span');
  status.className = 'a11y-voiceover-status';
  status.setAttribute('aria-live', 'polite');

  bar.append(playPauseBtn, restartBtn, status, stopBtn);
  // document.documentElement, not document.body — same reasoning as panel.root/the trigger
  // (see CLAUDE.md's "panel.root must never be a DOM descendant of container" constraint)
  // and virtual-keyboard.ts's root mount. `container` defaults to document.body, and any
  // filter-based effect (saturate/invert/contrast/monochrome/color-blind sim) applied there
  // makes body a new containing block for position:fixed descendants per the CSS filter
  // spec — this bar, appended as a body child, would then position itself relative to
  // body's box instead of the viewport, and can render off-screen or in the wrong spot
  // whenever Voice Over is combined with any of those effects (an actual bug: the bar
  // visually "disappeared" when Voice Over was active alongside another filter-based
  // profile/toggle). Mounting on <html> instead sidesteps this the same way the panel does.
  document.documentElement.appendChild(bar);

  function finished(): boolean {
    return index >= blocks.length;
  }

  function setPlayPauseUI(): void {
    const showPlay = paused || finished();
    playPauseBtn.replaceChildren(showPlay ? playIcon() : pauseIcon());
    playPauseBtn.setAttribute('aria-label', showPlay ? strings.play : strings.pause);
  }

  function updateStatus(): void {
    status.textContent = blocks.length
      ? `${Math.min(index + 1, blocks.length)} / ${blocks.length}`
      : '';
  }

  function clearHighlight(): void {
    container
      .querySelectorAll('.a11y-vo-reading')
      .forEach((el) => el.classList.remove('a11y-vo-reading'));
  }

  function speakCurrent(interrupt: boolean): void {
    const gen = ++generation;
    clearHighlight();
    if (destroyed || paused) return;
    if (finished()) {
      setPlayPauseUI();
      updateStatus();
      return;
    }
    const el = blocks[index];
    el.classList.add('a11y-vo-reading');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    updateStatus();

    const pieces = chunk((el.textContent ?? '').replace(/\s+/g, ' ').trim());
    let pi = 0;
    const speakPiece = (doInterrupt: boolean): void => {
      if (destroyed || paused || gen !== generation) return;
      const u = makeUtterance(pieces[pi]);
      const next = (): void => {
        if (destroyed || paused || gen !== generation) return;
        pi++;
        if (pi < pieces.length) speakPiece(false);
        else {
          index++;
          speakCurrent(false);
        }
      };
      u.onend = next;
      u.onerror = (e) => {
        // 'interrupted'/'canceled' are our own cancel()s — ignore, don't skip ahead.
        if (e.error !== 'interrupted' && e.error !== 'canceled') next();
      };
      speakNow(u, doInterrupt);
    };
    speakPiece(interrupt);
  }

  /** Speak a one-off phrase (a focused control's name/role) and yield the sequential
   *  reader to it: bumping generation stops any queued onend from resuming the auto-read,
   *  so once the user starts Tabbing they're in navigation mode until they hit Play. */
  function announce(text: string): void {
    if (destroyed || !text) return;
    generation++;
    paused = true;
    clearHighlight();
    speakNow(makeUtterance(text), true);
    setPlayPauseUI();
    updateStatus();
  }

  function onFocusIn(e: FocusEvent): void {
    const el = e.target;
    if (!(el instanceof HTMLElement) || bar.contains(el)) return;
    if (!el.matches(FOCUSABLE_SELECTOR)) return;
    const phrase = [accessibleName(el), roleWord(el, strings)].filter(Boolean).join(', ');
    if (phrase) announce(phrase);
  }
  document.addEventListener('focusin', onFocusIn);

  playPauseBtn.addEventListener('click', () => {
    if (finished()) {
      index = 0;
      paused = false;
      speakCurrent(true);
    } else if (paused) {
      paused = false;
      speakCurrent(true);
    } else {
      paused = true;
      generation++; // stop any queued onend from resuming
      synth.cancel();
    }
    setPlayPauseUI();
  });

  restartBtn.addEventListener('click', () => {
    index = 0;
    paused = false;
    speakCurrent(true);
    setPlayPauseUI();
  });

  stopBtn.addEventListener('click', () => {
    // Flips A11yPrefs.voiceOver off via the panel, which re-runs syncVoiceOver()
    // and calls destroy() for us.
    onStop();
  });

  setPlayPauseUI();
  updateStatus();

  // Speak the navigation hint first, then fall through to reading the content.
  const intro = makeUtterance(strings.nav);
  const startContent = () => {
    if (!destroyed && !paused && generation === 0) speakCurrent(false);
  };
  intro.onend = startContent;
  intro.onerror = (e) => {
    if (e.error !== 'interrupted' && e.error !== 'canceled') startContent();
  };

  // Browsers block speechSynthesis.speak() unless there is a live user activation.
  // Toggling the Voice Over card *is* one, so we normally speak immediately. But when
  // the pref was restored on page load there is no activation yet and the call is
  // dropped silently ("no sound at all") — so in that case wait for the visitor's next
  // click or keypress and start then.
  let unbindGesture: (() => void) | undefined;
  const begin = () => {
    unbindGesture?.();
    unbindGesture = undefined;
    if (!destroyed) speakNow(intro, true);
  };
  if (navigator.userActivation ? navigator.userActivation.isActive : true) {
    begin();
  } else {
    const onGesture = () => begin();
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
    unbindGesture = () => {
      document.removeEventListener('pointerdown', onGesture, true);
      document.removeEventListener('keydown', onGesture, true);
    };
  }

  return {
    destroy(): void {
      destroyed = true;
      unbindGesture?.();
      document.removeEventListener('focusin', onFocusIn);
      synth.cancel();
      clearHighlight();
      bar.remove();
    },
  };
}
