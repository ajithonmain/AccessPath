# Releasing AccessPath

Checklist for cutting a new version of the `@accesspath/*` packages and updating the site.
Work top to bottom. Nothing here is automated end-to-end — that's deliberate; each step is
cheap and the failure modes are subtle.

---

## 0. Source of truth — where each fact lives

If you change one of these, the docs that restate it (below) must change too. `npm run check`
catches most drift; the rest is on you.

| Fact | Defined in |
|---|---|
| Profile keys, labels, and what each bundle turns on | `packages/core/src/profiles.ts` (`PROFILES`, `PROFILE_LABELS`) |
| Default `storageKey` | `packages/core/src/profiles.ts` (`DEFAULT_STORAGE_KEY`) |
| Default section order, control categories | `packages/core/src/panel-dom.ts` (`DEFAULT_SECTION_ORDER`, `DEFAULT_CONTROL_CATEGORIES`) |
| `audit` section is opt-in | `packages/core/src/panel-dom.ts` (not in `DEFAULT_SECTION_ORDER`) |
| Valid trigger positions / shapes / icons, valid locales | `packages/embed/src/index.ts` (`VALID_*`) |
| Every `data-*` attribute the embed reads | `packages/embed/src/index.ts` (`readConfig`) |
| React props | `packages/react/src/AccessPathPanel.tsx` (`AccessPathPanelProps`) |
| Angular inputs | `packages/angular/src/lib/accessibility-panel.component.ts` (`@Input()`s) |
| CSS effect classes / what they do | `packages/core/styles/a11y-effects.css` |
| Brand tokens (`--ap-*`) | `docs/brand.md` + `packages/core/styles/panel.css` |

**Docs that restate the above (keep in sync):**

- `packages/site/integration-guide.html` — the human-facing reference tables
- `packages/site/public/llms-full.txt` — the AI-facing single-file reference
- `packages/site/index.html` — the "Install & Customize" builder controls + the pasted snippets
- `packages/site/accessibility-guide.html` — profile table + tool list
- `README.md` and the four `packages/*/README.md`
- `accessibility.md`, `docs/features-and-profiles.md` — detailed feature docs

---

## 1. Pre-release checks (verify — don't change anything yet)

- [ ] **`npm run check`** passes — docs config reference matches source (profile keys, storageKey
      default, section/category/position/shape/icon/locale value lists, every `data-*` attr
      documented, `audit` documented as opt-in in both doc files).
- [ ] **`npm run build:all`** succeeds from a clean tree (`rm -rf packages/*/dist dist`).
- [ ] **Counts are consistent** everywhere a number appears:
      - profile count (currently **9**) — grep `grep -rn "profiles" packages/site --include=*.html | grep -iE "[0-9]+ (preset )?profiles"`
      - tool count (currently **30+**)
      - the homepage eyebrow badge (`9 PROFILES · 30+ TOOLS`) and `main.ts`'s `ALL_PROFILE_KEYS`
- [ ] **Browser-test the widget** against the real built packages, all three wrappers:
      - `packages/embed/demo/` served over `http://` — open panel, every profile, every control
        (check computed styles, not just that it toggles), Tab cycle, Escape, focus return
      - `npm run demo:angular` (→ :4300) and the React demo (→ :5174) — same pass
      - the standalone demos in `../accesspath-demos/` if you keep them — they should use the
        published packages / the `@0` CDN, not local tarballs
      - Especially re-verify anything touched in `packages/core`: font scaling (leaf-only rule),
        contrast/saturation filters, dyslexia font load, the focus trap's repeated-open case
- [ ] **Lighthouse** on the built site, served with gzip (mimics Cloudflare Pages), mobile profile:
      Performance ≥ 90, Accessibility / Best Practices / SEO = 100. Run on `/` and one content page.
- [ ] **JSON-LD** on every site page still parses (`for f in packages/site/*.html; do ... JSON.parse ...`).
- [ ] **No stray `console.error` / pageerror** in any demo.
- [ ] `packages/site` builds and `vite preview` serves without errors; `/llms.txt`, `/llms-full.txt`,
      `/sitemap.xml`, `/robots.txt`, `/404.html` all resolve.

## 2. If this release adds or changes a config option

- [ ] Update the source (see the table in §0).
- [ ] Update **`packages/site/integration-guide.html`** — the embed table, the React table, the
      Angular table, and the value-list section (`#ref-*`).
- [ ] Update **`packages/site/public/llms-full.txt`** — the config table, the value lists,
      `CustomActionConfig`, and any prose that names the option.
