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
```

## Build

```
npm run build:embed                         # produce packages/embed/dist/embed.js
npm run build -w @accesspath/wordpress       # sync-embed + build dist/accesspath.zip
```

`dist/accesspath.zip` unpacks to `wp-content/plugins/accesspath/`. Upload it via
**Plugins → Add New → Upload Plugin**, or unzip it into a local WordPress install.

`npm run lint:php -w @accesspath/wordpress` runs `php -l` over every PHP file
(requires a local `php` binary).

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
