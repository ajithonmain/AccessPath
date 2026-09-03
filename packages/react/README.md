# @accesspath/react

React component and hook for the AccessPath accessibility widget.

## Install

```bash
npm install @accesspath/react @accesspath/core
```

## Usage

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
`activeProfiles` is an array — more than one profile can be active at once. Any component using
the same `storageKey` shares the same state.

ESM-only; requires a bundler (Vite, Next.js, webpack 5+) or a `type: module` environment.

## Links

- [GitHub repo](https://github.com/ajithonmain/AccessPath)
- [MIT License](./LICENSE)
