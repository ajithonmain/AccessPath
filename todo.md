# AccessPath — Fix Backlog (priority order)

**Status: all 16 items done (2026-09-01).** `npm run build:all` passes (core, embed, react,
angular-lib, site). Left as a record of what changed and why — see git diff for the actual edits.
The two "Optional" profile-bundle tweaks at the bottom were NOT applied (they were flagged as
product decisions to confirm first, not bugs).

Findings from a full code review of `packages/core`, all three wrappers, and `docs/` on 2026-09-01.
Work top to bottom. Read `CLAUDE.md` first — especially the "Non-obvious constraints" section.
Never pass `panel.root` to `applyClasses()`, never mount the panel inside `container`, and verify
font-size/contrast changes in a real browser, not just by reading CSS.

---

## P1 — User-visible bugs

### 1. Read Aloud card gets stuck on "Stop"

- Files: `packages/core/src/tts.ts`, `packages/core/src/panel-dom.ts` (search `isSpeaking`, ~line 932).
- Problem: `speak()` in `tts.ts` never sets an `onend`/`onerror` handler on the utterance, and
  `panel-dom.ts` only flips its local `isSpeaking` flag on click. When speech finishes naturally,
  the card still shows "Stop" and stays active. The next click calls `stopSpeaking()` (a no-op on
  an idle engine), so the user needs two clicks to read again.
- Fix: have `speak()` accept an `onEnd` callback (fired on both `end` and `error` events of the
  utterance), and in `panel-dom.ts` use it to set `isSpeaking = false` and call
  `updateReadAloudCard()`.
- Also fix while in `tts.ts` (same function):
  - `speak()` calls `speechSynthesis.cancel()` unconditionally and then `speak()` in the same tick.
    Per this repo's own convention (see `speakNow()` in `voice-over.ts` and the CLAUDE.md notes),
    only call `cancel()` when `speechSynthesis.speaking || speechSynthesis.pending` is true, and
    never call `speak()` in the same tick as a `cancel()` — defer the `speak()` with a
    `setTimeout(..., 0)` when a cancel happened. Calling cancel on an idle engine or
    cancel+speak same-tick wedges Chrome.
  - Read Aloud ignores the persisted `voiceRateLevel` / `voicePitchLevel` / `voiceURI` prefs that
    Voice Over honors. Apply them to the utterance: rate/pitch use `2 ** ((level - 50) / 50)`
    (same formula as `voice-over.ts`); resolve `voiceURI` against `speechSynthesis.getVoices()`
    and skip silently if not found. Thread the values in from `panel-dom.ts` via parameters —
    keep `tts.ts` free of any import of `AccessPathState`.

### 2. Toggling a profile wipes the user's manual adjustments

- File: `packages/core/src/state.ts`, `applyProfile()` (~line 186).
- Problem: `applyProfile()` does `this.prefs = { ...DEFAULT_PREFS }` and then re-applies the
  bundles of all active profiles. So: user drags Text Size to 70, then taps "Seizure Safe" —
  font size silently resets to 0. Toggling a profile OFF also resets everything not covered by
  the remaining profiles. There is also the inverse inconsistency: a manual change made after
  activating a profile leaves the profile pill lit even though prefs no longer match its bundle.
