#!/usr/bin/env node
// Guards against the config reference in the docs drifting from the actual source.
//
// The attribute names, defaults, and value lists live in three places that are NOT
// generated from each other:
//   - packages/core/src/{profiles,panel-dom}.ts + packages/embed/src/index.ts  (source of truth)
//   - packages/site/integration-guide.html                                     (human docs)
//   - packages/site/public/llms-full.txt                                       (AI docs)
//
// This script reads the canonical values from source and fails if either doc file
// disagrees or still mentions a known-stale value. Run it before every release
// (it's wired into `npm run check` / pre-publish — see RELEASING.md).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const profilesTs = read('packages/core/src/profiles.ts');
const panelTs = read('packages/core/src/panel-dom.ts');
const embedTs = read('packages/embed/src/index.ts');
const scannerTs = read('packages/core/src/a11y-scanner.ts');
const guide = read('packages/site/integration-guide.html');
const llms = read('packages/site/public/llms-full.txt');

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

// --- canonical values from source -------------------------------------------------
const profileKeys = [...profilesTs.matchAll(/^\s*'([a-z-]+)':\s*\{/gm)].map((m) => m[1]);
const uniqueProfileKeys = [...new Set(profileKeys)];
const storageKey = profilesTs.match(/DEFAULT_STORAGE_KEY\s*=\s*'([^']+)'/)?.[1];
const legacyStorageKey = profilesTs.match(/LEGACY_STORAGE_KEY\s*=\s*'([^']+)'/)?.[1];
const defaultSections = panelTs.match(/DEFAULT_SECTION_ORDER[^=]*=\s*\[([^\]]+)\]/)?.[1]
  ?.match(/'([a-z]+)'/g)?.map((s) => s.replace(/'/g, ''));
const controlCats = panelTs.match(/DEFAULT_CONTROL_CATEGORIES[^=]*=\s*\[([^\]]+)\]/)?.[1]
  ?.match(/'([a-z]+)'/g)?.map((s) => s.replace(/'/g, ''));
const positions = embedTs.match(/VALID_POSITIONS[^=]*=\s*\[([^\]]+)\]/)?.[1]?.match(/'([a-z-]+)'/g)?.map((s) => s.replace(/'/g, ''));
const shapes = embedTs.match(/VALID_SHAPES[^=]*=\s*\[([^\]]+)\]/)?.[1]?.match(/'([a-z-]+)'/g)?.map((s) => s.replace(/'/g, ''));
const icons = embedTs.match(/VALID_ICONS[^=]*=\s*\[([^\]]+)\]/)?.[1]?.match(/'([a-z-]+)'/g)?.map((s) => s.replace(/'/g, ''));
const locales = embedTs.match(/VALID_LOCALES[^=]*=\s*\[([^\]]+)\]/)?.[1]?.match(/'([a-z-]+)'/g)?.map((s) => s.replace(/'/g, ''));
const dataAttrs = [...new Set([...embedTs.matchAll(/ds\['([a-zA-Z]+)'\]/g)].map((m) => m[1]))]
  .map((c) => 'data-' + c.replace(/([A-Z])/g, '-$1').toLowerCase());

check(uniqueProfileKeys.length === 9, `expected 9 profile keys in profiles.ts, found ${uniqueProfileKeys.length}: ${uniqueProfileKeys}`);
check(!!storageKey, 'could not read DEFAULT_STORAGE_KEY from profiles.ts');

// --- every profile key must appear in both doc files ------------------------------
for (const key of uniqueProfileKeys) {
  check(guide.includes(key), `integration-guide.html is missing profile key "${key}"`);
  check(llms.includes(key), `llms-full.txt is missing profile key "${key}"`);
}

// --- profile count phrasing ------------------------------------------------------
for (const [name, txt] of [['integration-guide.html', guide], ['llms-full.txt', llms]]) {
  check(!/all 6\b|6 preset profile|six preset profile/i.test(txt), `${name} still says "6 profiles" — should be ${uniqueProfileKeys.length}`);
  check(new RegExp(`all ${uniqueProfileKeys.length}\\b`).test(txt), `${name} does not say "all ${uniqueProfileKeys.length}" for the profile default`);
}

// --- storage key default --------------------------------------------------------
for (const [name, txt] of [['integration-guide.html', guide], ['llms-full.txt', llms]]) {
  check(txt.includes(storageKey), `${name} never mentions the real default storageKey "${storageKey}"`);
  if (legacyStorageKey) {
    // the legacy key may be mentioned as history, but not as "Default"
    check(!new RegExp(`Default[^|]*<code>${legacyStorageKey}</code>|default[^.]*\`${legacyStorageKey}\``).test(txt),
      `${name} lists "${legacyStorageKey}" as a default — the real default is "${storageKey}"`);
  }
}

// --- value lists: each value present in both docs -------------------------------
const lists = { positions, shapes, icons, locales, defaultSections, controlCats };
for (const [label, values] of Object.entries(lists)) {
  if (!values) { errors.push(`could not parse ${label} from source`); continue; }
  for (const v of values) {
    check(guide.includes(v), `integration-guide.html missing ${label} value "${v}"`);
    check(llms.includes(v), `llms-full.txt missing ${label} value "${v}"`);
  }
}

// --- every embed data-* attribute documented in the guide ----------------------
for (const attr of dataAttrs) {
  check(guide.includes(attr), `integration-guide.html does not document embed attribute "${attr}"`);
}

// --- audit section: opt-in, mentioned ------------------------------------------
check(/audit/i.test(guide) && /audit/i.test(llms), 'the opt-in "audit" section is not documented in both files');

// --- scanner rule count -------------------------------------------------------
// a11y-scanner.ts is the source of truth for the rule list; each rule is `{ id: '...' `.
// The docs restate the count in prose ("an on-page WCAG scan (N rules ...)"), which drifts
// silently every time a rule batch lands. Guard the number and the known-stale phrasings.
const scannerRuleCount = [...scannerTs.matchAll(/^\s*(?:id|ID):\s*'[a-z0-9-]+'/gm)].length;
check(scannerRuleCount > 0, 'could not count scanner rules in a11y-scanner.ts');
for (const [name, txt] of [['integration-guide.html', guide], ['llms-full.txt', llms]]) {
  check(!/~?\s*44\s+rules|~?\s*12\s+checks/i.test(txt),
    `${name} still cites a stale scanner rule count (44 rules / 12 checks) — the real count is ${scannerRuleCount}`);
  check(new RegExp(`\\b${scannerRuleCount}\\s+rules\\b`).test(txt),
    `${name} does not state the real scanner rule count ("${scannerRuleCount} rules")`);
}

// --- report ------------------------------------------------------------------
if (errors.length) {
  console.error('\n✗ docs are out of sync with source:\n');
  for (const e of errors) console.error('  - ' + e);
  console.error(`\n${errors.length} problem(s). Fix packages/site/integration-guide.html and/or packages/site/public/llms-full.txt.\n`);
  process.exit(1);
}
console.log('✓ docs in sync with source');
console.log(`  profiles: ${uniqueProfileKeys.length} | storageKey default: ${storageKey} | sections: ${defaultSections?.join(',')} | data-* attrs: ${dataAttrs.length}`);
