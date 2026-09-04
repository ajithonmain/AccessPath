// Homepage script. @accesspath/core and the two effect stylesheets are NOT imported
// here — they're isolated in ./builder.ts, which this file lazy-loads when the visitor
// scrolls to the "Install & Customize" section (see the IntersectionObserver below).
// The real site widget on index.html is the plain <script src="/embed.js"> tag, which
// injects its own effect CSS at runtime.
import { highlightCode, flashCopied, COPY_ICON_SVG, CHECK_ICON_SVG } from './code-ui';

// window.AccessPath is set by the embed <script> tag at the bottom of index.html
// (packages/embed/src/index.ts) — declared here too since this file doesn't import
// from @accesspath/embed (it's loaded as a plain runtime script, not a package dep).
declare global {
  interface Window {
    AccessPath?: { open(): void; close(): void; toggle(): void };
  }
}

// --- Embed-load resilience ---------------------------------------------------------
// The embed <script> tag's own onerror="" attribute (in index.html) catches a hard
// network failure (404, offline) immediately. This covers the other failure mode: the
// script loads but mount() never runs or throws before it appends the trigger button
// (e.g. a bad `dist/embed.js` from a stale sync-embed.mjs run) — checked once, after
// giving mount() a generous window to run on a slow connection.
// The trigger lives inside embed.js's own Shadow DOM host (#accesspath-embed-host),
// not the light DOM — document.querySelector can never see into it, so this must
// look up the host and query its shadowRoot directly or every load reads as failed.
window.setTimeout(() => {
  const shadow = document.getElementById('accesspath-embed-host')?.shadowRoot;
  if (!shadow?.querySelector('.accesspath-trigger')) {
    document.body.classList.add('embed-failed');
  }
}, 4000);

// --- Nav background: transparent over the hero, solid once the page scrolls -------
const navEl = document.querySelector('.nav');
function syncNavScrolled(): void {
  navEl?.classList.toggle('is-scrolled', window.scrollY > 8);
}
syncNavScrolled();
window.addEventListener('scroll', syncNavScrolled, { passive: true });

// --- Mobile nav menu: below 700px .nav-links becomes a toggled dropdown -----------
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');

function setNavOpen(isOpen: boolean): void {
  navLinks?.classList.toggle('is-open', isOpen);
  navToggle?.setAttribute('aria-expanded', String(isOpen));
  navToggle?.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
}

navToggle?.addEventListener('click', () => {
  setNavOpen(navToggle.getAttribute('aria-expanded') !== 'true');
});
navLinks?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => setNavOpen(false));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && navToggle?.getAttribute('aria-expanded') === 'true') {
    setNavOpen(false);
    navToggle.focus();
  }
});

// --- Hero primary CTA: opens the real widget; falls back to the on-page demo if the
// embed script hasn't loaded yet (see the embed-load resilience block above). --------
const heroTryBtn = document.querySelector<HTMLAnchorElement>('.hero-cta a[href="#hero-demo"]');
heroTryBtn?.addEventListener('click', (e) => {
  if (window.AccessPath) {
    e.preventDefault();
    window.AccessPath.open();
  } else {
    window.setTimeout(() => document.getElementById('hero-demo')?.focus({ preventScroll: true }), 400);
  }
});

// --- Hero quick-control strip -------------------------------------------------------
// Four restrained controls that demonstrate the product by changing the "With
// AccessPath" demo pane only — never the real drawer/panel (see CLAUDE.md: the real
// AccessPath trigger stays closed by default and is opened by the visitor).
// Text Size starts on "large" (its button shows active/bordered from load, matching
// the approved reference) — cycling moves large -> xl -> normal -> large ...
const TEXT_SIZE_STEPS = ['large', 'xl', 'normal'] as const;
type TextSizeStep = (typeof TEXT_SIZE_STEPS)[number];

const demoPaneAfter = document.getElementById('demo-pane-after');
const ctrlTextSize = document.getElementById('ctrl-text-size');
const ctrlContrast = document.getElementById('ctrl-contrast');
const ctrlDyslexia = document.getElementById('ctrl-dyslexia');

