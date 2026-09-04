<?php
/**
 * Canonical option defaults, allowed value lists, and the sanitizer.
 *
 * The value lists mirror packages/embed/src/index.ts (VALID_POSITIONS,
 * VALID_SHAPES, VALID_ICONS, VALID_LOCALES) and packages/core/src/profiles.ts
 * (PROFILES). Keep them in sync when those change.
 *
 * @package AccessPath
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Static configuration helpers.
 */
final class AccessPath_Config {

	/**
	 * Default option values.
	 *
	 * @return array<string,mixed>
	 */
	public static function defaults() {
		return array(
			'enabled'      => true,
			'source'       => 'self',           // self | cdn.
			'theme'        => 'light',           // light | dark.
			'position'     => 'bottom-right',
			'shape'        => 'circle',
			'icon'         => 'accessibility',
			'draggable'    => false,
			'brand'        => '',                // empty = leave the widget's own brand color.
			'storage_key'  => 'accesspath-prefs',
			'locale'       => 'en',
			'profiles'     => array(),           // empty = show all.
			'show_checker' => false,             // adds the opt-in 'audit' section.
		);
	}

	/**
	 * Trigger positions the embed accepts.
	 *
	 * @return array<string,string> value => label.
	 */
	public static function positions() {
		return array(
			'bottom-right' => __( 'Bottom right', 'accesspath' ),
			'bottom-left'  => __( 'Bottom left', 'accesspath' ),
			'top-right'    => __( 'Top right', 'accesspath' ),
			'top-left'     => __( 'Top left', 'accesspath' ),
		);
	}

	/**
	 * Trigger shapes.
	 *
	 * @return array<string,string>
	 */
	public static function shapes() {
		return array(
			'circle'         => __( 'Circle', 'accesspath' ),
			'rounded-square' => __( 'Rounded square', 'accesspath' ),
			'pill'           => __( 'Pill', 'accesspath' ),
		);
	}

	/**
	 * Trigger icons.
	 *
	 * @return array<string,string>
	 */
	public static function icons() {
		return array(
			'accessibility' => __( 'Accessibility (person)', 'accesspath' ),
			'motion'        => __( 'Motion', 'accesspath' ),
			'contrast'      => __( 'Contrast', 'accesspath' ),
			'spacing'       => __( 'Spacing', 'accesspath' ),
			'motor'         => __( 'Wheelchair', 'accesspath' ),
			'badge'         => __( 'Badge', 'accesspath' ),
			'logo'          => __( 'AccessPath logo', 'accesspath' ),
		);
	}

	/**
	 * Bundled UI locales.
	 *
	 * @return array<string,string>
	 */
	public static function locales() {
		return array(
			'en' => __( 'English', 'accesspath' ),
			'es' => __( 'Spanish', 'accesspath' ),
			'fr' => __( 'French', 'accesspath' ),
			'de' => __( 'German', 'accesspath' ),
			'pt' => __( 'Portuguese', 'accesspath' ),
		);
	}

	/**
	 * Accessibility profiles (ProfileKey => label).
	 *
	 * @return array<string,string>
	 */
	public static function profiles() {
		return array(
			'low-vision' => __( 'Low Vision', 'accesspath' ),
			'dyslexia'   => __( 'Dyslexia', 'accesspath' ),
			'seizure'    => __( 'Seizure Safe', 'accesspath' ),
			'motor'      => __( 'Motor Impaired', 'accesspath' ),
			'colorblind' => __( 'Color Blind', 'accesspath' ),
			'adhd'       => __( 'ADHD', 'accesspath' ),
			'voice-over' => __( 'Voice Over', 'accesspath' ),
			'elderly'    => __( 'Elderly', 'accesspath' ),
			'cognitive'  => __( 'Cognitive & Learning', 'accesspath' ),
		);
	}

	/**
	 * Read the merged options (stored values on top of defaults).
	 *
	 * @return array<string,mixed>
	 */
	public static function get() {
		$stored = get_option( ACCESSPATH_OPTION );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		return wp_parse_args( $stored, self::defaults() );
	}

	/**
	 * Sanitize a submitted settings array. Registered as the sanitize_callback
	 * for the option, so it also runs on programmatic update_option() from the
	 * settings screen.
	 *
	 * @param mixed $input Raw form input.
	 * @return array<string,mixed>
	 */
	public static function sanitize( $input ) {
		$defaults = self::defaults();
		$input    = is_array( $input ) ? $input : array();
		$out      = array();

		$out['enabled']      = ! empty( $input['enabled'] );
		$out['draggable']    = ! empty( $input['draggable'] );
		$out['show_checker'] = ! empty( $input['show_checker'] );

		$out['source'] = ( isset( $input['source'] ) && 'cdn' === $input['source'] ) ? 'cdn' : 'self';
		$out['theme']  = ( isset( $input['theme'] ) && 'dark' === $input['theme'] ) ? 'dark' : 'light';

		$out['position'] = self::pick( $input, 'position', self::positions(), $defaults['position'] );
		$out['shape']    = self::pick( $input, 'shape', self::shapes(), $defaults['shape'] );
		$out['icon']     = self::pick( $input, 'icon', self::icons(), $defaults['icon'] );
		$out['locale']   = self::pick( $input, 'locale', self::locales(), $defaults['locale'] );

		$brand = isset( $input['brand'] ) ? sanitize_text_field( $input['brand'] ) : '';
		$out['brand'] = ( '' === $brand || preg_match( '/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $brand ) ) ? $brand : '';

		$key = isset( $input['storage_key'] ) ? sanitize_text_field( $input['storage_key'] ) : '';
		$key = preg_replace( '/[^A-Za-z0-9._:-]/', '', $key );
		$out['storage_key'] = '' !== $key ? $key : $defaults['storage_key'];

		$valid_profiles   = array_keys( self::profiles() );
		$chosen           = isset( $input['profiles'] ) && is_array( $input['profiles'] ) ? $input['profiles'] : array();
		$out['profiles']  = array_values( array_intersect( $valid_profiles, array_map( 'sanitize_text_field', $chosen ) ) );

		return $out;
	}

	/**
	 * Return $input[$key] if it's a valid key of $allowed, else $fallback.
	 *
	 * @param array  $input    Input array.
	 * @param string $key      Key to read.
	 * @param array  $allowed  Allowed value => label map.
	 * @param string $fallback Fallback value.
	 * @return string
	 */
	private static function pick( $input, $key, $allowed, $fallback ) {
		$value = isset( $input[ $key ] ) ? sanitize_text_field( $input[ $key ] ) : '';
		return array_key_exists( $value, $allowed ) ? $value : $fallback;
	}
}
