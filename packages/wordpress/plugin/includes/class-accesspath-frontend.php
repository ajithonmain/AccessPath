<?php
/**
 * Front-end output: enqueue the embed bundle and attach the data-* attributes
 * the script reads from its own tag.
 *
 * @package AccessPath
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers the widget script on the public site.
 */
final class AccessPath_Frontend {

	const HANDLE = 'accesspath-embed';

	/**
	 * Hook registration.
	 */
	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_filter( 'script_loader_tag', array( __CLASS__, 'filter_tag' ), 10, 2 );
	}

	/**
	 * Whether the widget should render on the current request.
	 *
	 * @return bool
	 */
	private static function should_render() {
		$opts = AccessPath_Config::get();

		/**
		 * Filter whether the AccessPath widget renders on this request.
		 *
		 * @param bool  $render Whether to render.
		 * @param array $opts   Resolved plugin options.
		 */
		return (bool) apply_filters( 'accesspath_should_render', ! empty( $opts['enabled'] ), $opts );
	}

	/**
	 * Enqueue the bundle (self-hosted copy or the pinned CDN URL).
	 */
	public static function enqueue() {
		if ( ! self::should_render() ) {
			return;
		}

		$opts = AccessPath_Config::get();
		$src  = ( 'cdn' === $opts['source'] )
			? ACCESSPATH_CDN_URL
			: ACCESSPATH_URL . 'assets/embed.js';
		$ver  = ( 'cdn' === $opts['source'] ) ? null : ACCESSPATH_VERSION;

		wp_enqueue_script( self::HANDLE, $src, array(), $ver, true );
	}

	/**
	 * Attach the data-* attributes and defer to the widget's own <script> tag.
	 *
	 * @param string $tag    The full <script> HTML.
	 * @param string $handle Script handle.
	 * @return string
	 */
	public static function filter_tag( $tag, $handle ) {
		if ( self::HANDLE !== $handle ) {
			return $tag;
		}

		$attrs = self::data_attributes( AccessPath_Config::get() );
		$attr_html = ' defer';
		foreach ( $attrs as $name => $value ) {
			$attr_html .= sprintf( ' %s="%s"', esc_attr( $name ), esc_attr( $value ) );
		}

		// Insert the attributes right after `<script `.
		return preg_replace( '/^<script /', '<script' . $attr_html . ' ', $tag, 1 );
	}

	/**
	 * Build the data-* attribute map from resolved options. Only non-default,
	 * meaningful values are emitted so the tag stays minimal.
	 *
	 * @param array $opts Resolved options.
	 * @return array<string,string>
	 */
	private static function data_attributes( $opts ) {
		$attrs = array();

		if ( 'dark' === $opts['theme'] ) {
			$attrs['data-theme'] = 'dark';
		}
		if ( 'accesspath-prefs' !== $opts['storage_key'] ) {
			$attrs['data-storage-key'] = $opts['storage_key'];
		}
		if ( 'bottom-right' !== $opts['position'] ) {
			$attrs['data-position'] = $opts['position'];
		}
		if ( 'circle' !== $opts['shape'] ) {
			$attrs['data-shape'] = $opts['shape'];
		}
		if ( 'accessibility' !== $opts['icon'] ) {
			$attrs['data-icon'] = $opts['icon'];
		}
		if ( ! empty( $opts['draggable'] ) ) {
			$attrs['data-draggable'] = 'true';
		}
		if ( ! empty( $opts['brand'] ) ) {
			$attrs['data-brand'] = $opts['brand'];
		}
		if ( 'en' !== $opts['locale'] ) {
			$attrs['data-locale'] = $opts['locale'];
		}
		if ( ! empty( $opts['profiles'] ) ) {
			$attrs['data-profiles'] = implode( ',', $opts['profiles'] );
		}
		if ( ! empty( $opts['show_checker'] ) ) {
			$attrs['data-sections'] = 'profiles,quick,controls,actions,audit';
		}

		/**
		 * Filter the final data-* attribute map for the widget script tag.
		 *
		 * @param array $attrs name => value (names include the `data-` prefix).
		 * @param array $opts  Resolved plugin options.
		 */
		return apply_filters( 'accesspath_data_attributes', $attrs, $opts );
	}
}