let textSizeIndex = 0;

function setTextSizeStep(step: TextSizeStep): void {
  demoPaneAfter?.classList.remove('demo-size-xl', 'demo-size-normal');
  if (step !== 'large') demoPaneAfter?.classList.add(`demo-size-${step}`);
  ctrlTextSize?.classList.toggle('is-active', step !== 'normal');
  ctrlTextSize?.setAttribute('aria-pressed', String(step !== 'normal'));
  // Extra state detail via title (a description, not the accessible name) so it can't
  // conflict with the visible "Text Size" label — WCAG 2.5.3 Label in Name. The button's
  // accessible name stays its visible text; aria-pressed conveys on/off.
  ctrlTextSize?.setAttribute('title', `Text size: ${step === 'xl' ? 'extra large' : step}. Click to cycle.`);
}
setTextSizeStep(TEXT_SIZE_STEPS[textSizeIndex]);

ctrlTextSize?.addEventListener('click', () => {
  textSizeIndex = (textSizeIndex + 1) % TEXT_SIZE_STEPS.length;
  setTextSizeStep(TEXT_SIZE_STEPS[textSizeIndex]);
});

ctrlContrast?.addEventListener('click', () => {
  const isActive = demoPaneAfter?.classList.toggle('demo-contrast') ?? false;
  ctrlContrast.classList.toggle('is-active', isActive);
  ctrlContrast.setAttribute('aria-pressed', String(isActive));
  ctrlContrast.setAttribute('title', `Contrast: ${isActive ? 'high' : 'normal'}. Click to toggle.`);
});

const ctrlLineHeight = document.getElementById('ctrl-line-height');
ctrlLineHeight?.addEventListener('click', () => {
  const isActive = demoPaneAfter?.classList.toggle('demo-line-height') ?? false;
  ctrlLineHeight.classList.toggle('is-active', isActive);
  ctrlLineHeight.setAttribute('aria-pressed', String(isActive));
  ctrlLineHeight.setAttribute('title', `Line height: ${isActive ? 'expanded' : 'normal'}. Click to toggle.`);
});

ctrlDyslexia?.addEventListener('click', () => {
  const isActive = demoPaneAfter?.classList.toggle('demo-dyslexia') ?? false;
  ctrlDyslexia.classList.toggle('is-active', isActive);
  ctrlDyslexia.setAttribute('aria-pressed', String(isActive));
  ctrlDyslexia.setAttribute('title', `Dyslexia font: ${isActive ? 'on' : 'off'}. Click to toggle.`);
});

// --- Code block syntax highlighting + copy buttons --------------------------------
// highlightCode / flashCopied / the icon SVGs live in ./code-ui (shared with builder.ts).

function makeCopyButton(getText: () => string, ariaLabel = 'Copy code'): HTMLButtonElement {
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'code-copy-btn';
  copyBtn.setAttribute('aria-label', ariaLabel);
  copyBtn.innerHTML = COPY_ICON_SVG;
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getText());
      flashCopied(copyBtn, COPY_ICON_SVG, ariaLabel);
    } catch {
      // Clipboard API can be blocked (permissions, insecure context) — the code is
      // already selectable/visible in the block, so this is a silent no-op fallback.
    }
  });
  return copyBtn;
}

// Static, still-bare blocks only — #qc-builder-code already has its own labeled Copy
// button in its builder's header, and anything already inside a `.code-panel` (the
// Integration Guide hand-authors its own panel chrome per snippet, header, language
// label, and copy button included) is already wrapped, so re-wrapping it here would
// nest a second header/copy button/highlight pass inside the first. Each remaining
// bare block gets wrapped in a windowed .code-panel (language label + copy button in
// a header bar) instead of a button floating on top of the code text.
const staticCodeBlocks = Array.from(document.querySelectorAll<HTMLElement>('.code-block')).filter(
  (el) => el.id !== 'qc-builder-code' && !el.closest('.code-panel')
);

