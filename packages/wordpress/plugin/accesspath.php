<?php
/**
 * Plugin Name:       AccessPath — Accessibility Widget
 * Plugin URI:        https://accesspath-6ur.pages.dev/wordpress.html
 * Description:        Adds the AccessPath accessibility control panel (text size, contrast, motion, dyslexia font, 9 profiles, and more) to your site. Configure it from Settings → AccessPath. Free and open source — not automated compliance.
 * Version:           0.1.0
 * Requires at least: 5.8
 * Requires PHP:      7.2
 * Author:            AccessPath
 * Author URI:        https://accesspath-6ur.pages.dev/
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       accesspath
 * Domain Path:       /languages
 *
 * @package AccessPath
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ACCESSPATH_VERSION', '0.1.0' );
define( 'ACCESSPATH_FILE', __FILE__ );
define( 'ACCESSPATH_DIR', plugin_dir_path( __FILE__ ) );
define( 'ACCESSPATH_URL', plugin_dir_url( __FILE__ ) );
define( 'ACCESSPATH_OPTION', 'accesspath_settings' );

require_once ACCESSPATH_DIR . 'includes/class-accesspath-config.php';
require_once ACCESSPATH_DIR . 'includes/class-accesspath-frontend.php';

if ( is_admin() ) {
	require_once ACCESSPATH_DIR . 'includes/class-accesspath-settings.php';
	add_action( 'plugins_loaded', array( 'AccessPath_Settings', 'init' ) );
}

add_action( 'plugins_loaded', array( 'AccessPath_Frontend', 'init' ) );

/**
 * Seed default options on activation so the widget works immediately without a
 * trip to the settings page.
 */
register_activation_hook(
	__FILE__,
	static function () {
		if ( false === get_option( ACCESSPATH_OPTION ) ) {
			add_option( ACCESSPATH_OPTION, AccessPath_Config::defaults() );
		}
		// Shown once on the next admin screen load, then cleared — see
		// AccessPath_Settings::maybe_show_activation_notice(). Not a redirect to a
		// setup wizard: WordPress.org review guidelines discourage hijacking the
		// admin on activation, and the widget already works with zero configuration.
		set_transient( 'accesspath_show_activation_notice', 1, MINUTE_IN_SECONDS );
	}
);
