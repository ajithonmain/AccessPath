<?php
/**
 * Settings → AccessPath admin screen, built on the WordPress Settings API.
 *
 * @package AccessPath
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Admin settings page.
 */
final class AccessPath_Settings {

	const GROUP = 'accesspath';
	const PAGE  = 'accesspath';

	/**
	 * Hook registration.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'add_menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'admin_notices', array( __CLASS__, 'maybe_show_activation_notice' ) );
		add_filter(
			'plugin_action_links_' . plugin_basename( ACCESSPATH_FILE ),
			array( __CLASS__, 'action_links' )
		);
	}

	/**
	 * One-time "you're all set" notice after activation, pointing at the
	 * settings page. Not a redirect/wizard — see the comment on the
	 * activation hook in accesspath.php for why.
	 */
	public static function maybe_show_activation_notice() {
		if ( ! get_transient( 'accesspath_show_activation_notice' ) ) {
			return;
		}
		delete_transient( 'accesspath_show_activation_notice' );

		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$url = admin_url( 'options-general.php?page=' . self::PAGE );
		printf(
			'<div class="notice notice-success is-dismissible"><p>%s <a href="%s">%s</a></p></div>',
			esc_html__( 'AccessPath is now live on your site — visitors will see a floating accessibility button.', 'accesspath' ),
			esc_url( $url ),
			esc_html__( 'Customize it', 'accesspath' )
		);
	}

	/**
	 * Add the Settings submenu entry.
	 */
	public static function add_menu() {
		add_options_page(
			__( 'AccessPath', 'accesspath' ),
			__( 'AccessPath', 'accesspath' ),
			'manage_options',
			self::PAGE,
			array( __CLASS__, 'render_page' )
		);
	}

