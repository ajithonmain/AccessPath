import { runAccessibilityScan, type ScanResult } from './a11y-scanner';
import { ACCESSPATH_LOGO_DATA_URI } from './logo';

/** Opens a full-viewport in-page overlay (an iframe, not a new tab — no popup-blocker
 *  risk, and the iframe gets its own scroll context for free) immediately, before
 *  scanning starts, then drives the scan from here and streams progress into the
 *  iframe via postMessage — the report iframe has no access to the host page's live
 *  DOM (it's a separate document), so the parent (this window, which already has
 *  `container`) has to be the one running a11y-scanner.ts's rules and reporting back
 *  per-rule progress, even though visually the whole "audit is running" experience
 *  happens inside the overlay. The overlay is mounted at document.documentElement
 *  (sibling of body, same reasoning as panel.root — see CLAUDE.md's "must never be a
 *  descendant of container" constraint) with a z-index above the drawer itself, and
 *  stays open until the visitor closes it (X button or Escape) — it isn't dismissed
 *  automatically when the scan finishes. */
export async function openReportAndScan(
  container: HTMLElement,
  meta: { pageTitle: string; pageUrl: string; brandColor?: string }
): Promise<ScanResult> {
  const html = buildReportShellHtml({ ...meta, heroImageUrl: findHeroImageUrl(container) });
  const { iframe, close } = mountReportOverlay(html);

  const win = iframe.contentWindow;
  const ready = win ? await waitForReady(win, 4000) : false;
  if (!win || !ready) {
    close();
    return runAccessibilityScan(container);
  }

  const result = await runAccessibilityScan(container, (completed, total, ruleHelp) => {
    postToChild(win, { source: 'accesspath-audit', type: 'progress', completed, total, ruleHelp });
  });

  postToChild(win, { source: 'accesspath-audit', type: 'result', result });
  return result;
}

/** Picks a real image off the host page to show behind the loading-screen thumbnail
 *  instead of a generic gradient placeholder — an author-declared og:image if present
 *  (the page's own idea of its "hero" image), otherwise the first sufficiently large
 *  visible <img> inside `container` in DOM order, which correlates with what a visitor
 *  actually sees painted first. Resolved to an absolute URL here (in the parent, which
 *  has the host page's real base URI) since the report iframe is a srcdoc document and
 *  a relative URL typed into the generated HTML string would be ambiguous to resolve. */
function findHeroImageUrl(container: HTMLElement): string | null {
  const og = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
  if (og?.content) {
    try {
      return new URL(og.content, document.baseURI).href;
    } catch {
      // Malformed og:image content — fall through to scanning the page's own images.
    }
  }
  const imgs = Array.from(container.querySelectorAll('img'));
  for (const img of imgs) {
    const rect = img.getBoundingClientRect();
    if (rect.width < 200 || rect.height < 120) continue;
    const src = img.currentSrc || img.src;
    if (!src) continue;
    try {
      return new URL(src, document.baseURI).href;
    } catch {
      continue;
    }
  }
  return null;
}

/** Builds the full-viewport overlay + iframe and mounts it, wiring up Escape and the
 *  in-iframe close button to tear it back down. Returns the iframe (for postMessage)
 *  and a close() the caller can use as a fallback-path teardown too. */
function mountReportOverlay(html: string): { iframe: HTMLIFrameElement; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'accesspath-report-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483010;background:#fff;border:none;';

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'display:block;width:100%;height:100%;border:none;';
  iframe.title = 'Accessibility Report';
  iframe.srcdoc = html;
  overlay.appendChild(iframe);
  document.documentElement.appendChild(overlay);

  // Unlike the drawer panel (deliberately non-scroll-locking — see CLAUDE.md, its
  // near-transparent backdrop exists precisely so the live host page stays visible
  // and interactive behind it), this overlay is fully opaque and covers the whole
  // viewport, so there's nothing to see behind it — letting the host page's body
  // keep scrolling while it's open only risks an unwanted scroll-position jump (or a
  // double scrollbar) once the overlay closes, with zero upside. Only the iframe's
  // own document should scroll while the overlay is up. Captures and restores
  // whatever inline overflow the host page already had, rather than blindly
  // clearing it, in case the host set one of its own.
  const previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  function close(): void {
    overlay.remove();
    document.body.style.overflow = previousBodyOverflow;
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('message', onMessage);
  }
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }
  function onMessage(e: MessageEvent): void {
    if (e.source === iframe.contentWindow && e.data?.source === 'accesspath-audit' && e.data?.type === 'close') close();
  }
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('message', onMessage);

  return { iframe, close };
}

function postToChild(win: Window, message: unknown): void {
  try {
    win.postMessage(message, '*');
  } catch {
    // Overlay was closed mid-scan, or postMessage otherwise failed — nothing to
    // recover, the scan still finishes and the caller still gets its ScanResult back.
  }
}

function waitForReady(win: Window, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== win || !e.data || e.data.source !== 'accesspath-audit' || e.data.type !== 'ready') return;
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      resolve(true);
    };
    window.addEventListener('message', onMessage);
    window.setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      resolve(false);
    }, timeoutMs);
  });
}

