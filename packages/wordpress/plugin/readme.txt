=== AccessPath — Accessibility Widget ===
Contributors: accesspath
Tags: accessibility, a11y, wcag, accessibility widget, ada
Requires at least: 5.8
Tested up to: 7.1
Requires PHP: 7.2
Stable tag: 0.1.0
License: MIT
License URI: https://opensource.org/licenses/MIT

A free, open-source accessibility control panel: text size, contrast, motion, dyslexia font, and 9 one-tap profiles.

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

AccessPath makes no external connections. The widget script is served entirely
from a copy bundled with this plugin — it never loads from a third-party CDN or
phones home anywhere.

== Installation ==

1. Install and activate the plugin.
2. Go to **Settings → AccessPath**.
3. Adjust the options and save. The widget appears on your site immediately.

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
  language, profile selection, storage key, and the optional WCAG checker
  section. Widget script is always self-hosted, no third-party CDN.
