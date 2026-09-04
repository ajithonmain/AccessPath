# @accesspath/embed

Drop-in accessibility widget for any website via a single `<script>` tag. No build step, no
framework required — works on plain HTML, WordPress, and Shopify sites.

> **AI assistant / coding agent?** Full copy-paste reference: https://accesspath-6ur.pages.dev/llms-full.txt

## Usage

### Self-hosted

Copy `node_modules/@accesspath/embed/dist/embed.js` (or download it from a release) to your
own server and point a script tag at it:

```html
<script src="/embed.js"
        data-profiles="dyslexia,motor,low-vision"
        data-theme="light"
        data-storage-key="accesspath-prefs"
        data-position="bottom-right">
</script>
```

### CDN (no install needed)

```html
<script src="https://cdn.jsdelivr.net/npm/@accesspath/embed/dist/embed.js"></script>
```

Every `data-*` attribute is optional. See the
[full attribute reference](https://github.com/ajithonmain/AccessPath#adding-the-script-tag-no-build-step)
in the main repo README.

## Links

- [GitHub repo](https://github.com/ajithonmain/AccessPath)
- [MIT License](./LICENSE)