- Chosen policy (implement exactly this):
  1. Keep a snapshot of manual (non-profile) prefs. Simplest correct approach: when
     `applyProfile()` runs, start from the CURRENT `this.prefs` instead of `DEFAULT_PREFS` when
     ADDING a profile (just `Object.assign(this.prefs, PROFILES[key])`). When REMOVING a profile,
     for each key in that profile's bundle, restore the value from `DEFAULT_PREFS` unless another
     still-active profile also sets that key (then use the most recently activated one's value).
  2. Do NOT auto-clear a pill when the user manually diverges — leave pill state as-is (that
     matches how the pills are rendered from `activeProfiles`, and avoids surprise toggles).
- Update the doc comment above `applyProfile()` to describe the new merge behavior.
- Test (browser, per CLAUDE.md verification section): set Text Size 70 manually, toggle a profile
  on and off, confirm Text Size is still 70 both times.

### 3. Voice Over missing from the Active Adjustments band

- File: `packages/core/src/panel-dom.ts`, `activeAdjustments()` (~line 1381).
- Problem: every persisted pref gets a removable chip except `voiceOver`. Enable only Voice Over:
  the band stays hidden and the count says nothing is active, yet the page reads itself aloud on
  every reload.
- Fix: add a chip: `if (p.voiceOver) list.push({ label: L.activeBand.voiceOver, clear: () => state.toggle('voiceOver') });`
  You must also add `voiceOver` to the `activeBand` label group in ALL FIVE locale files
  (`packages/core/src/i18n/en.ts`, `es.ts`, `fr.ts`, `de.ts`, `pt.ts`) and to the `Labels` type in
  `packages/core/src/i18n/types.ts`. Reuse the existing Voice Over feature label wording per locale.

### 4. Dyslexia toggle loads no font on embed (no-build) sites

- Files: `packages/core/styles/a11y-effects.css` (dyslexia rule ~line 73),
  `packages/embed/src/index.ts`.
- Problem: the CSS sets `font-family: 'OpenDyslexic'` but nothing ever loads that font face — a
  comment says the host must `@import` it themselves. React/Angular consumers can, but the embed
  script's entire pitch is "no-build sites", and `injectEffectsStyles()` injects the effects CSS
  without the font. The toggle silently falls back to sans-serif (only its spacing/line-height
  side effects show).
- Fix: in the embed's `mount()` (or lazily, the first time `prefs.dyslexia` becomes true —
  preferred, avoids loading a font nobody uses), inject a `<link rel="stylesheet">` to
  `https://cdn.jsdelivr.net/npm/@fontsource/opendyslexic/index.css` into `document.head`, guarded
  by an id check like `injectEffectsStyles()` does. Embed only — do NOT add this to core or the
  React/Angular wrappers; for those, document the required import in README instead (see item 15).
  Note this is the one external-CDN exception besides `dictionaryapi.dev`; keep the existing
  "graceful degradation" behavior if it fails to load.

### 5. Escape with the Color Blind dropdown open also closes the whole panel

- File: `packages/core/src/panel-dom.ts`, `attachDropdownToCard()` (~line 268) and the
  `createFocusTrap` onEscape wiring (~line 1550).
- Problem: the dropdown's document-level capture keydown closes the menu, but the event still
  reaches the focus trap's Escape handler, which closes the panel underneath. One Escape should
  close only the topmost thing (the menu), same as the statement modal already does.
- Fix: in `attachDropdownToCard`'s `onDocKeydown`, when the menu is open and Escape is pressed,
  call `e.stopPropagation()` (and keep closing the menu). The listener is capture-phase on
  `document`, so stopping propagation there prevents the panel's own keydown handler from firing.

---

## P2 — Dead code and state hazards

### 6. Zombie 'colorblind' profile bundle and dead `cb-active` class

- Files: `packages/core/src/profiles.ts`, `packages/core/src/state.ts` (`load()`),
  `packages/core/src/apply-classes.ts` (line 55).
- Problem: the Color Blind card's click handler is a no-op (`() => {}` in `panel-dom.ts` ~line 769)
  — its whole effect is now the `colorBlindSim` dropdown. So `PROFILES.colorblind`
  (`saturationLevel: -100, contrastLevel: 100, spacingLevel: 60`) is unreachable from the UI.
  BUT legacy localStorage that contains `'colorblind'` in its saved `profiles` array still applies
  that bundle on load, with no pill reflecting it (the pill's active state is driven by
  `colorBlindSim`, not `activeProfiles`) — prefs the user cannot see or clear except full Reset.
  Separately, `apply-classes.ts` toggles a `cb-active` class that has no CSS rule anywhere.
- Fix:
  1. Delete the `cb-active` toggle line from `apply-classes.ts`.
  2. In `state.ts` `load()`, filter `'colorblind'` out of `savedProfiles` (treat it like the
     removed 'blind' key — the existing "rebuild prefs when we dropped any" branch then cleans up
     the stuck prefs automatically).
  3. Remove the `'colorblind'` entry from `PROFILES` — but KEEP `'colorblind'` in the `ProfileKey`
     type, `PROFILE_LABELS`, and `PROFILE_COLORS` (the card still renders and needs its label and
     colors). `PROFILES` is typed `Record<ProfileKey, ...>`, so change its type to
     `Partial<Record<ProfileKey, Partial<A11yPrefs>>>` or keep the entry as an empty object `{}` —
     empty object is the smaller change; if you keep it, add a comment saying it's intentionally
     empty and why.
  4. Check `Object.keys(PROFILES)` usage in `panel-dom.ts` (~line 669) still yields all 9 cards
     after your change.

### 7. Default storageKey mismatch between embed and the other wrappers

- Files: `packages/embed/src/index.ts` (line ~90: `'accesspath-prefs'`),
  `packages/core/src/profiles.ts` (`DEFAULT_STORAGE_KEY = 'a11y-prefs'`),
  `packages/angular/src/lib/accessibility-panel.component.ts` (line 41).