- [ ] Update the **homepage builder** (`packages/site/index.html` control markup +
      `packages/site/src/builder.ts` — `BuilderState`, `queryBuilderEls`, `generateBuilderCode`,
      `syncPreviewWidget`, and the change listener) so the generated snippet and live preview
      cover it.
- [ ] Update **`accessibility-guide.html`** if it's a profile or a visible tool.
- [ ] Update the relevant **README(s)**.
- [ ] `npm run check` must still pass (extend `scripts/check-docs-sync.mjs` if you added a new
      value list worth guarding).

## 3. Version bump

- [ ] Decide the bump (patch / minor / major) per semver. A doc-only or metadata-only change is
      still a patch if it ships in a package (`keywords`, `homepage`, a README).
- [ ] Bump **all four** `packages/{core,embed,react,angular}/package.json` `version` to the same
      number.
- [ ] Update the cross-dep ranges: `embed` / `react` / `angular` each depend on
      `@accesspath/core` — bump their `dependencies` / `peerDependencies` `@accesspath/core`
      range to `^<new version>`.
- [ ] `npm run check && npm run build:all` once more after the bump.
- [ ] Commit: `Release X.Y.Z: <one line>`.

## 4. Publish to npm

Order matters — `core` first; the others `build:core` again but resolve the just-published core
for their own dep. Each prompts for your npm 2FA OTP.

```
npm run publish:core
npm run publish:embed
npm run publish:react
npm run publish:angular
```

- [ ] `npm view @accesspath/core version` (and embed/react/angular) all print the new version.
- [ ] `curl -sSI "https://cdn.jsdelivr.net/npm/@accesspath/embed@0/dist/embed.js"` → 200, and
      the served file's header comment names the new version (jsDelivr can lag a few minutes).

## 5. Tag + GitHub release

`.github/workflows/release.yml` creates the GitHub release automatically as soon as a
`vX.Y.Z` tag is pushed (auto-generated notes from commits since the last tag) — so
pushing the tag is the only manual step left here:

```
git tag vX.Y.Z
git push origin vX.Y.Z
```

- [ ] Check the Actions tab for the "GitHub release" run, then the release itself —
      auto-generated notes are a starting point; edit in the release's own page if the
      commit list needs more context (install snippet, migration notes, etc).
- [ ] "Set as latest release" (usually automatic for the newest semver tag, but verify).

## 6. Deploy the site

- [ ] The push to `main` triggers Cloudflare Pages. Confirm the build went **green** in the
      Cloudflare dashboard (it can lag the push by a minute or two).
- [ ] Spot-check live: `/`, `/integration-guide.html`, `/react.html`, `/wordpress.html`,
      `/vs-userway.html`, `/llms.txt`, `/llms-full.txt` — all 200, no console errors, the site's
      own widget opens.
- [ ] `packages/site` serves the real embed build (`scripts/sync-embed.mjs` runs in its
      `dev`/`build`). If you changed `packages/embed`, the site's `public/embed.js` copy is
      regenerated on the next site build — don't ship a stale one.

## 7. Post-release

- [ ] Google Search Console / Bing Webmaster — resubmit `sitemap.xml` if pages were added.
- [ ] If a `data-*` attribute or prop was added, the `llms-full.txt` "Configuration reference"
      table is the one an AI agent will paste from — double-check it one more time.
- [ ] Update `todo.md` / close the issue.

---

## Notes / gotchas

- **`@accesspath/core` resolves via `dist/`, not TS path-mapping**, for the Angular library
  (`ng-packagr` enforces a self-contained `rootDir`). Build order is always
  core → {embed, react, angular, site}.
- **The demos are not in this repo's git** (`../accesspath-demos/`). If you keep using them as a
  publish smoke-test, remember to `rm -rf node_modules package-lock.json && npm install` there so
  they pull the newly published versions.
- **Custom domain**: canonical/OG/sitemap/JSON-LD URLs are hardcoded to
  `https://accesspath-6ur.pages.dev`. If you attach `accesspath.dev`, rewrite them all (one
  sweep across `packages/site/*.html` + `public/sitemap.xml` + `public/robots.txt` + the
  `packages/*/package.json` `homepage` fields + `llms*.txt`) and set up a 301 from pages.dev.
- **`packages/core` ships on arbitrary third-party pages.** A fix tuned to `packages/site`'s
  specific markup belongs in `packages/site`, not core. See `CLAUDE.md`.
