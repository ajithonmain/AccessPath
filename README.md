# Accessibility Panel

Standalone Angular project for an embeddable, UserWay-style **accessibility control panel** — text size, motion, contrast, spacing, dyslexia font, saturation — extracted from the ChatBistro chat widget (`chatbistroui-newUiV4`).

Demo app included: a small chat-style "widget" showing the panel wired up end-to-end.

## Run it

```bash
npm install
npm start        # ng serve — http://localhost:4200
```

## Build

```bash
npm run build     # output in dist/accessibility
```

## Project layout

```
src/app/
  accessibility-panel/
    accessibility-panel.component.ts    # state, profiles, localStorage persistence
    accessibility-panel.component.html  # panel UI
    accessibility-panel.component.css   # panel styling + :host(.a11y-*) self-response rules
  a11y-effects.css                      # generic effect rules applied to [container]
  app.component.*                       # demo host widget wiring the panel up
```

## Using the panel in your own app

```html
<div #root class="a11y-target">
  <!-- your content -->
  <app-accessibility-panel #a11yPanel [container]="root" [isDarkTheme]="isDark"></app-accessibility-panel>
</div>
<button (click)="a11yPanel.open()">Accessibility</button>
```

1. Copy `accessibility-panel/` and `a11y-effects.css` into your project.
2. `@import` `a11y-effects.css` in your global styles.
3. Add class `a11y-target` to the root element you want the panel to control, and pass it as `[container]`.
4. Define theme tokens the panel/effects read (`--brand --tx --tm --mu --bd --sf --sf2 --sf3` — all have sane fallbacks if omitted).
5. Add your own font-scale selectors for pixel-exact sizing on your specific components — see the commented example at the top of `a11y-effects.css`.

Full detail, WCAG mapping, and testing checklist: [accessibility.md](accessibility.md).

## Origin

Extracted from `d:/Projects/HTML/chatbistroui-newUiV4/src/app/shared/accessibility-panel/`. FontAwesome dependency was replaced with inline SVG so this project has zero external icon-library dependency.