	/**
	 * Add a "Settings" link on the Plugins list row.
	 *
	 * @param array $links Existing action links.
	 * @return array
	 */
	public static function action_links( $links ) {
		$url = admin_url( 'options-general.php?page=' . self::PAGE );
		array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'accesspath' ) . '</a>' );
		return $links;
	}

	/**
	 * Register the option and all fields.
	 */
	public static function register() {
		register_setting(
			self::GROUP,
			ACCESSPATH_OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( 'AccessPath_Config', 'sanitize' ),
				'default'           => AccessPath_Config::defaults(),
			)
		);

		add_settings_section( 'accesspath_main', '', '__return_false', self::PAGE );
		add_settings_section(
			'accesspath_trigger',
			__( 'Trigger button', 'accesspath' ),
			'__return_false',
			self::PAGE
		);
		add_settings_section(
			'accesspath_panel',
			__( 'Panel', 'accesspath' ),
			'__return_false',
			self::PAGE
		);
		add_settings_section(
			'accesspath_advanced',
			__( 'Advanced', 'accesspath' ),
			'__return_false',
			self::PAGE
		);

		$f = static function ( $id, $label, $cb, $section ) {
			add_settings_field( $id, $label, $cb, self::PAGE, $section );
		};

		$f( 'enabled', __( 'Show the widget', 'accesspath' ), array( __CLASS__, 'field_enabled' ), 'accesspath_main' );
		$f( 'source', __( 'Script source', 'accesspath' ), array( __CLASS__, 'field_source' ), 'accesspath_main' );

		$f( 'position', __( 'Position', 'accesspath' ), array( __CLASS__, 'field_position' ), 'accesspath_trigger' );
		$f( 'shape', __( 'Shape', 'accesspath' ), array( __CLASS__, 'field_shape' ), 'accesspath_trigger' );
		$f( 'icon', __( 'Icon', 'accesspath' ), array( __CLASS__, 'field_icon' ), 'accesspath_trigger' );
		$f( 'draggable', __( 'Let visitors drag it', 'accesspath' ), array( __CLASS__, 'field_draggable' ), 'accesspath_trigger' );
		$f( 'brand', __( 'Brand color', 'accesspath' ), array( __CLASS__, 'field_brand' ), 'accesspath_trigger' );

		$f( 'theme', __( 'Theme', 'accesspath' ), array( __CLASS__, 'field_theme' ), 'accesspath_panel' );
		$f( 'locale', __( 'Language', 'accesspath' ), array( __CLASS__, 'field_locale' ), 'accesspath_panel' );
		$f( 'profiles', __( 'Profiles to show', 'accesspath' ), array( __CLASS__, 'field_profiles' ), 'accesspath_panel' );
		$f( 'show_checker', __( 'Accessibility Checker', 'accesspath' ), array( __CLASS__, 'field_checker' ), 'accesspath_panel' );

		$f( 'storage_key', __( 'Storage key', 'accesspath' ), array( __CLASS__, 'field_storage_key' ), 'accesspath_advanced' );
	}

	/* --------------------------------------------------------------------- *
	 * Field renderers
	 * --------------------------------------------------------------------- */

	/**
	 * Current option value for a key.
	 *
	 * @param string $key Option key.
	 * @return mixed
	 */
	private static function val( $key ) {
		$opts = AccessPath_Config::get();
		return isset( $opts[ $key ] ) ? $opts[ $key ] : null;
	}

	/**
	 * Name attribute for a field.
	 *
	 * @param string $key Option key.
	 * @return string
	 */
	private static function name( $key ) {
		return ACCESSPATH_OPTION . '[' . $key . ']';
	}

	/**
	 * Render a <select>.
	 *
	 * @param string $key     Option key.
	 * @param array  $options value => label.
	 */
	private static function select( $key, $options ) {
		$current = self::val( $key );
		echo '<select name="' . esc_attr( self::name( $key ) ) . '" id="' . esc_attr( $key ) . '">';
		foreach ( $options as $value => $label ) {
			printf(
				'<option value="%s"%s>%s</option>',
				esc_attr( $value ),
				selected( $current, $value, false ),
				esc_html( $label )
			);
		}
		echo '</select>';
	}

	/**
	 * Render a single checkbox with a trailing description.
	 *
	 * @param string $key  Option key.
	 * @param string $desc Label shown next to the box.
	 */
	private static function checkbox( $key, $desc ) {
		printf(
			'<label><input type="checkbox" name="%s" value="1"%s> %s</label>',
			esc_attr( self::name( $key ) ),
			checked( (bool) self::val( $key ), true, false ),
			esc_html( $desc )
		);
	}

	/** Enabled toggle. */
	public static function field_enabled() {
		self::checkbox( 'enabled', __( 'Display the accessibility panel on the public site.', 'accesspath' ) );
	}

	/** Script source. Self-hosted only — see the note on ACCESSPATH_URL in accesspath.php. */
	public static function field_source() {
		echo '<p>' . esc_html__( 'Served from a copy bundled with this plugin. No third-party CDN, ever.', 'accesspath' ) . '</p>';
	}

	/** Position select. */
	public static function field_position() {
		self::select( 'position', AccessPath_Config::positions() );
	}

	/** Shape select. */
	public static function field_shape() {
		self::select( 'shape', AccessPath_Config::shapes() );
	}

	/** Icon select. */
	public static function field_icon() {
		self::select( 'icon', AccessPath_Config::icons() );
	}

	/** Draggable checkbox. */
	public static function field_draggable() {
		self::checkbox( 'draggable', __( 'Visitors can drag the button to reposition it (their choice is remembered in their browser).', 'accesspath' ) );
	}

	/** Brand color. */
	public static function field_brand() {
		printf(
			'<input type="text" name="%s" id="brand" value="%s" placeholder="#4928F3" pattern="#[0-9a-fA-F]{3,6}" class="regular-text" style="max-width:140px">',
			esc_attr( self::name( 'brand' ) ),
			esc_attr( (string) self::val( 'brand' ) )
		);
		echo '<p class="description">' . esc_html__( 'Hex color for the trigger button and accents. Leave blank to keep the default violet.', 'accesspath' ) . '</p>';
	}

	/** Theme select. */
	public static function field_theme() {
		self::select(
			'theme',
			array(
				'light' => __( 'Light', 'accesspath' ),
				'dark'  => __( 'Dark', 'accesspath' ),
			)
		);
		echo '<p class="description">' . esc_html__( 'Styling of the panel itself, independent of your site theme.', 'accesspath' ) . '</p>';
	}

	/** Locale select. */
	public static function field_locale() {
		self::select( 'locale', AccessPath_Config::locales() );
	}

	/** Profiles checkboxes. */
	public static function field_profiles() {
		$current = (array) self::val( 'profiles' );
		$name    = self::name( 'profiles' ) . '[]';
		echo '<fieldset>';
		foreach ( AccessPath_Config::profiles() as $value => $label ) {
			printf(
				'<label style="display:inline-block;min-width:200px;margin:2px 0"><input type="checkbox" name="%s" value="%s"%s> %s</label>',
				esc_attr( $name ),
				esc_attr( $value ),
				checked( in_array( $value, $current, true ), true, false ),
				esc_html( $label )
			);
		}
		echo '</fieldset>';
		echo '<p class="description">' . esc_html__( 'Leave all unchecked to show every profile.', 'accesspath' ) . '</p>';
	}

	/** Accessibility Checker toggle. */
	public static function field_checker() {
		self::checkbox( 'show_checker', __( 'Add the built-in WCAG checker section (a developer diagnostic — visible to everyone when on).', 'accesspath' ) );
	}

	/** Storage key. */
	public static function field_storage_key() {
		printf(
			'<input type="text" name="%s" id="storage_key" value="%s" class="regular-text">',
			esc_attr( self::name( 'storage_key' ) ),
			esc_attr( (string) self::val( 'storage_key' ) )
		);
		echo '<p class="description">' . esc_html__( 'localStorage key for saved visitor preferences. Change only if another AccessPath instance on the same domain would collide.', 'accesspath' ) . '</p>';
	}

	/* --------------------------------------------------------------------- *
	 * Page
	 * --------------------------------------------------------------------- */

	/**
	 * Render the settings page.
	 */
	public static function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap">
			<h1><?php echo esc_html__( 'AccessPath', 'accesspath' ); ?></h1>
			<p>
				<?php echo esc_html__( 'Adds a floating accessibility button that opens a control panel: text size, contrast, motion, spacing, dyslexia font, 9 preset profiles, and more. Preferences are saved in each visitor\'s own browser.', 'accesspath' ); ?>
			</p>
			<p>
				<strong><?php echo esc_html__( 'Not automated compliance.', 'accesspath' ); ?></strong>
				<?php echo esc_html__( 'It helps visitors adapt your pages; it does not fix missing alt text, headings, labels, or keyboard support.', 'accesspath' ); ?>
				<a href="https://accesspath-6ur.pages.dev/accessibility-guide.html" target="_blank" rel="noopener"><?php echo esc_html__( 'What it does and does not do', 'accesspath' ); ?></a>
			</p>
			<form action="options.php" method="post">
				<?php
				settings_fields( self::GROUP );
				do_settings_sections( self::PAGE );
				submit_button();
				?>
			</form>
		</div>
		<?php
	}
}