- Problem: embed defaults to `'accesspath-prefs'`; core/React/Angular default to `'a11y-prefs'`.
  A site migrating from the embed script to a framework wrapper silently loses visitor prefs.
- Fix: standardize on `'accesspath-prefs'` (the more distinctive name). Change
  `DEFAULT_STORAGE_KEY` in `profiles.ts` and the Angular `@Input` default to match. Add a one-time
  migration in `AccessPathState.load()`: if nothing exists under the current key but
  `localStorage.getItem('a11y-prefs')` exists AND the storageKey is the default, read the old key
  and write it under the new one. Keep it small — a few lines, not a framework.

### 8. Elderly profile violates the contrastMode invariant

- File: `packages/core/src/profiles.ts` (elderly entry), `packages/core/src/state.ts`
  (`setContrastMode`).
- Problem: the bundle sets `contrastMode: 'high'` together with `contrastLevel: 60`, but the UI's
  "High" mode sets `contrastLevel: 100` (and bgColor/textColor null). Applying the profile via
  `Object.assign` bypasses `setContrastMode()`, so the segmented control shows "High" while the
  actual level is 60.
- Fix: change the elderly bundle to `contrastLevel: 100` (matching what 'high' means everywhere
  else) or drop `contrastMode` from the bundle and keep only `contrastLevel: 60` (then the seg
  stays on "default"). Pick the first unless the 100 level looks too harsh in the browser — check
  visually on the site demo.

---

## P3 — Stale comments that will cause regressions

### 9. JSDoc telling consumers to pass `panel.root` to `applyClasses()`

- Files: `packages/core/src/apply-classes.ts` line 6, `packages/core/src/panel-dom.ts`
  `PanelHandle.root` doc comment (~line 141).
- Problem: both comments say to apply classes to "container + panel's own root" / "pass it to
  applyClasses() alongside your container so the panel visually responds to its own settings".
  That pattern was DELIBERATELY REMOVED (see CLAUDE.md constraints — the panel chrome must never
  self-respond, and `filter` effects leak into any descendant). A contributor following the JSDoc
  reintroduces a known bug.
- Fix: rewrite both comments to say the opposite: call `applyClasses()` with the host container
  only, never `panel.root`, referencing the CLAUDE.md constraint. No code change.

### 10. "Defaults to all 6" profile-count comment

- File: `packages/core/src/panel-dom.ts` ~line 103 (`profiles?: ProfileKey[]` option doc).
- Fix: there are 9 profiles now. Change the comment to "Defaults to all profiles" (countless, so
  it can't go stale again). Also check `accessibility.md`'s config table (`data-profiles` row says
  "all 6") while you're at it — see item 14.

---

## P4 — Lower-risk polish

### 11. Category expand clips tall content at 900px

- File: `packages/core/src/panel-dom.ts`, `createCategory()` (~line 652: hardcoded
  `maxHeight = '900px'`), `packages/core/styles/panel.css` (`.a11y-category-body`,
  `overflow: hidden`).
- Problem: an expanded category taller than 900px (a tall custom section from
  `customSections`, or the Reading category on a narrow viewport where the card grid wraps to
  more rows) gets silently clipped.
- Fix: on expand, set `content.style.maxHeight = content.scrollHeight + 'px'`, and after the
  transition ends (listen for `transitionend` once) set it to `'none'` so later content growth
  isn't clipped; on collapse, first set it back to `scrollHeight + 'px'`, force a reflow
  (`void content.offsetHeight`), then set `'0px'` so the transition still animates.

### 12. Reading Guide sits under high-z-index host elements

- File: `packages/core/styles/a11y-effects.css` (`.a11y-reading-guide-band`, `z-index: 998`).
- Problem: any host sticky header with z-index >= 999 renders on top of the dimming bands. The
  comment claims the value is only about staying under the panel, which is misleading.
- Fix: raise to `2147483000` minus enough headroom to stay under the trigger (2147483000),
  backdrop (2147483001) and drawer (2147483002) — use `2147482999` and update the comment to list
  the full ladder. `pointer-events: none` already ensures it can't block clicks.

### 13. Read Aloud fallback reads raw `container.textContent`

- File: `packages/core/src/panel-dom.ts` (Read Aloud click handler, ~line 944).
- Problem: `textContent` includes visually hidden elements and inline `<script>`/`<style>` text —
  garbage gets spoken.
- Fix: reuse Voice Over's block-walking text extraction. Export the readable-block collection
  helper from `packages/core/src/voice-over.ts` (it already walks the container in DOM order,
  skipping hidden/script content) and use its joined text as the fallback instead of
  `container.textContent`. Do not duplicate the walker.

---

## P5 — Documentation (no code)

### 14. accessibility.md is badly stale — full pass needed

- File: `accessibility.md` (repo root).
- Wrong and must change:
  - Documents removed classes: `.a11y-con-dark`, `.a11y-con-invert`, `.a11y-sat-low/high/none`.
    Real classes today: `.a11y-invert`, `.a11y-saturation` (+ `--a11y-saturation-level`),
    `.a11y-contrast` (+ `--a11y-contrast-level`), `.a11y-monochrome`. Read
    `packages/core/src/apply-classes.ts` and `packages/core/styles/a11y-effects.css` for the
    authoritative list and regenerate the whole table from those two files.
  - Says dyslexia font is "Lexend" — it is OpenDyslexic.
  - Says line-height 1.9 — it's a 0-100 slider mapping to 1.5–2.3.
  - Says "all 6" profiles — there are 9.
  - Shows persisted shape `"profile": null` — it's now a `profiles` array (see `PersistedShape`
    in `packages/core/src/state.ts`).
  - Says to pass "your app's container plus the panel's own wrapper element" to `applyClasses()`
    — forbidden; container only (same fix as item 9).
  - Section list says seven sections including a separate "Focus" — the panel now has 5 control
    categories (vision/content/motion/reading/navigation); Reading Guide lives under
    Navigation & Focus.
