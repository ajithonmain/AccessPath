# @accesspath/core

Framework-agnostic accessibility widget engine: state, panel UI, effects, and a built-in WCAG
scanner. Zero framework dependencies, plain DOM. This is the engine used by
[`@accesspath/embed`](https://www.npmjs.com/package/@accesspath/embed),
[`@accesspath/react`](https://www.npmjs.com/package/@accesspath/react), and
[`@accesspath/angular`](https://www.npmjs.com/package/@accesspath/angular) — most consumers
should use one of those instead of calling this package directly.

## Install

```bash
npm install @accesspath/core
```

## Usage

```ts
import { getState, createPanel, applyClasses } from '@accesspath/core';
import '@accesspath/core/styles/a11y-effects.css';
import '@accesspath/core/styles/panel.css';

const container = document.body; // element the a11y-* effect classes apply to
const state = getState('accesspath-prefs');
const panel = createPanel({ state, container });

document.documentElement.appendChild(panel.root); // never a descendant of `container`

state.subscribe(() => applyClasses([container], state.prefs, state.activeProfiles));
applyClasses([container], state.prefs, state.activeProfiles);

state.open();
```

ESM-only; requires a bundler or a `type: module` environment.

## Links

- [GitHub repo](https://github.com/ajithonmain/AccessPath)
- [MIT License](./LICENSE)