for (const block of staticCodeBlocks) {
  const codeEl = block.querySelector('code');
  if (codeEl) codeEl.innerHTML = highlightCode(codeEl.textContent ?? '');

  const panel = document.createElement('div');
  panel.className = 'code-panel';

  const head = document.createElement('div');
  head.className = 'code-panel-head';
  const lang = document.createElement('span');
  lang.className = 'code-panel-lang';
  lang.textContent = block.dataset['lang'] ?? 'code';
  head.appendChild(lang);
  head.appendChild(makeCopyButton(() => codeEl?.textContent ?? ''));

  block.parentElement?.insertBefore(panel, block);
  panel.appendChild(head);
  panel.appendChild(block);
}

// CDN snippet next to the HTML/WordPress download button — not a .code-block (it's a
// one-line pill, not a code panel), so it needs its own copy button rather than the
// generic wrapping loop above. Styled for a light pill background via .qc-html-cdn-copy,
// unlike .code-copy-btn which assumes a dark .code-panel-head.
const cdnRow = document.getElementById('qc-html-cdn-row');
const cdnCode = cdnRow?.querySelector<HTMLElement>('.qc-html-cdn');
if (cdnRow && cdnCode) {
  const cdnCopyBtn = makeCopyButton(() => cdnCode.textContent ?? '', 'Copy npm install command');
  cdnCopyBtn.classList.add('qc-html-cdn-copy');
  cdnRow.appendChild(cdnCopyBtn);
}



// --- Customize builder (lazy-loaded) ---------------------------------------------
// The builder pulls in @accesspath/core (panel UI + icons + i18n + scanner, ~200 KB of
// JS) for its live preview. It sits well below the fold, so defer that cost: load the
// chunk only when the "Install & Customize" section is within 600px of the viewport.
const builderSection = document.getElementById('install-quickstart-v2');
if (builderSection) {
  const startBuilder = () => {
    io.disconnect();
    import('./builder').then((m) => m.initBuilder()).catch(() => {});
  };
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) startBuilder();
    },
    { rootMargin: '600px' }
  );
  io.observe(builderSection);
}


// --- Install & Customize outer tab switch (Quick start <-> Customize) -------------
const qcTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.qc-tab'));
const qcPanels = Array.from(document.querySelectorAll<HTMLElement>('.qc-panel'));

function activateQcTab(name: string): void {
  for (const btn of qcTabButtons) {
    const isActive = btn.dataset['qcTab'] === name;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  }
  for (const panel of qcPanels) {
    const isActive = panel.id === `qc-panel-${name}`;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  }
}

for (const btn of qcTabButtons) {
  btn.addEventListener('click', () => activateQcTab(btn.dataset['qcTab'] ?? 'customize'));
}

// --- Install & Customize platform sub-tabs (Quick start panel) --------------------
const qcPlatformTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.qc-platform-tab'));
const qcPlatformPanels = Array.from(document.querySelectorAll<HTMLElement>('.qc-platform-panel'));

function activateQcPlatformTab(name: string): void {
  for (const btn of qcPlatformTabs) {
    const isActive = btn.dataset['qcPlatform'] === name;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  }
  for (const panel of qcPlatformPanels) {
    const isActive = panel.id === `qc-tab-${name}`;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  }
}

for (const btn of qcPlatformTabs) {
  btn.addEventListener('click', () => activateQcPlatformTab(btn.dataset['qcPlatform'] ?? 'html'));
}

// --- FAQ accordion -------------------------------------------------------------------
// One item open at a time — opening one collapses whichever else was open. The first
// item starts open (.is-open / aria-expanded="true" already set in the markup).
const faqItems = Array.from(document.querySelectorAll<HTMLElement>('[data-faq-item]'));

