=== AccessPath — Accessibility Widget ===
Contributors: accesspath
Tags: accessibility, a11y, wcag, accessibility widget, ada
Requires at least: 5.8
Tested up to: 7.1
Requires PHP: 7.2
Stable tag: 0.1.0
License: MIT
License URI: https://opensource.org/licenses/MIT

A free, open-source accessibility control panel for your site: text size, contrast, motion, dyslexia font, 9 profiles, and more. No account, no per-visitor fees.

== Description ==

AccessPath adds a floating accessibility button to your site. Visitors open it to
adjust how your pages look and behave for their own needs:

* Text size, line height, letter and word spacing
* Contrast, saturation, monochrome, invert, color-blind simulation
* Pause animations, mute sound
* Dyslexia-friendly font
* Read aloud and a page reader (Voice Over)
* Reading guide, link/heading highlighting, big cursor, hide images
* Nine one-tap profiles (Low Vision, Dyslexia, Seizure Safe, Motor Impaired,
  Color Blind, ADHD, Voice Over, Elderly, Cognitive & Learning)

Each visitor's choices are saved in their own browser. Nothing is sent to a
server, there are no cookies, and there is no analytics or tracking.

You configure the widget from **Settings → AccessPath**: position, shape, icon,
brand color, panel theme, language, and which profiles to show.

= Not automated compliance =

AccessPath is a user-controlled presentation layer. It does **not** fix missing
alt text, poor heading structure, unlabeled forms, or keyboard traps, and it does
not make a site "ADA compliant" or "WCAG compliant" on its own. Be skeptical of
any product that claims otherwise. Treat this as one helpful layer on top of real
accessibility work.

= Open source =

Source code, issues, and the framework-agnostic core (also available as a plain
script tag, a React component, and an Angular component) are on GitHub:
https://github.com/ajithonmain/AccessPath

== External services ==

By default AccessPath loads its widget script from your own site (self-hosted) and
makes no external connections. It offers **one optional** setting that calls a
third-party service:

**jsDelivr CDN (opt-in, off by default)**

On **Settings → AccessPath**, "Load the script from" can be switched from
"Self-hosted" to "jsDelivr CDN". If you turn this on, visitor browsers load
`https://cdn.jsdelivr.net/npm/@accesspath/embed@0/dist/embed.js` directly from
jsDelivr instead of a file on your own server. This sends the visitor's IP
address and browser user-agent to jsDelivr (a CDN operated by Prospect One /
Fastly) as an ordinary HTTP request for that file — no other data is sent, and
this happens only for the script file itself, not on every subsequent
interaction with the widget.

jsDelivr Terms of Service: https://www.jsdelivr.com/terms
jsDelivr Privacy Policy: https://www.jsdelivr.com/privacy-policy-jsdelivr-net

== Installation ==

1. Install and activate the plugin.
2. Go to **Settings → AccessPath**.
3. Adjust the options and save. The widget appears on your site immediately.

The plugin ships a self-hosted copy of the widget script; nothing loads from a
third-party CDN unless you switch "Load the script from" to jsDelivr.

== Frequently Asked Questions ==

= Does it slow my site down? =

The script is small, loads with `defer`, and makes no external network calls after
it loads. It does not touch PHP execution, the database, or page-generation time.

= Does it collect visitor data? =

No. No analytics, no cookies, no tracking. Preferences live only in each visitor's
own browser `localStorage`.

= Will it work with my theme or page builder? =

Yes. The widget renders above the page via `wp_footer`, so it is independent of
your theme, the block editor, Elementor, Divi, Beaver Builder, Bricks, and
classic themes.

= Can developers customize the output? =

Yes. Filters: `accesspath_should_render` (bool) and `accesspath_data_attributes`
(array of `data-*` name/value pairs).

= Does it make my site compliant? =

No. See "Not automated compliance" above.

== Screenshots ==

1. The AccessPath panel open on the front end, with the profile grid and
   controls visible.
2. The Settings → AccessPath admin screen: position, shape, icon, brand color,
   theme, language, and profile selection.

== Changelog ==

= 0.1.0 =
* First release. Settings page for position, shape, icon, brand color, theme,
  language, profile selection, storage key, self-hosted vs CDN, and the optional
  WCAG checker section.
