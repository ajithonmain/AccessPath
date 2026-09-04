<?php
/**
 * Removes plugin data on uninstall.
 *
 * @package AccessPath
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'accesspath_settings' );

// Multisite: clear the option on every site.
if ( is_multisite() ) {
	$site_ids = get_sites( array( 'fields' => 'ids' ) );
	foreach ( $site_ids as $site_id ) {
		switch_to_blog( $site_id );
		delete_option( 'accesspath_settings' );
		restore_current_blog();
	}
}
