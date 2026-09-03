# AccessPath

**AccessPath is a free, open source accessibility widget for websites.** It adds a floating
button that opens a control panel with real, working tools: bigger text, less motion, more
contrast, more spacing, a dyslexia friendly font, text to speech, and more. It also includes
a built in WCAG accessibility checker that scans your page for issues, right in the browser.

You can add it to any website. It works with plain HTML, WordPress, Shopify, React, and
Angular.

## What it does

When a visitor opens the panel, they can turn on:

- Bigger text
- Less motion (for people sensitive to animation)
- More contrast
- More spacing between lines and letters
- A dyslexia friendly font
- Lower saturation, or an inverted color mode
- Highlighted links
- Hidden images
- A bigger cursor
- Text alignment options
- Read aloud (the page is read out loud, block by block)
- A page structure list (jump straight to any heading)
- Dictionary lookups (double click any word for a definition)
- Tooltips on every icon and button, sitewide
- A reading guide that follows the mouse and dims everything else

There are also 9 ready made profiles for common needs, so a visitor doesn't have to turn
each setting on by hand: Low Vision, Dyslexia, Seizure Safe, Motor Impaired, Color Blind,
ADHD, Voice Over, Elderly, and Cognitive & Learning.

Every choice a visitor makes is saved in their browser, so it's still set the next time they
visit. Keyboard users get a proper focus trap, Escape closes the panel, and focus goes back
to where it was. The panel also checks the visitor's own operating system setting for
reduced motion, and respects it automatically.

A note for Safari/iOS visitors: by default, Safari only lets the Tab key reach text fields
and dropdowns, skipping plain buttons — a setting Safari itself controls (System Settings →
Keyboard → "Full Keyboard Access"), not something this panel or any other website can turn on
for you. With it off, Tab won't reach most of the panel's buttons in Safari specifically; every
other browser tabs through the whole panel normally. Turning that setting on fixes it for every
button-based site you visit, not just this one.

## Built in WCAG accessibility checker

AccessPath also includes a free accessibility checker, sometimes called an accessibility
scanner or audit tool. It checks your page against 66 rules based on WCAG, the standard used
for ADA and other accessibility laws. It runs fully inside the visitor's browser. Nothing is
sent to a server, and no third party scanning service is used.

It checks things like:

- Missing alt text on images
- Form fields with no label
- Buttons and links with no readable name
- Color contrast (using the real WCAG math, not a guess)
- Touch target size
- Heading order and page structure
- ARIA roles and attributes
- Table structure
- List structure
- And more

When a check can't be judged automatically (like text sitting on top of a background image),
it's marked as "needs manual review" instead of being hidden or counted as a false pass.
Running a scan opens a full report with a score, a breakdown by category, and a plain
English fix for every issue found.

No automated tool can catch everything. This one is honest about that limit right in the
report, instead of claiming to be a full compliance certification.

This checker is meant for site owners and developers, so it's turned off by default. Turn it
on with the `sections` option (or `data-sections` for the plain script version).

## One core, four ways to add it to your site

| Package | What it's for |
|---|---|
| `packages/core` | The engine. All the state and the panel UI, built in plain JavaScript with no framework needed. Everything else is built on top of this. |
| `packages/embed` | A single `<script>` tag. No build step needed. Works on WordPress, Shopify, and plain HTML sites. |
| `packages/react` | An `<AccessPathPanel>` component and a `useAccessPath()` hook for React apps. |
| `packages/angular` | An `AccessibilityPanelComponent` for Angular apps. |
| `packages/site` | The public AccessPath website itself. |

## Getting started

```bash
npm install               # installs everything
npm run build:core        # build this first, the other packages depend on it
npm start                  # runs the public site at http://localhost:5173
```

To work on one of the individual packages:

```bash
npm run build:embed && npx serve packages/embed   # then visit /demo/ — needs http://, not file://
npm run demo -w @accesspath/react                 # http://localhost:5174
```

## Building for production

```bash
npm run build:all      # builds core, embed, react, the angular library, and the site
```

Each package also has its own `build:<name>` script.

## Deploying the public site

`packages/site` embeds a live copy of the widget synced from `packages/embed/dist`, so its build
needs core and embed built first. On Vercel, Netlify, or Cloudflare Pages, set the project's
build command to:

```bash
npm run build:core && npm run build:embed && npm run build:site
```

