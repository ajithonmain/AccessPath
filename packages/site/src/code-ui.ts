// Code-block syntax highlighting + copy-button helpers.
// Shared by main.ts (the static Quick start / hero snippets) and the lazily-loaded
// builder.ts (the Customize builder's generated snippet) so both use one tokenizer
// and one copy-feedback animation.

// A small single-pass regex tokenizer, not a real parser — good enough for the short
// HTML/JS/TS/Angular-template snippets on this page, and avoids pulling in a syntax
// highlighting library for a handful of code blocks.
const CODE_TOKEN_RE =
  /(&lt;!--[\s\S]*?--&gt;)|(\/\/[^\n]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(&lt;\/?[\w.-]+)|([\w-]+(?==))|\b(import|export|from|default|function|return|const|let|var|class|extends|new|if|else|type|interface)\b/g;

export function highlightCode(raw: string): string {
  const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(
    CODE_TOKEN_RE,
    (match, comment1, comment2, str, tagOpen, attrName, keyword) => {
      if (comment1 || comment2) return `<span class="tok-comment">${match}</span>`;
      if (str) return `<span class="tok-string">${match}</span>`;
      if (tagOpen) {
        const prefixMatch = /^&lt;\/?/.exec(tagOpen);
        const prefix = prefixMatch ? prefixMatch[0] : '';
        const name = tagOpen.slice(prefix.length);
        return `${prefix}<span class="tok-tag">${name}</span>`;
      }
      if (attrName) return `<span class="tok-attr">${match}</span>`;
      if (keyword) return `<span class="tok-keyword">${match}</span>`;
      return match;
    }
  );
}

export const COPY_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6"/></svg>';

/** Swaps a copy button's icon to a checkmark and its accessible name to "Copied" for a
 *  beat, then restores both — shared by every copy button on the page (the dynamically
 *  created ones from makeCopyButton() in main.ts, and the builder's own #qc-builder-copy). */
export function flashCopied(btn: HTMLElement, restoreIconHTML: string, restoreAriaLabel: string): void {
  btn.innerHTML = CHECK_ICON_SVG;
  btn.setAttribute('aria-label', 'Copied');
  btn.classList.add('is-copied');
  window.setTimeout(() => {
    btn.innerHTML = restoreIconHTML;
    btn.setAttribute('aria-label', restoreAriaLabel);
    btn.classList.remove('is-copied');
  }, 1400);
}
