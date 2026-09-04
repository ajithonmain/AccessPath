# @accesspath/wordpress

The AccessPath WordPress plugin. It enqueues the `@accesspath/embed` widget into
`wp_footer` and exposes its options on a **Settings → AccessPath** page built with
the WordPress Settings API.

This is **not** an npm package — it is a PHP plugin. It lives in the monorepo so
the bundled `embed.js` stays in lockstep with `packages/embed`.

## Layout

```
plugin/                         the shippable plugin (zipped as accesspath/)
  accesspath.php                plugin header + bootstrap
  uninstall.php                 deletes the option
  readme.txt                    WordPress.org readme
  includes/
    class-accesspath-config.php    defaults, value lists, sanitizer
    class-accesspath-frontend.php  wp_enqueue_scripts + script_loader_tag filter
    class-accesspath-settings.php  admin screen
  assets/
    embed.js                    synced from packages/embed/dist (gitignored)
scripts/
  sync-embed.mjs                copies the built embed bundle in
  build-zip.mjs                 stages plugin/ as accesspath/ and zips it
assets-wp-org/                  WordPress.org SVN assets/ (icon, banner, screenshots) —
                                 not part of the plugin zip, pushed to SVN by hand
```

## Build

```
npm run build:embed                         # produce packages/embed/dist/embed.js
npm run build -w @accesspath/wordpress       # sync-embed + build dist/accesspath.zip
```

`dist/accesspath.zip` unpacks to `wp-content/plugins/accesspath/`. Upload it via
**Plugins → Add New → Upload Plugin**, or unzip it into a local WordPress install.

## Tests

| Command | What |
|---|---|
| `npm run lint:php -w @accesspath/wordpress` | `php -l` over every PHP file |
| `npm run test -w @accesspath/wordpress` | `tests/render-test.php` — stubs the handful of WP functions the plugin uses, asserts the script-tag output and the sanitizer. No WordPress needed. |
| `npm run test:wp -w @accesspath/wordpress` | `tests/smoke.sh` — downloads WordPress, builds a throwaway SQLite install, activates the plugin, and drives it with Playwright (`tests/smoke.mjs`): front-page script tag, widget mount, panel open, settings page, save round-trip, disable toggle. Needs `php`, `playwright`, `curl`, `unzip`, and network. |
| `tests/screenshots.sh` | Same throwaway-WordPress setup as `smoke.sh`, but captures the two WordPress.org listing screenshots (`tests/screenshots.mjs`) into `assets-wp-org/screenshot-{1,2}.png` instead of asserting. Run manually before a release. |
| `node assets-wp-org/build-graphics.mjs` | Renders `icon-128x128.png`, `icon-256x256.png`, `banner-772x250.png`, `banner-1544x500.png` from the brand logo/palette via headless Chromium. No WordPress needed. |

Verified end to end against real WordPress (SQLite) with Playwright on 2026-09-04:
all 20 smoke checks pass, zero PHP notices from the plugin, zero browser console
errors.

## Keeping value lists in sync

`class-accesspath-config.php` restates constants that live in the TypeScript
source:

| PHP method | Source of truth |
|---|---|
| `positions()` | `VALID_POSITIONS` — `packages/embed/src/index.ts` |
| `shapes()` | `VALID_SHAPES` — `packages/embed/src/index.ts` |
| `icons()` | `VALID_ICONS` — `packages/embed/src/index.ts` |
| `locales()` | `VALID_LOCALES` — `packages/embed/src/index.ts` |
| `profiles()` | `PROFILES` — `packages/core/src/profiles.ts` |
| `defaults()['storage_key']` | `DEFAULT_STORAGE_KEY` — `packages/core/src/profiles.ts` |

Update them here whenever those change (see `RELEASING.md` §0).

## Filters

- `accesspath_should_render` — `bool` — return `false` to suppress the widget on a
  given request.
- `accesspath_data_attributes` — `array<string,string>` — the final `data-*`
  name/value map for the script tag.
