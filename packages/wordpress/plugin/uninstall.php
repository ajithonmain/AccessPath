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
	$accesspath_site_ids = get_sites( array( 'fields' => 'ids' ) );
	foreach ( $accesspath_site_ids as $accesspath_site_id ) {
		switch_to_blog( $accesspath_site_id );
		delete_option( 'accesspath_settings' );
		restore_current_blog();
	}
}