// The answer's open/close motion is a CSS max-height transition (see .faq-item-answer
// in style.css), animated to a real measured pixel value (--faq-answer-h) rather than
// the grid-template-rows: 0fr <-> 1fr trick this used to be — that forced a per-frame
// intrinsic-size recalculation that visibly hitched in some browsers. Not the [hidden]
// attribute either — [hidden] maps to display:none, which can't be transitioned.
// [hidden] is still applied, just deferred until the collapse animation finishes, so a
// closed answer stays out of the tab order and the accessibility tree.
const faqReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setFaqItemOpen(item: HTMLElement, isOpen: boolean): void {
  const head = item.querySelector<HTMLButtonElement>('.faq-item-head');
  const answer = item.querySelector<HTMLElement>('.faq-item-answer');
  head?.setAttribute('aria-expanded', String(isOpen));
  if (!answer) {
    item.classList.toggle('is-open', isOpen);
    return;
  }

  if (isOpen) {
    // Unhide + measure BEFORE toggling .is-open, since a [hidden] (display:none)
    // element always reports scrollHeight 0 — the transition target has to be the
    // real rendered content height, captured while it's actually laid out.
    answer.hidden = false;
    answer.style.setProperty('--faq-answer-h', `${answer.scrollHeight}px`);
  }
  item.classList.toggle('is-open', isOpen);

  if (isOpen) {
    // handled above
  } else if (faqReducedMotion) {
    answer.hidden = true;
  } else {
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== answer || event.propertyName !== 'max-height') return;
      answer.removeEventListener('transitionend', onTransitionEnd);
      if (!item.classList.contains('is-open')) answer.hidden = true;
    };
    answer.addEventListener('transitionend', onTransitionEnd);
  }
}

for (const item of faqItems) {
  item.querySelector('.faq-item-head')?.addEventListener('click', () => {
    const isOpen = item.classList.contains('is-open');
    for (const other of faqItems) setFaqItemOpen(other, other === item && !isOpen);
  });
  // The first item starts open in the markup (no JS ever ran setFaqItemOpen(true)
  // for it), so --faq-answer-h would otherwise fall back to the CSS default rather
  // than this item's real content height.
  if (item.classList.contains('is-open')) {
    const answer = item.querySelector<HTMLElement>('.faq-item-answer');
    answer?.style.setProperty('--faq-answer-h', `${answer.scrollHeight}px`);
  }
}

// --- Scroll-in reveal ---------------------------------------------------------------
// html.has-js is the switch that lets style.css hide .reveal/.reveal-left/.reveal-right
// elements pre-animation — added only here, so a JS failure (or reduced-motion users
// who never need the hidden state) can never leave content stuck invisible.
document.documentElement.classList.add('has-js');

const revealTargets = Array.from(document.querySelectorAll('.reveal, .reveal-left, .reveal-right'));

if (revealTargets.length > 0 && 'IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );
  for (const el of revealTargets) revealObserver.observe(el);
} else {
  for (const el of revealTargets) el.classList.add('is-visible');
}

// --- Profile card slider pause/play -------------------------------------------------
// Explicit toggle for the auto-scrolling profile card strip (#profiles-showcase), on
// top of the hover/focus-pause already in style.css — a keyboard-only visitor can't
// hover, and WCAG 2.2.2 requires any auto-moving content to have a way to stop it that
// doesn't depend on a pointer. prefers-reduced-motion visitors never see this button at
// all (style.css hides it — there's no animation running for it to control).
{
  const sliderTrack = document.getElementById('pt2-slider-track');
  const toggleBtn = document.getElementById('pt2-slider-toggle');
  const toggleIcon = document.getElementById('pt2-slider-toggle-icon');
  const toggleLabel = document.getElementById('pt2-slider-toggle-label');
  if (sliderTrack && toggleBtn && toggleIcon && toggleLabel) {
    const PAUSE_ICON = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
    const PLAY_ICON = '<path d="M7 4l13 8-13 8V4z"/>';
    toggleBtn.addEventListener('click', () => {
      const nowPaused = sliderTrack.classList.toggle('is-paused');
      toggleBtn.setAttribute('aria-pressed', String(nowPaused));
      toggleIcon.innerHTML = nowPaused ? PLAY_ICON : PAUSE_ICON;
      toggleLabel.textContent = nowPaused ? 'Play' : 'Pause';
    });
  }
}

