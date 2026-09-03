import { Component } from '@angular/core';
import { AccessibilityPanelComponent } from '@accesspath/angular';

const STORAGE_KEY = 'accesspath-angular-demo';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AccessibilityPanelComponent],
  template: `
    <div class="page">
      <header>
        <h1>AccessPath — Angular demo</h1>
        <div class="actions">
          <button type="button" (click)="isDarkTheme = !isDarkTheme">
            {{ isDarkTheme ? 'Light theme' : 'Dark theme' }}
          </button>
          <button type="button" (click)="a11yPanel.open()">Open accessibility panel</button>
        </div>
      </header>

      <main>
        <h2>Sample content</h2>
        <p>Toggle a preference in the panel and watch this page change.</p>
        <p><a href="https://angular.dev">A sample link</a>, to try Highlight Links.</p>
        <img
          src="https://angular.io/assets/images/logos/angular/angular.svg"
          width="80"
          alt="Angular logo"
        />
      </main>

      <app-accessibility-panel
        #a11yPanel
        [isDarkTheme]="isDarkTheme"
        [storageKey]="storageKey"
      ></app-accessibility-panel>
    </div>
  `,
  styles: [
    `
      .page { font-family: system-ui, sans-serif; padding: 16px; }
      header { display: flex; justify-content: space-between; align-items: center; }
      .actions { display: flex; gap: 8px; }
      main { margin-top: 16px; padding: 16px; border: 1px solid #e2e2ea; border-radius: 12px; }
    `,
  ],
})
export class AppComponent {
  isDarkTheme = false;
  readonly storageKey = STORAGE_KEY;
}