- Missing entirely: Monochrome, Color Blind Simulation, Contrast Mode (default/light/dark/high/
  smart), Mute Sounds, Highlight Titles/Hover/Focus, Virtual Keyboard, Background/Text/Title
  color overrides, Accessibility Checker.

### 15. features-and-profiles.md roadmap lists shipped features as unbuilt

- File: `docs/features-and-profiles.md`.
- Move from "Roadmap" (section 3) into "Current Features" (section 2), with real mechanisms —
  these all exist in `packages/core/src`: Smart Contrast (`smart-contrast.ts`), Virtual Keyboard
  (`virtual-keyboard.ts`), Mute Media (`mute-sounds.ts`), Custom Color picker
  (bg/text/title `colorPickerRow` in `panel-dom.ts`), Highlight Headers (`highlightTitles`),
  Read Focus (`highlightFocus`).
- Also fix in section 2: "one active at a time" (profiles are multi-select now); the Color Blind
  profile row (the card no longer applies a preset bundle — it only opens the simulation-type
  dropdown, see item 6); trigger icon list says 4 icons, there are 7 (`VALID_ICONS` in
  `packages/embed/src/index.ts`); add the missing shipped features listed in item 14.
- Also document here (or in README): React/Angular consumers must add the `a11y-target` class to
  their container themselves AND import OpenDyslexic for the dyslexia toggle — only the embed
  does either automatically.

### 16. Profile/tool counts stale everywhere

- DONE: `README.md` already says 9. `packages/site/` aligned to "9 profiles · 30+ tools"
  across all page copy, meta/OG/Twitter tags, JSON-LD, the accessibility-guide profile table,
  and code comments in `a11y-scanner.ts` / `packages/site/src/style.css`.
- `docs/profile_tools-new.md` and `docs/profile_tools.md`: "6 PROFILES · 13+ TOOLS" badge spec —
  these are build specs for the marketing site; the shipped `index.html` badge already reads
  "9 PROFILES · 30+ TOOLS" and `packages/site/src/main.ts` has all 9 keys. The doc specs are
  the only stale bit left — historical, low priority.
- `CLAUDE.md`: says `src/app/` is the Angular demo run by `npm start` — `src/` is deleted and
  `npm start` now runs `dev:site`. Also update its section list (separate "Focus" section no
  longer exists). (The intro already says "9 preset profiles".)

---

## Optional — profile bundle improvements (product decisions, confirm with Ajith first)

**Both resolved 2026-09-02 — confirmed yes, both shipped.**

- Seizure Safe: added `muteSounds: true` (autoplaying media is part of the photosensitivity/startle
  hazard this profile addresses) — `packages/core/src/profiles.ts`, also updated in
  `accessibility.md`'s profile bundle table.
- ADHD: `readingGuide: true` was already present in `profiles.ts` (comparable products ship a
  reading mask with their ADHD preset) — this list was stale, not the code.

---

## Verification notes for every item

- Build order: `npm run build:core` before anything consuming core compiles.
- After touching `panel-dom.ts`, `state.ts`, or either CSS file, load the site demo
  (`npm run build:core && npm run build:embed && npm run dev:site`) and click through: open panel,
  each changed control, at least one profile on/off cycle, Tab cycling, Escape, focus return, and
  one "click the trigger again while the panel is already open" cycle (focus-trap idempotency).
- Do not tune any core fix to the site's specific markup — core runs on arbitrary host pages.
