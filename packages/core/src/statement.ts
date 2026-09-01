import { ProfileKey } from './types';
import { PROFILE_LABELS, PROFILES } from './profiles';

export interface StatementConfig {
  siteName?: string;
  /** Which preset profiles are exposed to visitors. Defaults to all 6. */
  profiles?: ProfileKey[];
}

const FEATURE_CATEGORIES = [
  'Vision Adjustment — high contrast, color inversion, saturation control',
  'Content Adjustment — text size, spacing, line height, dyslexia-friendly font',
  'Motion — pause animations, honors OS-level prefers-reduced-motion',
  'Reading — read aloud, dictionary lookups, highlight links, hide images, large cursor, text alignment',
  'Navigation — jump-to list of the page’s heading structure',
  'Focus — reading guide overlay to isolate one line of text at a time',
];

/** Pure function — no DOM, no network access. Produces a static HTML statement a host app
 *  can render on its own accessibility statement page. Not wired into the panel UI. */
export function generateStatement(config: StatementConfig = {}): string {
  const siteName = config.siteName ?? 'this site';
  const profileKeys = config.profiles ?? (Object.keys(PROFILES) as ProfileKey[]);
  const profileItems = profileKeys.map((key) => `<li>${PROFILE_LABELS[key]}</li>`).join('');
  const featureItems = FEATURE_CATEGORIES.map((f) => `<li>${f}</li>`).join('');

  return `<section class="accesspath-statement">
  <h2>Accessibility Statement</h2>
  <p>${siteName} provides visitors with AccessPath, an accessibility control panel that lets you
  personalize how content is presented, targeting WCAG 2.1 AA. These preferences are stored only
  in your browser and can be reset at any time.</p>
  <h3>Preset profiles</h3>
  <ul>${profileItems}</ul>
  <h3>Individual controls</h3>
  <ul>${featureItems}</ul>
</section>`;
}
