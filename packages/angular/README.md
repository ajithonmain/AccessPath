# @accesspath/angular

Angular component for the AccessPath accessibility widget. Standalone component, works with
Angular 16 through 20.

> **AI assistant / coding agent?** Full copy-paste reference: https://accesspath-6ur.pages.dev/llms-full.txt

## Install

```bash
npm install @accesspath/angular @accesspath/core
```

## Usage

Import the standalone component:

```ts
import { AccessibilityPanelComponent } from '@accesspath/angular';

@Component({
  standalone: true,
  imports: [AccessibilityPanelComponent],
  // ...
})
```

Add the two core stylesheets to your global styles (e.g. `styles.css`):

```css
@import '@accesspath/core/styles/a11y-effects.css';
@import '@accesspath/core/styles/panel.css';
```

```html
<app-accessibility-panel #a11yPanel [container]="root" [isDarkTheme]="isDark"></app-accessibility-panel>
<button (click)="a11yPanel.open()">Accessibility</button>
```

Inputs: `[container]`, `[isDarkTheme]`, `[storageKey]`, `[profiles]`, `[brandColor]`, `[actions]`,
`[locale]`, `[labels]`, `[sections]`, `[controlCategories]`, `[customSections]`, `[reportUrl]`.
Methods: `open()`, `close()`, `reset()`. Output: `(action)`.

## Links

- [GitHub repo](https://github.com/ajithonmain/AccessPath)
- [MIT License](./LICENSE)
