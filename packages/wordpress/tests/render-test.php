<?php
/**
 * Standalone smoke test for the tag-rendering and sanitizer logic — no WordPress
 * required. Stubs the handful of WP functions the plugin touches, then asserts.
 *
 * Run: php packages/wordpress/tests/render-test.php
 *
 * @package AccessPath
 */

// --- minimal WordPress shims ------------------------------------------------

$GLOBALS['__wp_option'] = array();

function get_option( $name ) {
	return isset( $GLOBALS['__wp_option'][ $name ] ) ? $GLOBALS['__wp_option'][ $name ] : false;
}
function add_option( $name, $value ) {
	$GLOBALS['__wp_option'][ $name ] = $value;
}
function update_option( $name, $value ) {
	$GLOBALS['__wp_option'][ $name ] = $value;
}
function wp_parse_args( $args, $defaults ) {
	return array_merge( $defaults, is_array( $args ) ? $args : array() );
}
function __( $text, $domain = 'default' ) {
	return $text;
}
function esc_attr( $text ) {
	return htmlspecialchars( (string) $text, ENT_QUOTES );
}
function sanitize_text_field( $str ) {
	return trim( preg_replace( '/[\r\n\t ]+/', ' ', wp_strip_all_tags( (string) $str ) ) );
}
function wp_strip_all_tags( $str ) {
	return trim( preg_replace( '/<[^>]*>/', '', (string) $str ) );
}
function apply_filters( $hook, $value ) {
	return $value;
}
function add_action() {}
function add_filter() {}
function wp_enqueue_script() {}
function selected( $a, $b, $echo = true ) {
	return (string) $a === (string) $b ? " selected='selected'" : '';
}
function checked( $a, $b = true, $echo = true ) {
	return $a == $b ? " checked='checked'" : '';
}

define( 'ABSPATH', __DIR__ . '/' );
define( 'ACCESSPATH_VERSION', '0.1.0' );
define( 'ACCESSPATH_FILE', __DIR__ . '/../plugin/accesspath.php' );
define( 'ACCESSPATH_URL', 'https://example.test/wp-content/plugins/accesspath/' );
define( 'ACCESSPATH_OPTION', 'accesspath_settings' );
define( 'ACCESSPATH_CDN_URL', 'https://cdn.jsdelivr.net/npm/@accesspath/embed@0/dist/embed.js' );

require __DIR__ . '/../plugin/includes/class-accesspath-config.php';
require __DIR__ . '/../plugin/includes/class-accesspath-frontend.php';

// --- assertions -----------------------------------------------------------

$failures = 0;
function check( $label, $cond ) {
	global $failures;
	if ( $cond ) {
		echo "  ok   $label\n";
	} else {
		echo "  FAIL $label\n";
		$failures++;
	}
}

function render_tag( array $opts ) {
	$GLOBALS['__wp_option'][ ACCESSPATH_OPTION ] = $opts;
	$tag = "<script src='https://example.test/wp-content/plugins/accesspath/assets/embed.js' id='accesspath-embed-js'></script>";
	return AccessPath_Frontend::filter_tag( $tag, 'accesspath-embed' );
}

echo "defaults -> minimal tag\n";
$tag = render_tag( AccessPath_Config::defaults() );
check( 'has defer', strpos( $tag, '<script defer ' ) === 0 );
check( 'no data-theme (light is default)', strpos( $tag, 'data-theme' ) === false );
check( 'no data-position (bottom-right is default)', strpos( $tag, 'data-position' ) === false );
check( 'no data-storage-key (default key)', strpos( $tag, 'data-storage-key' ) === false );

echo "customized -> attributes present\n";
$tag = render_tag(
	array(
		'theme'        => 'dark',
		'position'     => 'top-left',
		'shape'        => 'pill',
		'icon'         => 'motor',
		'draggable'    => true,
		'brand'        => '#ff0000',
		'storage_key'  => 'my-key',
		'locale'       => 'fr',
		'profiles'     => array( 'low-vision', 'dyslexia' ),
		'show_checker' => true,
	)
);
check( 'data-theme="dark"', strpos( $tag, 'data-theme="dark"' ) !== false );
check( 'data-position="top-left"', strpos( $tag, 'data-position="top-left"' ) !== false );
check( 'data-shape="pill"', strpos( $tag, 'data-shape="pill"' ) !== false );
check( 'data-icon="motor"', strpos( $tag, 'data-icon="motor"' ) !== false );
check( 'data-draggable="true"', strpos( $tag, 'data-draggable="true"' ) !== false );
check( 'data-brand="#ff0000"', strpos( $tag, 'data-brand="#ff0000"' ) !== false );
check( 'data-storage-key="my-key"', strpos( $tag, 'data-storage-key="my-key"' ) !== false );
check( 'data-locale="fr"', strpos( $tag, 'data-locale="fr"' ) !== false );
check( 'data-profiles="low-vision,dyslexia"', strpos( $tag, 'data-profiles="low-vision,dyslexia"' ) !== false );
check( 'checker adds audit section', strpos( $tag, 'data-sections="profiles,quick,controls,actions,audit"' ) !== false );

echo "other handles untouched\n";
$other = AccessPath_Frontend::filter_tag( "<script src='x.js'></script>", 'jquery' );
check( 'non-matching handle passthrough', $other === "<script src='x.js'></script>" );

echo "sanitizer rejects junk\n";
$clean = AccessPath_Config::sanitize(
	array(
		'position'    => 'no-such-position',
		'shape'       => '<script>',
		'brand'       => 'red',
		'storage_key' => 'ok key/../x',
		'profiles'    => array( 'low-vision', 'not-a-profile' ),
		'enabled'     => '1',
	)
);
check( 'bad position -> default', $clean['position'] === 'bottom-right' );
check( 'bad shape -> default', $clean['shape'] === 'circle' );
check( 'non-hex brand -> empty', $clean['brand'] === '' );
check( 'storage key stripped to safe chars', $clean['storage_key'] === 'okkey..x' );
check( 'unknown profile dropped', $clean['profiles'] === array( 'low-vision' ) );
check( 'enabled coerced to bool true', $clean['enabled'] === true );

echo "\n" . ( $failures ? "$failures failure(s)\n" : "all passed\n" );
exit( $failures ? 1 : 0 );
