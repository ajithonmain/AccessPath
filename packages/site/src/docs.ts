// Integration Guide page — self-contained since this page (unlike the homepage
// builder) has no generated/dynamic code, just static snippets and tabbed sections.

const COPY_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>';

const DOCS_TAB_STORAGE_KEY = 'accesspath-docs-tab';
const DOCS_TABS = ['vanilla', 'react', 'angular', 'reference'] as const;
type DocsTab = (typeof DOCS_TABS)[number];

function isDocsTab(value: string | null | undefined): value is DocsTab {
  return !!value && (DOCS_TABS as readonly string[]).includes(value);
}

// Right-hand "On this page" nav (see the Bootstrap docs it's modeled on) — lists the
// h3 subsections of whichever tab is currently active, with a scrollspy highlight.
// Rebuilt on every tab switch rather than kept as 4 static lists, since it always
// mirrors exactly one live .docs-tabpanel.
function createOnPageNav(): { refresh: (panel: HTMLElement) => void } {
  const nav = document.getElementById('docs-onpage-links');
  let observer: IntersectionObserver | null = null;
  let onScroll: (() => void) | null = null;

  // A reload's browser-restored scroll position can land after this module has
  // already run (and synced once against whatever position existed at that moment),
  // so re-sync once more after everything has actually finished loading. Attached
  // once here, not per refresh() call, since 'load' only ever fires once; it always
  // calls whichever onScroll the most recent refresh() set.
  window.addEventListener('load', () => onScroll?.(), { once: true });

  function refresh(panel: HTMLElement): void {
    if (!nav) return;
    observer?.disconnect();
    if (onScroll) window.removeEventListener('scroll', onScroll);
    nav.innerHTML = '';

    const headings = Array.from(panel.querySelectorAll<HTMLElement>('h3[id]'));
    if (!headings.length) return;

    for (const heading of headings) {
      // The heading also contains a .docs-anchor "#" permalink child (see the
      // hover-permalink styles in style.css) — strip it so the link label is just
      // the heading's own text.
      const clone = heading.cloneNode(true) as HTMLElement;
      clone.querySelector('.docs-anchor')?.remove();
      const link = document.createElement('a');
      link.href = `#${heading.id}`;
      link.textContent = clone.textContent?.trim() ?? '';
      nav.appendChild(link);
    }

    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a'));
    function setActive(id: string): void {
      for (const link of links) {
        link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`);
      }
    }
    setActive(headings[0].id);

    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        setActive(topmost.target.id);
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 }
    );
    for (const heading of headings) observer.observe(heading);

    // The observer's own trigger zone is only the top ~30% of the viewport (see
    // rootMargin above), so the last heading can scroll past it, with nothing below
    // to trigger a new intersection, well before the page actually reaches the
    // bottom. Left alone, that freezes the highlight on the second-to-last link even
    // while the last section fills the screen. Force the last link active once the
    // page is actually scrolled to (or within a couple px of) the bottom.
    const lastId = headings[headings.length - 1].id;
    onScroll = () => {
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom) setActive(lastId);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // Reloading a page the browser had scrolled to the bottom of restores that scroll
    // position automatically, sometimes before this listener even attaches, and
    // sometimes without firing a further 'scroll' event at all. The hardcoded
    // setActive(headings[0].id) default above has no way to know that happened, so
    // sync once against the real current position immediately instead of waiting on
    // an event that may never come.
    onScroll();
  }

  return { refresh };
}

// Top-level "Vanilla / React / Angular / Reference" switcher — only one
// .docs-tabpanel is ever visible, replacing the earlier long-scroll + sidebar layout
// the design started with. Each stack's own tab is self-contained (install snippet
// plus full reference), with no shared "Getting Started" tab. Remembers the
// visitor's last tab in localStorage, and honors an incoming #hash on load so
// anchor and permalink links from elsewhere still land on the right tab instead of
// a hidden panel.
function initDocsTabs(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-docs-tab]'));
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-docs-panel]'));
  if (!buttons.length || !panels.length) return;

  const onPageNav = createOnPageNav();

  function activate(tab: DocsTab, opts: { focusHash?: string } = {}): void {
    for (const btn of buttons) {
      const isActive = btn.dataset['docsTab'] === tab;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    }
    for (const panel of panels) {
      const isActive = panel.dataset['docsPanel'] === tab;
      panel.classList.toggle('is-active', isActive);
      panel.hidden = !isActive;
      if (isActive) onPageNav.refresh(panel);
    }
    try {
      localStorage.setItem(DOCS_TAB_STORAGE_KEY, tab);
    } catch {
      // Storage unavailable (private mode, disabled). The tab still switches for
      // this page view, it just won't be remembered on the next visit.
    }
    if (opts.focusHash) {
      document.getElementById(opts.focusHash)?.scrollIntoView({ block: 'start' });
    }
  }

  for (const btn of buttons) {
    btn.addEventListener('click', () => activate(btn.dataset['docsTab'] as DocsTab));
  }

  // Initial tab: an incoming #hash wins (deep link into a specific subsection), then
  // the visitor's remembered choice, then the default.
  const hash = window.location.hash.slice(1);
  const hashTarget = hash ? document.getElementById(hash) : null;
  const hashPanel = hashTarget?.closest<HTMLElement>('[data-docs-panel]');

  if (hashPanel && isDocsTab(hashPanel.dataset['docsPanel'])) {
    activate(hashPanel.dataset['docsPanel'] as DocsTab, { focusHash: hash });
    return;
  }

  let initial: DocsTab = 'vanilla';
  try {
    const saved = localStorage.getItem(DOCS_TAB_STORAGE_KEY);
    if (isDocsTab(saved)) initial = saved;
  } catch {
    // Default to 'vanilla' below.
  }
  activate(initial);
}

function initCodePanels(): void {
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-code-panel]'));

  for (const panel of panels) {
    const tabs = Array.from(panel.querySelectorAll<HTMLButtonElement>('.code-panel-tab'));
    const blocks = Array.from(panel.querySelectorAll<HTMLElement>('.code-block'));

    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        const platform = tab.dataset['platform'];
        for (const t of tabs) {
          const isActive = t === tab;
          t.classList.toggle('is-active', isActive);
          t.setAttribute('aria-selected', String(isActive));
        }
        for (const block of blocks) {
          const isActive = block.dataset['platform'] === platform;
          block.classList.toggle('is-active', isActive);
          block.hidden = !isActive;
        }
      });
    }

    const copyBtn = panel.querySelector<HTMLButtonElement>('.code-copy-btn');
    if (!copyBtn) continue;
    copyBtn.innerHTML = COPY_ICON_SVG;
    copyBtn.addEventListener('click', async () => {
      const active = panel.querySelector<HTMLElement>('.code-block.is-active') ?? blocks[0];
      const text = active?.textContent?.trim() ?? '';
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.classList.add('is-copied');
        window.setTimeout(() => copyBtn.classList.remove('is-copied'), 1400);
      } catch {
        // Clipboard API unavailable (e.g. insecure context) — silently no-op, the
        // code is still visible and selectable by hand.
      }
    });
  }
}

initDocsTabs();
initCodePanels();
