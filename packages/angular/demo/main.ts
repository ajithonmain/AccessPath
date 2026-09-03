import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app.component';

// The two core stylesheets are loaded via angular.json's "styles" array for this project
// (Angular CLI's default webpack config doesn't process a bare `import '*.css'` from a .ts
// file — see packages/core README/root README for the equivalent @import setup in a real app's
// global styles.css).

// AccessibilityPanelComponent defaults `container` to document.body, but the a11y-* effect
// classes only take effect on elements carrying `a11y-target` (see a11y-effects.css) — no
// wrapper adds this automatically for React/Angular consumers (only the embed script does).
// Adding it once here, before bootstrap, is the simplest correct setup for "target the whole
// page", which is what most real integrations want.
document.body.classList.add('a11y-target');

bootstrapApplication(AppComponent).catch((err) => console.error(err));
