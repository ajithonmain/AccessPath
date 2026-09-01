# AccessPath

Framework-agnostic, embeddable **accessibility control panel** — text size, motion,
contrast, spacing, dyslexia font, saturation, highlight links, hide images, big cursor,
text align, read aloud, a page structure navigator, dictionary lookups, sitewide tooltips,
and a reading guide overlay — with nine preset profiles, `localStorage` persistence,
keyboard support (focus trap, Escape-to-close, focus return), and OS-level
`prefers-reduced-motion` auto-detect.

One core, three ways to consume it:

| Package | Use case |
|---|---|
| `packages/core` | Framework-agnostic state + vanilla-DOM panel UI. Everything else builds on this. |
| `packages/embed` | Zero-build `<script>` tag for WordPress/Shopify/static HTML — mounts in a Shadow DOM. |
| `packages/react` | `<AccessPathPanel>` component + `useAccessPath()` hook. |
| `packages/angular` | `AccessibilityPanelComponent` — thin wrapper over core, same public API as before. |
| `packages/site` | Public marketing/docs page (static, Vite build) — the polished public-facing page. |

Root of the repo is also a runnable Angular demo app (`src/app/`) wired up to `packages/angular`.
That app, plus `packages/embed/demo` and `packages/react/demo`, are dev/test fixtures — `packages/site`
is the one meant to be shown to actual visitors.

## Run it

```bash
npm install                 # installs root + all workspace packages
npm run build:core          # packages/angular and packages/embed/react both need core built first
npm start                    # ng serve — http://localhost:4200 (Angular demo)
```

Package-specific demos:

```bash
npm run build:embed && open packages/embed/demo/index.html   # serve over http:// (not file://)
npm run demo -w @accesspath/react                             # http://localhost:5174
npm run dev:site                                               # public site, http://localhost:5173
```

## Build

```bash
npm run build:all      # core, embed, react, angular library, site — in that order
npm run build           # just the root Angular demo app
```

## Project layout

```
packages/
  core/        # A11yPrefs, 9 profiles, AccessPathState, applyClasses, focus-trap, vanilla panel-dom
  embed/       # IIFE bundle: Shadow DOM mount, data-* attribute config, floating trigger
  react/       # AccessPathPanel component + useAccessPath hook
  angular/     # AccessibilityPanelComponent (ng-packagr library, consumes packages/core)
  site/        # Public marketing/docs page — static Vite build, deployable to Vercel/Cloudflare Pages
src/app/       # Angular demo app (dev/test fixture) — imports AccessibilityPanelComponent from @accesspath/angular
```

## Using the embed script (no build step)

```html
<!-- Not published to a CDN yet — host dist/embed.js from @accesspath/embed yourself and
     point src at that path until then. -->
<script src="/embed.js"
        data-profiles="dyslexia,motor,low-vision"
        data-theme="light"
        data-storage-key="accesspath-prefs"
        data-position="bottom-right"
        data-shape="circle"
        data-icon="accessibility"
        data-draggable="false"
        data-target="#app-root">
</script>
```

- `data-profiles` — comma list restricting which of the 6 preset profile buttons render: `low-vision`,
  `dyslexia`, `seizure`, `motor`, `colorblind`, `adhd` (default: all).
- `data-theme` — `light` (default) or `dark`, styles the panel's own chrome.
- `data-storage-key` — localStorage key (default `accesspath-prefs`).
- `data-position` — floating trigger position: `bottom-right` (default), `bottom-left`, `top-right`, `top-left`.
- `data-shape` — trigger shape: `circle` (default), `rounded-square`, `pill`.
- `data-icon` — trigger icon: `accessibility` (default), `motion`, `contrast`, `spacing`.
- `data-draggable` — `"true"` lets visitors drag the trigger; its final position persists to
  `localStorage` under `${storageKey}-trigger-pos` (default `false`).
- `data-target` — CSS selector for the element the effect classes apply to (default `<html>`).

The embed script mounts its own floating circular trigger button automatically
(`createTriggerButton()` from `@accesspath/core`) — React and Angular don't ship a built-in trigger,
you wire your own button to call `open()`.

## Using the React package

```tsx
import { AccessPathPanel, useAccessPath } from '@accesspath/react';
import '@accesspath/core/styles/a11y-effects.css';
import '@accesspath/core/styles/panel.css';

const panelRef = useRef<AccessPathPanelHandle>(null);
<AccessPathPanel ref={panelRef} container={rootEl} isDarkTheme={isDark} storageKey="accesspath-prefs" />
<button onClick={() => panelRef.current?.open()}>Accessibility</button>
```

`useAccessPath(storageKey)` exposes `{ open, close, reset, prefs, activeProfile, isOpen }` reactively —
it shares state with any mounted `<AccessPathPanel>` using the same `storageKey`.

## Using the Angular package

```html
<app-accessibility-panel #a11yPanel [container]="root" [isDarkTheme]="isDark"></app-accessibility-panel>
<button (click)="a11yPanel.open()">Accessibility</button>
```

Same public API as before the restructure (`[container]`, `[isDarkTheme]`, `[storageKey]`, `open()`,
`close()`, `reset()`) — only the implementation moved to consume `@accesspath/core`.

## Theme tokens

Both effect classes (`a11y-effects.css`) and the panel's own chrome (`panel.css`) read CSS variables
with sane fallbacks — override them to match your design system:
`--brand --brand-soft --brand-border --tx --tm --mu --bd --sf --sf2 --sf3`.

Full detail, WCAG mapping, and testing checklist: [accessibility.md](accessibility.md).

## Origin

Originally extracted from an in-widget accessibility panel built for the ChatBistro chat widget
(`chatbistroui-newUiV4`), then restructured into this framework-agnostic monorepo.