function escapeHtmlStatic(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The static HTML/CSS/JS shell — identical every time, contains no scan data at all.
 *  Everything scan-specific arrives later via postMessage and is rendered client-side
 *  by the inline script below (results are keyed by rule id, so a re-render never needs
 *  the server-side generation step to run again). Keeping this generation-time-static
 *  (rather than templating the whole result into the HTML string) is what makes the
 *  redirect-first flow possible: the tab has to exist and show a loading state *before*
 *  any result exists.
 *
 *  Layout modeled on a standard security/accessibility scanner report (score tiles +
 *  Issues/Passed tabs + filterable, expandable per-rule cards with WCAG tag chips) per
 *  explicit design reference, rather than the earlier Lighthouse-style layout. */
function buildReportShellHtml(meta: { pageTitle: string; pageUrl: string; brandColor?: string; heroImageUrl: string | null }): string {
  const brand = meta.brandColor ?? '#4928F3';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility Report — ${escapeHtmlStatic(meta.pageTitle)}</title>
<style>
${REPORT_CSS.replace('__BRAND__', brand)}
</style>
</head>
<body>
  <header class="topbar">
    <span class="brand-mark"><img src="${ACCESSPATH_LOGO_DATA_URI}" alt="" width="20" height="19"> AccessPath</span>
    <div class="topbar-actions">
      <button class="print-btn" id="pdf-btn" onclick="window.print()" hidden>Download as PDF</button>
      <button type="button" class="close-btn" id="close-btn" aria-label="Close report">&times;</button>
    </div>
  </header>

  <main class="wrap">
    <!-- Separate from the two visual-only progress labels below (which update on every
         rule, far too fast for a screen reader to usefully narrate) — this one only
         updates twice: scan start and scan complete. See setProgress()/renderResult().
         Lives outside both view containers so it survives the loading→results swap. -->
    <p id="sr-status" class="sr-only" role="status" aria-live="polite"></p>

    <div id="loading-view" class="loading-view">
      <div class="loading-card">
        <div class="loader-thumb" aria-hidden="true">
          ${meta.heroImageUrl ? `<img class="loader-thumb-img" src="${escapeHtmlStatic(meta.heroImageUrl)}" alt="" onerror="this.remove()">` : ''}
          <div class="loader-thumb-shimmer"></div>
          <div class="loader-thumb-badge">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 9h18"/></svg>
          </div>
        </div>
        <div class="loader-steps-viewport" aria-hidden="true">
          <ul class="loader-steps" id="loader-steps">
            <li class="loader-step loader-step-a">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              <span>Identifying issues affecting usability &amp; compliance</span>
            </li>
            <li class="loader-step loader-step-b">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>Evaluating potential business impact</span>
            </li>
            <li class="loader-step loader-step-c">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V4a1 1 0 0 1 1-1h3"/><path d="M17 3h3a1 1 0 0 1 1 1v3"/><path d="M21 17v3a1 1 0 0 1-1 1h-3"/><path d="M7 21H4a1 1 0 0 1-1-1v-3"/></svg>
              <span>Analyzing accessibility requirements</span>
            </li>
            <!-- Duplicate of the three items above so the marquee can scroll continuously
                 and reset exactly one set's height (102px) later without a visible jump —
                 see the loader-steps-scroll keyframes below. -->
            <li class="loader-step loader-step-a" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              <span>Identifying issues affecting usability &amp; compliance</span>
            </li>
            <li class="loader-step loader-step-b" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>Evaluating potential business impact</span>
            </li>
            <li class="loader-step loader-step-c" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V4a1 1 0 0 1 1-1h3"/><path d="M17 3h3a1 1 0 0 1 1 1v3"/><path d="M21 17v3a1 1 0 0 1-1 1h-3"/><path d="M7 21H4a1 1 0 0 1-1-1v-3"/></svg>
              <span>Analyzing accessibility requirements</span>
            </li>
          </ul>
        </div>
        <p class="loading-page">${escapeHtmlStatic(meta.pageUrl)}</p>
      </div>
    </div>

    <div id="results-view" class="results-view" hidden></div>
  </main>

<script>
(function () {
  var META_PAGE_URL = ${JSON.stringify(meta.pageUrl)};
  var META_HERO_IMAGE = ${JSON.stringify(meta.heroImageUrl)};
  var SCAN_STARTED_AT = Date.now();

  var IMPACT_LABEL = { critical: 'Critical', serious: 'Serious', moderate: 'Moderate', minor: 'Minor' };
  var IMPACT_COLOR = { critical: '#D92D20', serious: '#E8702A', moderate: '#C79000', minor: '#6F7580' };
  var CATEGORY_LABEL = {
    'names-labels': 'Names and Labels', navigation: 'Navigation', language: 'Language',
    aria: 'ARIA', contrast: 'Contrast', sizing: 'Sizing and Spacing', 'best-practices': 'Best Practices'
  };
  var CATEGORY_ORDER = ['contrast', 'names-labels', 'navigation', 'aria', 'language', 'sizing', 'best-practices'];
  var LEVEL_GROUP_ORDER = ['A', 'AA', 'AAA', 'best-practice'];
  var LEVEL_GROUP_LABEL = { A: 'WCAG Level A', AA: 'WCAG Level AA', AAA: 'WCAG Level AAA', 'best-practice': 'Best Practices (not scored)' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Wraps tag-like mentions (e.g. "the <meta http-equiv="refresh"> tag") inside
  // already-escaped prose (description/reason/fix text) in inline code styling, so
  // markup mentioned in running text reads as code instead of blending into the
  // paragraph. Operates only on text esc() has already escaped — matches whole
  // &lt;...&gt; spans, so it can't reintroduce real markup, only relocate already-safe
  // escaped text inside a hardcoded <code> wrapper.
  function codifyInline(escapedText) {
    return escapedText.replace(/&lt;.*?&gt;/g, function (m) { return '<code class="inline-code">' + m + '</code>'; });
  }

  // The step labels are a friendly narrative gloss on the scan, not per-rule detail
  // (the actual per-rule work is invisible to a visitor; see sr-status below for what
  // screen readers get instead), so they scroll on a continuous CSS marquee
  // (loader-steps-scroll, see CSS below) rather than being tied to real progress — each
  // label also brightens and grows via its own loader-step-pulse animation timed (via a
  // negative animation-delay per .loader-step-a/-b/-c) to peak exactly when that label
  // is passing through the viewport's vertical center, so the "current" label still
  // reads as highlighted even though the whole list is moving continuously, not jumping
  // between discrete positions. stopLoaderLoop() just pauses both once results are ready.
  function stopLoaderLoop() {
    document.getElementById('loader-steps').style.animationPlayState = 'paused';
    var steps = document.querySelectorAll('.loader-step');
    for (var i = 0; i < steps.length; i++) steps[i].style.animationPlayState = 'paused';
  }

  function setProgress(completed, total) {
    // Announce once, at the start, not on every rule — 44 rapid-fire live-region
    // updates would be unusable for a screen reader (each takes longer to speak than
    // the ~90ms between them). See renderResult() for the matching completion announcement.
    if (completed === 1) {
      document.getElementById('sr-status').textContent = 'Running accessibility audit on ' + META_PAGE_URL + '. This may take a few seconds.';
    }
  }


  function computeWcagLevel(checks) {
    var failsA = checks.some(function (c) { return c.status === 'fail' && c.level === 'A'; });
    var failsAA = checks.some(function (c) { return c.status === 'fail' && c.level === 'AA'; });
    var failsAAA = checks.some(function (c) { return c.status === 'fail' && c.level === 'AAA'; });
    if (failsA) return 'Fails A';
    if (failsAA) return 'A';
    if (failsAAA) return 'AA';
    return 'AAA';
  }

  function heroHeadline(score) {
    if (score >= 90) return 'Your website looks great';
    if (score >= 50) return 'Your website has some accessibility gaps';
    return 'Your website needs accessibility work';
  }

  var PROFILE_LABEL = {
    'low-vision': 'Low Vision', dyslexia: 'Dyslexia', seizure: 'Seizure Safe',
    motor: 'Motor Impaired', colorblind: 'Color Blind', adhd: 'ADHD'
  };
  // Same path data as PROFILE_ICON_MARKUP in icons.ts — kept as literal strings here
  // since this script runs inside a generated static document, not through the
  // widget's own DOM-building code, but the glyphs stay visually identical to the
  // profile pills in the panel itself. Dyslexia uses the same "Df" text glyph the
  // panel uses (dyslexiaGlyph() in panel-dom.ts) rather than an svg.
  var PROFILE_ICON_PATH = {
    'low-vision': '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    seizure: '<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/>',
    motor: '<circle cx="18" cy="4" r="2" fill="currentColor" stroke="none"/><path d="m17.836 12.014-4.345.725 3.29-4.113a1 1 0 0 0-.227-1.457l-6-4a.999.999 0 0 0-1.262.125l-4 4 1.414 1.414 3.42-3.42 2.584 1.723-2.681 3.352a5.913 5.913 0 0 0-5.5.752l1.451 1.451A3.972 3.972 0 0 1 8 12c2.206 0 4 1.794 4 4 0 .739-.216 1.425-.566 2.02l1.451 1.451A5.961 5.961 0 0 0 14 16c0-.445-.053-.878-.145-1.295L17 14.181V20h2v-7a.998.998 0 0 0-1.164-.986zM8 20c-2.206 0-4-1.794-4-4 0-.739.216-1.425.566-2.02l-1.451-1.451A5.961 5.961 0 0 0 2 16c0 3.309 2.691 6 6 6 1.294 0 2.49-.416 3.471-1.115l-1.451-1.451A3.972 3.972 0 0 1 8 20z" fill="currentColor" stroke="none"/>',
    colorblind: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/><line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" stroke-width="1.8"/>',
    adhd: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'
  };

  function profileIconSvg(key) {
    if (key === 'dyslexia') return '<span class="profile-df" aria-hidden="true">Df</span>';
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + PROFILE_ICON_PATH[key] + '</svg>';
  }

  // Level badge and profile icons are informational text/labels, not controls — no
  // tabindex. They previously had tabindex="0" while sitting inside the row's own
  // <button>, which is exactly the nested-interactive-elements problem this scanner's
  // own "nested-interactive" rule flags; role="img" + aria-label makes the profile
  // icons' meaning available to assistive tech without needing focus at all (the
  // hover tooltip remains a mouse-only convenience layered on top, not the only way
  // to get the information).
  function levelBadgeHtml(check) {
    var isBestPractice = check.tags.indexOf('best-practice') !== -1;
    var label = isBestPractice ? 'Best Practice' : check.level;
    var tooltip = isBestPractice ? 'Best Practice (not scored)' : 'WCAG Level ' + check.level;
    return '<span class="level-badge" data-tooltip="' + esc(tooltip) + '" aria-label="' + esc(tooltip) + '">' + esc(label) + '</span>';
  }

  function profileIconsHtml(check) {
    if (!check.profiles || check.profiles.length === 0) return '';
    return check.profiles.map(function (key) {
      return '<span class="profile-icon" role="img" data-tooltip="' + esc(PROFILE_LABEL[key]) + '" aria-label="Relevant to the ' + esc(PROFILE_LABEL[key]) + ' profile">' + profileIconSvg(key) + '</span>';
    }).join('');
  }

  function impactedProfilesBlock(check) {
    if (!check.profiles || check.profiles.length === 0) {
      return '<div class="profile-block"><p class="profile-block-title">Impacted AccessPath Profiles</p>' +
        '<p class="side-block-empty">None — this is a code-level fix; no AccessPath profile mitigates it.</p></div>';
    }
    var rows = check.profiles.map(function (key) {
      return '<li>' + profileIconSvg(key) + '<span>' + esc(PROFILE_LABEL[key]) + '</span></li>';
    }).join('');
    return '<div class="profile-block"><p class="profile-block-title">Impacted AccessPath Profiles</p><ul class="profile-list">' + rows + '</ul></div>';
  }

  function statusExplanation(check) {
    if (check.status === 'fail') {
      return '<p class="side-block-title">' + IMPACT_LABEL[check.impact] + '</p><p class="side-block-body">' + check.nodes.length + ' element' + (check.nodes.length === 1 ? '' : 's') + ' on this page fail this check.</p>';
    }
    if (check.status === 'incomplete') {
      return '<p class="side-block-title">Needs Manual Review</p><p class="side-block-body">' + check.nodes.length + ' element' + (check.nodes.length === 1 ? '' : 's') + ' on this page could not be automatically evaluated for this check — see below.</p>';
    }
    if (check.status === 'pass') {
      return '<p class="side-block-title">Passed</p><p class="side-block-body">' + codifyInline(esc(check.reason)) + '</p>';
    }
    return '<p class="side-block-title">Not Applicable</p><p class="side-block-body">' + codifyInline(esc(check.reason)) + '</p>';
  }

  function learnMoreLink(check) {
    if (check.tags.indexOf('best-practice') !== -1 && check.tags.length === 1) return '';
    var url = 'https://www.w3.org/WAI/WCAG22/quickref/?levels=' + (check.level || 'a').toLowerCase();
    return '<a class="learn-more" href="' + url + '" target="_blank" rel="noopener noreferrer">Learn more about this issue &#8599;</a>';
  }

  // Minimal HTML syntax highlighting for the affected-element code snippets — operates
  // on already-escaped text (esc() has already turned every real < > " into an entity),
  // so this only ever relocates already-safe substrings inside hardcoded <span> wrappers;
  // it can't reintroduce markup from the scanned page's content.
  function highlightHtml(escapedHtml) {
    return escapedHtml
      .replace(/(&lt;[/]?)([a-zA-Z0-9-]+)/g, '$1<span class="code-tag">$2</span>')
      .replace(/([a-zA-Z-]+)(=)(&quot;[^&]*&quot;)/g, '<span class="code-attr">$1</span>$2<span class="code-val">$3</span>');
  }

  function affectedElementsHtml(check) {
    var nodes = check.nodes;
    var isIncomplete = check.status === 'incomplete';
    var visible = nodes.slice(0, 5);
    var rest = nodes.slice(5);
    var listLabel = isIncomplete ? 'Elements Needing Manual Review' : 'Affected Elements';
    var noteLabel = isIncomplete ? 'Check:' : 'Fix:';
    var html = '<p class="affected-hdr">' + listLabel + ' (' + nodes.length + '):</p><ol class="affected-list">';
    function row(node) {
      return '<li><div class="affected-code"><code>' + highlightHtml(esc(node.html)) + '</code></div>' +
        '<div class="affected-selector">' + esc(node.target) + '</div>' +
        '<div class="affected-fix"><em>' + noteLabel + '</em> ' + codifyInline(esc(node.fix)) + '</div></li>';
    }
    for (var i = 0; i < visible.length; i++) html += row(visible[i]);
    html += '</ol>';
    if (rest.length > 0) {
      html += '<button type="button" class="show-all-btn" data-rule="' + esc(check.id) + '">Show all ' + nodes.length + ' elements</button>';
      html += '<ol class="affected-list affected-list-rest" id="rest-' + esc(check.id) + '" hidden start="6">';
      for (var j = 0; j < rest.length; j++) html += row(rest[j]);
      html += '</ol>';
    }
    return html;
  }

  function statusIconSvg(status) {
    if (status === 'fail') return '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" fill="#D92D20"/><path d="m8.5 8.5 7 7m0-7-7 7" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';
    if (status === 'incomplete') return '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" fill="#C79000"/><path d="M12 7v6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1" fill="#fff" stroke="none"/></svg>';
    if (status === 'pass') return '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" fill="#15803D"/><path d="m7 12.5 3 3 7-7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" fill="none" stroke="#6F7580" stroke-width="2"/><line x1="8" y1="12" x2="16" y2="12" stroke="#6F7580" stroke-width="2"/></svg>';
  }

  var rowIdSeq = 0;

  function checkRow(check) {
    var right = check.status === 'fail'
      ? '<span class="row-count row-count-fail">' + check.nodes.length + ' issue' + (check.nodes.length === 1 ? '' : 's') + '</span>'
      : check.status === 'incomplete'
        ? '<span class="row-count row-count-incomplete">' + check.nodes.length + ' to review</span>'
        : check.status === 'pass'
          ? '<span class="row-count row-count-pass">&#10003; ' + check.checkedCount + ' checked</span>'
          : '<span class="row-count row-count-na">Not applicable</span>';

    // Two-column detail: Requirement (left) mirrors the "What to check" copy, status +
    // Impacted AccessPath Profiles (right, tinted by status so pass/fail/n-a is visible
    // at a glance rather than every box using the same flat color) — then affected
    // elements (fail only) full-width below, since that list can run long.
    var body = '<div class="detail-grid">' +
      '<div class="side-block side-block-requirement"><p class="side-block-title">Requirement</p><p class="side-block-body">' + codifyInline(esc(check.description)) + '</p>' + learnMoreLink(check) + '</div>' +
      '<div class="side-block side-block-status side-block-status-' + check.status + '">' + statusExplanation(check) +
      '<hr class="side-divider">' + impactedProfilesBlock(check) + '</div>' +
      '</div>';
    if (check.status === 'fail' || check.status === 'incomplete') body += affectedElementsHtml(check);
    // The readable citation (e.g. "WCAG 2.1 — 2.2.2 Pause, Stop, Hide"), not the raw
    // machine tags (wcag2a/wcag222) — those exist for tooling/filtering, not for a
    // visitor reading the report to make sense of.
    body += '<p class="wcag-citation">' + esc(check.wcag) + '</p>';

    var bodyId = 'row-body-' + (++rowIdSeq);
    return '<div class="check-row" data-status="' + check.status + '" data-impact="' + check.impact + '" data-issue-count="' + check.nodes.length + '">' +
      '<button type="button" class="row-hdr" aria-expanded="false" aria-controls="' + bodyId + '">' +
      '<span class="row-icon" aria-hidden="true">' + statusIconSvg(check.status) + '</span>' +
      '<span class="row-title">' + esc(check.help) + '</span>' +
      '<span class="row-badges">' +
      levelBadgeHtml(check) +
      profileIconsHtml(check) +
      '</span>' +
      right +
      '<span class="row-chevron" aria-hidden="true">&#9662;</span>' +
      '</button>' +
      '<div class="row-body" id="' + bodyId + '" hidden>' + body + '</div>' +
      '</div>';
  }

  function categoryScoreBadge(checks) {
    // Incomplete checks are excluded the same as not-applicable — the automated scan
    // genuinely doesn't know pass/fail for them, so they shouldn't silently drag the
    // score down (or up); they're surfaced separately as their own needs-review count.
    var scoreable = checks.filter(function (c) { return c.status !== 'not-applicable' && c.status !== 'incomplete' && c.tags.indexOf('best-practice') === -1; });
    if (scoreable.length === 0) return '<span class="cat-score cat-score-neutral">Neutral</span>';
    var pass = scoreable.filter(function (c) { return c.status === 'pass'; }).length;
    var score = Math.round((pass / scoreable.length) * 100);
    var cls = score >= 90 ? 'cat-score-good' : score >= 50 ? 'cat-score-mid' : 'cat-score-bad';
    return '<span class="cat-score ' + cls + '">Score ' + score + '%</span>';
  }

  function categorySection(category, checks) {
    var html = '<div class="cat-card" data-category="' + category + '">' +
      '<div class="cat-hdr"><h2 class="cat-name">' + CATEGORY_LABEL[category] + '</h2>' + categoryScoreBadge(checks) + '</div>';

    for (var li = 0; li < LEVEL_GROUP_ORDER.length; li++) {
      var levelKey = LEVEL_GROUP_ORDER[li];
      var groupChecks = checks.filter(function (c) {
        var isBestPractice = c.tags.indexOf('best-practice') !== -1;
        return levelKey === 'best-practice' ? isBestPractice : !isBestPractice && c.level === levelKey;
      });
      if (groupChecks.length === 0) continue;
      html += '<div class="level-group" data-level-group="' + levelKey + '">' +
        '<div class="level-hdr">' + LEVEL_GROUP_LABEL[levelKey] + '</div>';
      for (var ci = 0; ci < groupChecks.length; ci++) html += checkRow(groupChecks[ci]);
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function attachInteractivity(root) {
    var headers = root.querySelectorAll('.row-hdr');
    for (var i = 0; i < headers.length; i++) {
      headers[i].addEventListener('click', function () {
        var body = this.parentElement.querySelector('.row-body');
        var open = !body.hidden;
        body.hidden = open;
        this.setAttribute('aria-expanded', String(!open));
        this.querySelector('.row-chevron').style.transform = open ? '' : 'rotate(180deg)';
      });
    }
    var showAllBtns = root.querySelectorAll('.show-all-btn');
    for (var j = 0; j < showAllBtns.length; j++) {
      showAllBtns[j].addEventListener('click', function () {
        var rest = document.getElementById('rest-' + this.getAttribute('data-rule'));
        rest.hidden = false;
        this.hidden = true;
      });
    }
  }

  function applyFilters() {
    var statusVal = document.getElementById('filter-status').value;
    var impactVal = document.getElementById('filter-impact').value;
    var visibleRules = 0, visibleIssues = 0;
    var catSections = document.querySelectorAll('.cat-card');
    for (var ci = 0; ci < catSections.length; ci++) {
      var cat = catSections[ci];
      var catHasVisible = false;
      var levelGroups = cat.querySelectorAll('.level-group');
      for (var lgi = 0; lgi < levelGroups.length; lgi++) {
        var lg = levelGroups[lgi];
        var rows = lg.querySelectorAll('.check-row');
        var groupHasVisible = false;
        for (var ri = 0; ri < rows.length; ri++) {
          var row = rows[ri];
          var statusMatch = statusVal === 'all' || row.getAttribute('data-status') === statusVal;
          var impactMatch = impactVal === 'all' || row.getAttribute('data-impact') === impactVal;
          var show = statusMatch && impactMatch;
          row.hidden = !show;
          if (show) {
            groupHasVisible = true;
            catHasVisible = true;
            visibleRules++;
            visibleIssues += parseInt(row.getAttribute('data-issue-count'), 10) || 0;
          }
        }
        lg.hidden = !groupHasVisible;
      }
      cat.hidden = !catHasVisible;
    }
    document.getElementById('filter-summary').textContent = 'Showing ' + visibleRules + ' check' + (visibleRules === 1 ? '' : 's') + ' (' + visibleIssues + ' affected elements)';
  }

  function renderResult(result) {
    stopLoaderLoop();
    document.getElementById('loading-view').hidden = true;
    var view = document.getElementById('results-view');
    view.hidden = false;
    document.getElementById('pdf-btn').hidden = false;

    var totalRules = result.failCount + result.passCount;
    var score = totalRules > 0 ? Math.round((result.passCount / totalRules) * 100) : 100;
    document.getElementById('sr-status').textContent =
      'Scan complete. ' + result.failCount + ' of ' + totalRules + ' checks failed. Accessibility score ' + score + ' out of 100.' +
      (result.incompleteCount ? ' ' + result.incompleteCount + ' additional check' + (result.incompleteCount === 1 ? '' : 's') + ' need manual review.' : '');
    var scanMs = Date.now() - SCAN_STARTED_AT;
    var hostname = META_PAGE_URL;
    try { hostname = new URL(META_PAGE_URL).hostname; } catch (e) {}

    var failed = result.checks.filter(function (c) { return c.status === 'fail'; });
    var totalAffected = failed.reduce(function (sum, c) { return sum + c.nodes.length; }, 0);
    var errorCount = failed.filter(function (c) { return c.level !== 'AAA' && c.tags.indexOf('best-practice') === -1; }).length;
    var warningCount = failed.filter(function (c) { return c.level === 'AAA'; }).length;
    var noticeCount = failed.filter(function (c) { return c.level !== 'AAA' && c.tags.indexOf('best-practice') !== -1; }).length;

    var wcagLevel = computeWcagLevel(result.checks);

    var html = '';
    var isGood = score >= 90;

    html += '<div class="hero-card">' +
      '<div class="hero-banner">' +
      (META_HERO_IMAGE ? '<img class="hero-banner-img" src="' + esc(META_HERO_IMAGE) + '" alt="" onerror="this.remove()">' : '') +
      '<div class="hero-banner-fade"></div>' +
      '</div>' +
      '<div class="hero-body">' +
      '<div class="hero-icon-badge ' + (isGood ? 'badge-good' : 'badge-bad') + '">' +
      (isGood
        ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>'
        : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 7v6"/><line x1="12" y1="17" x2="12" y2="17"/></svg>') +
      '</div>' +
      '<p class="hero-label">Scan results for <strong>' + esc(hostname) + '</strong></p>' +
      '<h1 class="hero-heading">' + heroHeadline(score) + '</h1>' +
      '<div class="hero-pill">' + result.passCount + ' of ' + totalRules + ' applicable checks passed' + (result.notApplicableCount ? ' &middot; ' + result.notApplicableCount + ' not applicable' : '') + (result.incompleteCount ? ' &middot; ' + result.incompleteCount + ' need review' : '') + '</div>' +
      '<div class="hero-stats">' +
      '<div class="hero-stat"><span class="hero-stat-label">WCAG Level</span><strong>' + esc(wcagLevel) + '</strong></div>' +
      '<div class="hero-stat"><span class="hero-stat-label">Tests Passed</span><strong>' + result.passCount + '/' + totalRules + '</strong></div>' +
      // "Applicable" checks (pass+fail) undercounts what the scanner actually ran —
      // not-applicable and needs-review checks are real work too, just not
      // scoreable — so this total is checks.length (every rule that ran), not
      // totalRules, to make "how many checks does this scanner even have" legible
      // at a glance instead of only inferable by adding up three other numbers.
      '<div class="hero-stat"><span class="hero-stat-label">Checks Run</span><strong>' + result.checks.length + '</strong></div>' +
      '<div class="hero-stat"><span class="hero-stat-label">Scan Time</span><strong>' + scanMs + 'ms</strong></div>' +
      '</div>' +
      '</div></div>';

    var errorGlyph = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="m7 7 10 10m0-10L7 17"/></svg>';
    var warningGlyph = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3 20h18L12 4z"/><path d="M12 10.5v4"/><line x1="12" y1="17" x2="12" y2="17"/></svg>';
    var noticeGlyph = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><line x1="12" y1="8" x2="12" y2="8"/></svg>';
    var reviewGlyph = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M12 7v6"/><line x1="12" y1="16.5" x2="12" y2="16.5"/></svg>';

    html += '<div class="issue-cards-row">' +
      '<div class="issue-card"><div class="issue-card-icon icon-error">' + errorGlyph + '</div>' +
      '<p class="issue-card-title">' + errorCount + ' Error' + (errorCount === 1 ? '' : 's') + '</p>' +
      '<p class="issue-card-desc">Critical WCAG A/AA failures that block access for assistive-tech users.</p></div>' +
      '<div class="issue-card"><div class="issue-card-icon icon-warning">' + warningGlyph + '</div>' +
      '<p class="issue-card-title">' + warningCount + ' Warning' + (warningCount === 1 ? '' : 's') + '</p>' +
      '<p class="issue-card-desc">WCAG AAA failures — stricter checks beyond the standard compliance bar.</p></div>' +
      '<div class="issue-card"><div class="issue-card-icon icon-notice">' + noticeGlyph + '</div>' +
      '<p class="issue-card-title">' + noticeCount + ' Notice' + (noticeCount === 1 ? '' : 's') + '</p>' +
      '<p class="issue-card-desc">Best-practice gaps that aren’t scored but are worth fixing.</p></div>' +
      '<div class="issue-card"><div class="issue-card-icon icon-review">' + reviewGlyph + '</div>' +
      '<p class="issue-card-title">' + result.incompleteCount + ' Need' + (result.incompleteCount === 1 ? 's' : '') + ' Review</p>' +
      '<p class="issue-card-desc">Elements an automated scan can’t reliably judge (e.g. text over a background image) — check these by hand.</p></div>' +
      '</div>';

    html += '<div class="filter-row">' +
      '<label class="sr-only" for="filter-status">Filter by status</label>' +
      '<select id="filter-status"><option value="all">All Statuses</option><option value="fail">Failed</option><option value="incomplete">Needs Review</option><option value="pass">Passed</option><option value="not-applicable">Not Applicable</option></select>' +
      '<label class="sr-only" for="filter-impact">Filter by impact level</label>' +
      '<select id="filter-impact"><option value="all">All Impact Levels</option><option value="critical">Critical</option><option value="serious">Serious</option><option value="moderate">Moderate</option><option value="minor">Minor</option></select>' +
      '<span class="filter-summary" id="filter-summary">Showing ' + totalRules + ' check' + (totalRules === 1 ? '' : 's') + ' (' + totalAffected + ' affected elements)</span>' +
      '</div>';

    html += '<div id="cat-list">';
    for (var oi = 0; oi < CATEGORY_ORDER.length; oi++) {
      var cat = CATEGORY_ORDER[oi];
      var catChecks = result.checks.filter(function (c) { return c.category === cat; });
      if (catChecks.length === 0) continue;
      html += categorySection(cat, catChecks);
    }
    html += '</div>';

    var disclaimer = '<p class="disclaimer">This is an automated scan &mdash; it catches roughly 30&ndash;50% of WCAG issues by ' +
      'industry consensus (the same limit every automated tool, including axe-core, WAVE and Lighthouse, states about ' +
      'itself). A passing scan is not a WCAG conformance certification; issues like alt-text quality, reading level, or ' +
      'keyboard-trap behavior need a human reviewer. See <a href="https://www.w3.org/WAI/test-evaluate/" target="_blank" rel="noopener noreferrer">W3C\\'s guide to manual accessibility evaluation</a> for what to check next.</p>';

    var footer = '<footer>&copy; ' + new Date().getFullYear() + ' AccessPath. Free, open-source, self-hosted. Built for WCAG compliance.</footer>';

    view.innerHTML = html + disclaimer + footer;

    attachInteractivity(view);
    document.getElementById('filter-status').addEventListener('change', applyFilters);
    document.getElementById('filter-impact').addEventListener('change', applyFilters);
  }

  window.addEventListener('message', function (e) {
    if (!e.data || e.data.source !== 'accesspath-audit') return;
    if (e.data.type === 'progress') setProgress(e.data.completed, e.data.total);
    if (e.data.type === 'result') renderResult(e.data.result);
  });

  function requestClose() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: 'accesspath-audit', type: 'close' }, '*');
    }
  }
  document.getElementById('close-btn').addEventListener('click', requestClose);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') requestClose();
  });

  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ source: 'accesspath-audit', type: 'ready' }, '*');
  }
})();
</script>
</body>
</html>`;
}

const REPORT_CSS = `
  :root {
    --brand: __BRAND__;
    /* AccessPath brand tokens (docs/brand.md) — same palette the widget panel and
       public site use, so the report reads as part of the product, not a bolt-on. */
    --ap-ink: #040D29;
    --ap-ink-secondary: #3C4255;
    --ap-text-muted: #6F7580;
    --ap-canvas: #FDFDFD;
    --ap-surface: #FFFFFF;
    --ap-surface-soft: #F4F1F9;
    --ap-violet-soft: #F0EDFF;
    --ap-violet-glow: #E5DCF9;
    --ap-border: #E8E7ED;
    --ap-border-strong: #D8D7E2;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font-family: Geist, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--ap-canvas);
    color: var(--ap-ink);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .topbar {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 16px 24px; border-bottom: 1px solid var(--ap-border);
    position: sticky; top: 0; background: var(--ap-surface); z-index: 1;
  }
  .topbar-actions { display: flex; align-items: center; gap: 10px; }
  .close-btn {
    width: 34px; height: 34px; border-radius: 999px; border: 1px solid var(--ap-border);
    background: var(--ap-surface); color: var(--ap-text-muted); font-size: 1.125rem; line-height: 1;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background-color 0.15s, color 0.15s;
  }
  .close-btn:hover { background: var(--ap-surface-soft); color: var(--ap-ink); }
  .brand-mark { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.9375rem; color: var(--ap-ink); }
  .brand-mark img { display: block; border-radius: 5px; }
  .print-btn {
    background: var(--brand); color: #fff; border: none; border-radius: 10px;
    padding: 10px 18px; font-size: 0.875rem; font-weight: 600; cursor: pointer;
    font-family: inherit; transition: opacity 0.2s;
  }
  .print-btn:hover { opacity: 0.9; }
  .wrap { max-width: 920px; margin: 0 auto; padding: 24px 20px 80px; }

  .loading-view { display: none; align-items: center; justify-content: center; min-height: 70vh; padding: 40px 20px; }
  .loading-view:not([hidden]) { display: flex; }
  .loading-card {
    display: flex; flex-direction: column; align-items: center; text-align: center;
    max-width: 440px; width: 100%;
  }
  .loader-thumb {
    position: relative; width: 100%; max-width: 260px; aspect-ratio: 16 / 10;
    border-radius: 14px; overflow: hidden; margin-bottom: 28px;
    background: linear-gradient(135deg, var(--ap-violet-soft), var(--ap-surface-soft));
  }
  .loader-thumb-img {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
    filter: saturate(0.9);
  }
  .loader-thumb-shimmer {
    position: absolute; inset: 0;
    background: linear-gradient(115deg, transparent 20%, var(--ap-violet-glow) 45%, transparent 70%);
    background-size: 250% 100%;
    animation: loader-shimmer-sweep 2.2s ease-in-out infinite;
  }
  .loader-thumb-img + .loader-thumb-shimmer {
    background: linear-gradient(115deg, transparent 20%, rgba(255, 255, 255, 0.55) 45%, transparent 70%);
    mix-blend-mode: overlay;
  }
  @keyframes loader-shimmer-sweep {
    0% { background-position: 120% 0; }
    100% { background-position: -50% 0; }
  }
  .loader-thumb-badge {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 9px; background: var(--brand);
    box-shadow: 0 6px 16px rgba(73, 40, 243, 0.35);
    animation: loader-badge-breathe 2.2s ease-in-out infinite;
  }
  @keyframes loader-badge-breathe {
    0%, 100% { transform: translate(-50%, -50%) scale(1); }
    50% { transform: translate(-50%, -50%) scale(1.08); }
  }

  .loader-steps-viewport {
    height: 102px; width: 100%; overflow: hidden; margin-bottom: 22px;
    -webkit-mask-image: linear-gradient(to bottom, transparent, black 34%, black 66%, transparent);
    mask-image: linear-gradient(to bottom, transparent, black 34%, black 66%, transparent);
  }
  /* A hold-then-glide step motion, not a constant-speed ticker: the list dwells on each
     centered label for ~1.3s, then eases smoothly to the next one — three stops per
     6s cycle (translateY 0 / -34px / -68px), landing on -102px exactly one duplicated
     set below its start so the reset is invisible and the loop never visibly jumps.
     ease-in-out on an animation with unmoving keyframe pairs (0%→22%, 33%→55%, etc.)
     only affects the glide segments in between, which is what gives each stop its
     settle-in/settle-out feel instead of the whole thing sliding at one flat speed. */
  .loader-steps {
    display: flex; flex-direction: column;
    list-style: none; margin: 0; padding: 0; width: 100%;
    animation: loader-steps-scroll 6s ease-in-out infinite;
  }
  @keyframes loader-steps-scroll {
    0%, 22% { transform: translateY(0); }
    33%, 55% { transform: translateY(-34px); }
    67%, 89% { transform: translateY(-68px); }
    100% { transform: translateY(-102px); }
  }
  /* Each label brightens/grows to full strength for exactly its own hold window and
     fades for the other two — phase-shifted via animation-delay (0s / -2s / -4s, one
     per 2s segment of the 6s cycle above) so the currently-centered label is the one
     that's visibly "active", the way the old discrete step version highlighted one
     row at a time, but arrived at smoothly instead of snapping. */
  .loader-step {
    display: flex; align-items: center; justify-content: center; gap: 9px; height: 34px;
    color: var(--ap-text-muted); font-size: 0.875rem; font-weight: 500;
    opacity: 0.4; transform: scale(0.94);
    animation: loader-step-pulse 6s ease-in-out infinite;
  }
  @keyframes loader-step-pulse {
    0%, 22% { opacity: 1; color: var(--ap-ink); transform: scale(1); }
    33%, 89% { opacity: 0.4; color: var(--ap-text-muted); transform: scale(0.94); }
    100% { opacity: 1; color: var(--ap-ink); transform: scale(1); }
  }
  .loader-step-b { animation-delay: 0s; }
  .loader-step-c { animation-delay: -4s; }
  .loader-step-a { animation-delay: -2s; }

  .loading-page { color: var(--ap-text-muted); font-size: 0.8125rem; margin-top: 4px; word-break: break-all; }

  .hero-card {
    position: relative; overflow: hidden;
    background: var(--ap-surface); border: 1px solid var(--ap-border); border-radius: 18px;
    margin-bottom: 16px;
  }
  .hero-banner {
    position: relative; height: 108px;
    background: linear-gradient(135deg, var(--ap-violet-soft), var(--ap-surface-soft));
  }
  .hero-banner-img {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
    filter: saturate(0.95);
  }
  .hero-banner-fade {
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.04) 0%, var(--ap-surface) 96%);
  }
  .hero-body { position: relative; padding: 0 28px 28px; }
  .hero-icon-badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 44px; height: 44px; border-radius: 50%; margin-top: -22px; margin-bottom: 14px;
    box-shadow: 0 0 0 4px var(--ap-surface);
  }
  .badge-good { background: #15803D; }
  .badge-bad { background: #D92D20; }
  .hero-label { font-size: 0.8125rem; color: var(--ap-text-muted); margin: 0 0 4px; }
  .hero-heading { font-size: 1.5rem; margin: 0 0 14px; color: var(--ap-ink); }
  .hero-pill {
    display: inline-flex; align-items: center;
    background: var(--ap-surface-soft); border-radius: 999px;
    padding: 7px 16px; font-size: 0.8125rem; font-weight: 600; color: var(--ap-ink-secondary);
  }
  .hero-stats {
    display: flex; flex-wrap: wrap; gap: 18px 28px;
    margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--ap-border);
  }
  .hero-stat { display: flex; flex-direction: column; gap: 3px; font-size: 0.8125rem; }
  .hero-stat-label {
    font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--ap-text-muted);
  }
  .hero-stat strong { color: var(--ap-ink); font-weight: 600; }

  .issue-cards-row {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px;
  }
  .issue-card {
    background: var(--ap-surface); border: 1px solid var(--ap-border); border-radius: 14px; padding: 18px 20px;
  }
  .issue-card-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 50%; margin-bottom: 10px;
  }
  .icon-error { background: #D92D20; }
  .icon-warning { background: #C79000; }
  .icon-notice { background: #2563EB; }
  .icon-review { background: #92600A; }
  .issue-card-title { font-size: 1rem; font-weight: 700; color: var(--ap-ink); margin: 0 0 4px; }
  .issue-card-desc { font-size: 0.8125rem; color: var(--ap-text-muted); margin: 0; line-height: 1.45; }


  .filter-row {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    background: var(--ap-surface); border: 1px solid var(--ap-border); border-radius: 12px; padding: 12px 16px; margin-bottom: 16px;
  }
  .filter-row select {
    font-family: inherit; font-size: 0.8125rem; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--ap-border); background: var(--ap-surface); color: var(--ap-ink-secondary);
  }
  .filter-summary { margin-left: auto; font-size: 0.8125rem; color: var(--ap-text-muted); }

  /* Each category is its own separate card — clear visual divide from the next,
     matching a standard scanner-report layout rather than one continuous flowing list. */
  .cat-card {
    background: var(--ap-surface); border: 1px solid var(--ap-border); border-radius: 16px;
    padding: 24px 26px; margin-bottom: 22px; box-shadow: 0 4px 20px rgba(4, 13, 41, 0.045);
  }
  .cat-hdr {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding-bottom: 16px; margin-bottom: 8px; border-bottom: 1px solid var(--ap-border);
  }
  .cat-name { font-size: 1rem; font-weight: 700; color: var(--ap-ink); }
  .cat-score { font-size: 0.8125rem; font-weight: 700; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.03em; }
  .cat-score-good { background: #DCFCE7; color: #15803D; }
  .cat-score-mid { background: #FEFBEB; color: #92600A; }
  .cat-score-bad { background: #FEF2F1; color: #D92D20; }
  .cat-score-neutral { background: var(--ap-surface-soft); color: var(--ap-text-muted); }

  .level-group { margin-bottom: 8px; }
  .level-hdr { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ap-text-muted); padding: 14px 2px 8px; }
  .level-group:first-child .level-hdr { padding-top: 0; }

  .check-row { background: var(--ap-surface); border: 1px solid var(--ap-border); border-radius: 10px; margin-bottom: 8px; overflow: visible; }
  .row-hdr {
    width: 100%; display: flex; align-items: center; gap: 12px; padding: 14px 16px;
    background: none; border: none; cursor: pointer; text-align: left; font-family: inherit;
  }
  .row-icon { flex-shrink: 0; display: flex; }
  .row-title { flex: 1; font-size: 1rem; font-weight: 500; color: var(--ap-ink); min-width: 0; }
  .row-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .impact-badge {
    color: #fff; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.03em; padding: 2px 7px; border-radius: 999px; flex-shrink: 0;
  }
  .row-count { flex-shrink: 0; font-size: 0.8125rem; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
  .row-count-fail { color: #D92D20; background: #FEF2F1; }
  .row-count-incomplete { color: #92600A; background: #FEFBEB; }
  .row-count-pass { color: #15803D; background: #F0FDF4; }
  .row-count-na { color: var(--ap-text-muted); background: var(--ap-surface-soft); }
  .row-chevron { flex-shrink: 0; color: var(--ap-text-muted); transition: transform 0.15s; }
  .row-body { padding: 4px 16px 20px 42px; }

  /* Screen-reader-only utility — visually hidden but still announced/focusable. */
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }

  /* Visible, high-contrast focus ring on every interactive element — deliberately not
     left to the browser default, since this scanner's own "focus-outline-removed" rule
     exists precisely because that default is easy to lose track of. */
  button:focus-visible, select:focus-visible, a:focus-visible {
    outline: 2px solid var(--brand); outline-offset: 2px; border-radius: 4px;
  }

  /* Level badge + profile icons — informational labels, not controls (no tabindex; see
     levelBadgeHtml()/profileIconsHtml() above for why). Hover tooltip is a mouse-only
     bonus layered on top of the aria-label, not the only way to get the information.
     flex: 0 0 <size> (not just width/height) is what actually keeps these a fixed
     square — a flex item's default min-width:auto otherwise lets content (the "Df"
     text glyph in particular) grow the box past its set width regardless of what
     width/height say, which is why they rendered as mismatched sizes before. */
  .level-badge {
    display: inline-flex; align-items: center; justify-content: center;
    flex: 0 0 auto; height: 22px; min-width: 22px; padding: 0 5px; border-radius: 6px;
    border: 1px solid var(--ap-border); background: var(--ap-surface);
    font-size: 0.75rem; font-weight: 700; color: var(--ap-ink-secondary);
    box-sizing: border-box;
  }
  .profile-icon {
    display: inline-flex; align-items: center; justify-content: center;
    flex: 0 0 22px; width: 22px; height: 22px; border-radius: 6px;
    border: 1px solid var(--ap-border); background: var(--ap-surface); color: var(--ap-text-muted);
    box-sizing: border-box;
    /* No overflow:hidden here (deliberately removed) — this element is also the
       [data-tooltip] anchor, and its ::after tooltip bubble is absolutely positioned
       *outside* this box (bottom: calc(100% + 7px), above the icon). overflow:hidden
       on the same element that hosts an escaping absolutely-positioned pseudo-element
       clips that pseudo-element too, even though it's position: absolute — this is
       exactly what silently ate the profile-icon tooltip (level-badge never had this
       property and its tooltip always worked). The 14x14 icon SVGs are already sized
       well within this 22x22 box via icons.ts/profileIconSvg(), so nothing here
       actually needs clipping. */
  }
  .profile-df { font-size: 0.75rem; font-weight: 700; line-height: 1; }
  [data-tooltip] { position: relative; }
  [data-tooltip]:hover::after {
    content: attr(data-tooltip);
    position: absolute; bottom: calc(100% + 7px); left: 50%; transform: translateX(-50%);
    background: var(--ap-ink); color: #fff; font-size: 0.75rem; font-weight: 600;
    padding: 5px 9px; border-radius: 7px; white-space: nowrap; z-index: 20; pointer-events: none;
  }
  [data-tooltip]:hover::before {
    content: ''; position: absolute; bottom: calc(100% + 2px); left: 50%; transform: translateX(-50%);
    border: 5px solid transparent; border-top-color: var(--ap-ink); z-index: 20; pointer-events: none;
  }

  .wcag-citation { font-size: 0.75rem; font-weight: 600; color: var(--ap-text-muted); margin: 16px 0 0; }

  /* Two-column expanded detail: Requirement (left, neutral card with a violet accent
     bar — no surrounding border, just background + the accent, so it doesn't compete
     visually with the status box) / status + Impacted Profiles (right, tinted to match
     the row's own status color so pass/fail/n-a is legible without re-reading text). */
  .detail-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 18px; margin-bottom: 16px; }
  /* Plain white on both sides, no tinted fill and no accent bar — color lives only in
     the title text and the badges/chips elsewhere in the row, not in big background
     washes that made every expanded row look like a wall of color. */
  .side-block { border-radius: 10px; padding: 16px 18px; background: var(--ap-surface); border: 1px solid var(--ap-border); }
  .side-block-requirement .side-block-title { color: var(--brand); }
  .side-block-status-fail .side-block-title { color: #B42318; }
  .side-block-status-incomplete .side-block-title { color: #92600A; }
  .side-block-status-pass .side-block-title { color: #15803D; }
  .side-block-status-not-applicable .side-block-title { color: var(--ap-ink-secondary); }
  .side-block-title { font-size: 1rem; font-weight: 700; margin: 0 0 6px; }
  /* Primary reading text — the actual explanation a visitor is here to read, so it
     gets the full 1rem baseline rather than the smaller size everything else in this
     box (labels, meta) uses. */
  .side-block-body { margin: 0; color: var(--ap-ink-secondary); line-height: 1.6; font-size: 1rem; }
  .side-block-empty { margin: 0; color: var(--ap-text-muted); font-size: 0.9375rem; font-style: italic; }
  .side-divider { border: none; border-top: 1px solid rgba(4, 13, 41, 0.08); margin: 14px 0; }
  .profile-block-title { font-weight: 700; margin: 0 0 10px; color: var(--ap-ink); }
  /* Badges, not full-width rows — compact, wrap to fill the available width instead of
     stacking one per line and eating vertical space. */
  .profile-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .profile-list li {
    display: inline-flex; align-items: center; gap: 6px; font-size: 0.8125rem; font-weight: 600; color: var(--ap-ink-secondary);
    background: var(--ap-surface); border: 1px solid rgba(4, 13, 41, 0.08); border-radius: 999px; padding: 5px 12px 5px 8px;
  }
  .profile-list .profile-icon, .profile-list .profile-df { flex-shrink: 0; }
  .profile-list .profile-icon { flex-basis: 18px; width: 18px; height: 18px; border: none; background: none; }
  .learn-more { color: var(--brand); font-size: 0.8125rem; text-decoration: none; display: inline-block; margin-top: 6px; }
  .learn-more:hover { text-decoration: underline; }
  .reason-text { font-size: 1rem; color: var(--ap-ink-secondary); line-height: 1.6; margin: 0; }

  /* Inline code mentions inside prose (e.g. "the <meta http-equiv=...> tag" within a
     Requirement/Fix description) — same monospace treatment as the code blocks below,
     just inline instead of block-level. */
  .inline-code {
    font-family: 'SF Mono', ui-monospace, Menlo, Monaco, 'Cascadia Code', Consolas, monospace;
    font-size: 0.92em; font-style: normal; background: rgba(4, 13, 41, 0.06); color: var(--ap-ink);
    padding: 1px 5px; border-radius: 4px;
  }

  .affected-hdr { font-size: 0.8125rem; font-weight: 700; color: var(--ap-ink-secondary); margin: 0 0 10px; }
  .affected-list { margin: 0; padding-left: 20px; }
  .affected-list li { margin-bottom: 16px; font-size: 0.8125rem; }
  /* Code snippets: light theme (matches the rest of the page — a dark terminal-style
     block looked out of place here) with a real monospace stack and light syntax
     coloring, so they read as code at a glance instead of inheriting the body's
     sans-serif font. */
  .affected-code {
    background: var(--ap-surface-soft); border: 1px solid var(--ap-border); border-radius: 7px;
    padding: 9px 12px; overflow-x: auto; margin-bottom: 6px;
  }
  .affected-code code {
    font-family: 'SF Mono', ui-monospace, Menlo, Monaco, 'Cascadia Code', Consolas, monospace;
    font-size: 0.75rem; color: var(--ap-ink-secondary); white-space: pre;
  }
  .code-tag { color: #1D4ED8; font-weight: 600; }
  .code-attr { color: #92600A; }
  .code-val { color: #15803D; }
  .affected-selector { font-size: 0.75rem; color: var(--ap-text-muted); margin-bottom: 6px; font-family: ui-monospace, Menlo, Monaco, Consolas, monospace; }
  .affected-fix { font-size: 0.9375rem; color: var(--ap-ink-secondary); font-style: italic; line-height: 1.5; }
  .affected-fix em { font-style: normal; font-weight: 700; color: var(--ap-text-muted); }
  .show-all-btn {
    background: none; border: 1px solid var(--ap-border); border-radius: 8px; padding: 7px 14px;
    font-family: inherit; font-size: 0.8125rem; font-weight: 600; color: var(--brand); cursor: pointer; margin: 6px 0 10px;
  }

  .disclaimer {
    font-size: 0.8125rem; line-height: 1.6; color: var(--ap-text-muted); margin-top: 20px;
    padding: 14px 16px; background: var(--ap-surface); border: 1px solid var(--ap-border); border-radius: 12px;
  }
  .disclaimer a { color: var(--brand); }
  footer { margin-top: 20px; padding: 16px 0; text-align: center; font-size: 0.8125rem; color: var(--ap-text-muted); }

  @media (max-width: 640px) {
    .detail-grid { grid-template-columns: 1fr; }
  }

  @media (prefers-reduced-motion: reduce) {
    .row-chevron { transition: none !important; }
    .loader-thumb-shimmer, .loader-thumb-badge, .loader-steps, .loader-step { animation: none !important; }
  }

  @media print {
    .print-btn, .close-btn, .topbar, .filter-row, .show-all-btn { display: none; }
    body { background: #fff; }
    .row-body, .affected-list-rest { display: block !important; }
    .check-row, .cat-card { break-inside: avoid; }
  }
`;