and the output/publish directory to `packages/site/dist`. A plain `npm run build:site` on a
fresh clone fails on purpose (the embed bundle it needs isn't checked into git).

## Project layout

```
packages/
  core/    the state, the panel, and the accessibility checker (no framework dependencies)
  embed/   the plain script tag version, mounts inside a Shadow DOM
  react/   the React component and hook
  angular/ the Angular component, built as a library on top of core
  site/    the public AccessPath website
```

## Adding the script tag (no build step)

Drop one script tag on any page — loads from jsDelivr (pinned to `@0`), or self-host
`dist/embed.js` from `@accesspath/embed` and point `src` at your own copy:

```html
<script src="https://cdn.jsdelivr.net/npm/@accesspath/embed@0/dist/embed.js"
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

Every attribute below is optional.

| Attribute | What it does |
|---|---|
| `data-profiles` | Which profile cards to show, comma separated. Any of `low-vision`, `dyslexia`, `seizure`, `motor`, `colorblind`, `adhd`, `voice-over`, `elderly`, `cognitive`. Shows all 9 by default. |
| `data-theme` | `light` (default) or `dark`. This is the panel's own look, not your site's. |
| `data-storage-key` | The browser storage key used to save settings. Defaults to `accesspath-prefs`. |
| `data-position` | Where the floating button sits: `bottom-right` (default), `bottom-left`, `top-right`, `top-left`. |
| `data-shape` | Button shape: `circle` (default), `rounded-square`, `pill`. |
| `data-icon` | Button icon: `accessibility` (default), `motion`, `contrast`, `spacing`, `motor`, `badge`, `logo`. |
| `data-draggable` | Set to `"true"` to let visitors drag the button to a new spot. It remembers where they leave it. |
| `data-target` | A CSS selector for the part of the page the effects apply to. Defaults to the whole page. |
| `data-brand` | A hex color code, like `"#4928F3"`, used as the panel's accent color. |
| `data-actions` | A JSON list of extra footer buttons, like `'[{"id":"support","label":"Support"}]'`. |
| `data-locale` | Panel language: `en`, `es`, `fr`, `de`, or `pt`. Defaults to `en`. |
| `data-labels` | A JSON object to override any text label in the panel. |
| `data-sections` | Which sections to show, comma separated: `profiles`, `quick`, `controls`, `actions`, `audit`. The accessibility checker (`audit`) is off by default. |
| `data-control-categories` | Which control groups to show under "All Controls". |
| `data-hide-trigger` | Set to `"true"` to hide the built in floating button, if you'd rather use your own. Call `window.AccessPath.open()`, `.close()`, or `.toggle()` from your own button. |
| `data-report-url` | A link shown in the panel's footer. |

## Adding it to a React app

```tsx
import { useRef } from 'react';
import { AccessPathPanel, useAccessPath } from '@accesspath/react';
import type { AccessPathPanelHandle } from '@accesspath/react';
import '@accesspath/core/styles/a11y-effects.css';
import '@accesspath/core/styles/panel.css';

const panelRef = useRef<AccessPathPanelHandle>(null);

<AccessPathPanel ref={panelRef} container={rootEl} isDarkTheme={isDark} storageKey="accesspath-prefs" />
<button onClick={() => panelRef.current?.open()}>Accessibility</button>
```

`useAccessPath(storageKey)` gives you `{ open, close, reset, prefs, activeProfiles, isOpen }`.
`activeProfiles` is an array, since more than one profile can be on at once. Any component
using the same `storageKey` shares the same state.

## Adding it to an Angular app

The component is standalone, so import it directly:

```ts
import { AccessibilityPanelComponent } from '@accesspath/angular';

@Component({
  standalone: true,
  imports: [AccessibilityPanelComponent],
  // ...
})
```

Add the two core stylesheets to your global styles (for example in `styles.css`):

```css
@import '@accesspath/core/styles/a11y-effects.css';
@import '@accesspath/core/styles/panel.css';
```

```html
<app-accessibility-panel #a11yPanel [container]="root" [isDarkTheme]="isDark"></app-accessibility-panel>
<button (click)="a11yPanel.open()">Accessibility</button>
```

Same inputs and methods it's always had: `[container]`, `[isDarkTheme]`, `[storageKey]`,
`open()`, `close()`, `reset()`.

## Making it match your brand

The panel reads CSS variables with safe fallback values, so it looks fine even if you don't
set any of them. To match your own colors, override these:

```
--ap-brand --ap-brand-2 --ap-brand-soft --ap-brand-border --ap-brand-text
--ap-tx --ap-tm --ap-mu --ap-bd --ap-sf --ap-sf2
```

They all start with `--ap-` on purpose. A plain name like `--brand` is exactly the kind of
variable a website is likely already using for its own design, and setting it globally could
break the site's own styling by accident.

## Where AccessPath came from

AccessPath started as an accessibility panel built directly inside a chat widget project. It
has since been rebuilt from the ground up as its own free, open source project, so any
website can use it.
