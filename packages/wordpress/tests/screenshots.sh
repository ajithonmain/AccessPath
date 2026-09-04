#!/usr/bin/env bash
#
# Boots the same throwaway WordPress used by smoke.sh, then captures the two
# WordPress.org listing screenshots into assets-wp-org/. Run manually before a
# release, after `npm run build -w @accesspath/wordpress`.
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$HERE/../plugin" && pwd)"
OUT_DIR="$(cd "$HERE/../assets-wp-org" && pwd)"
WORK="${ACCESSPATH_SMOKE_DIR:-$(mktemp -d)}"
PORT="${ACCESSPATH_SMOKE_PORT:-8884}"
WPROOT="$WORK/wp"

[ -f "$PLUGIN_DIR/assets/embed.js" ] || {
	echo "plugin/assets/embed.js missing — run: npm run build -w @accesspath/wordpress" >&2
	exit 1
}

echo "workdir: $WORK"
cd "$WORK"

curl -fsSL -o wp.zip https://wordpress.org/latest.zip
curl -fsSL -o sqlite.zip https://downloads.wordpress.org/plugin/sqlite-database-integration.zip
rm -rf "$WPROOT"
unzip -q wp.zip && mv wordpress "$WPROOT"
unzip -q sqlite.zip -d "$WPROOT/wp-content/plugins"

cp "$WPROOT/wp-content/plugins/sqlite-database-integration/db.copy" "$WPROOT/wp-content/db.php"
perl -pi -e "s#\\{SQLITE_IMPLEMENTATION_FOLDER_PATH\\}#$WPROOT/wp-content/plugins/sqlite-database-integration#g; s#\\{SQLITE_PLUGIN\\}#sqlite-database-integration/load.php#g" "$WPROOT/wp-content/db.php"

cat > "$WPROOT/wp-config.php" <<PHP
<?php
define( 'DB_NAME', 'wp' ); define( 'DB_USER', 'root' ); define( 'DB_PASSWORD', '' );
define( 'DB_HOST', 'localhost' ); define( 'DB_CHARSET', 'utf8' ); define( 'DB_COLLATE', '' );
\$table_prefix = 'wp_';
define( 'WP_DEBUG', false );
foreach ( array('AUTH_KEY','SECURE_AUTH_KEY','LOGGED_IN_KEY','NONCE_KEY','AUTH_SALT','SECURE_AUTH_SALT','LOGGED_IN_SALT','NONCE_SALT') as \$k ) { define( \$k, 'test-' . \$k ); }
define( 'WP_HOME', 'http://localhost:$PORT' ); define( 'WP_SITEURL', 'http://localhost:$PORT' );
if ( ! defined( 'ABSPATH' ) ) define( 'ABSPATH', __DIR__ . '/' );
require_once ABSPATH . 'wp-settings.php';
PHP

rm -rf "$WPROOT/wp-content/plugins/accesspath"
cp -R "$PLUGIN_DIR" "$WPROOT/wp-content/plugins/accesspath"

PHP_CLI_SERVER_WORKERS=4 php -S "localhost:$PORT" -t "$WPROOT" > "$WORK/php.log" 2>&1 &
PHP_PID=$!
trap 'kill $PHP_PID 2>/dev/null || true' EXIT
sleep 2

curl -fsS -m 90 "http://localhost:$PORT/wp-admin/install.php?step=2" \
	--data-urlencode "weblog_title=AccessPath Demo" \
	--data-urlencode "user_name=admin" \
	--data-urlencode "admin_password=admin-pass-123" \
	--data-urlencode "admin_password2=admin-pass-123" \
	--data-urlencode "pw_weak=1" \
	--data-urlencode "admin_email=admin@example.com" \
	--data-urlencode "blog_public=0" -o "$WORK/install.html"

php -r '
define("WP_ADMIN", true);
require "'"$WPROOT"'/wp-load.php";
if ( ! function_exists( "activate_plugin" ) ) { require ABSPATH . "wp-admin/includes/plugin.php"; }
foreach ( array("sqlite-database-integration/load.php", "accesspath/accesspath.php") as $p ) {
	$r = activate_plugin( $p );
	echo is_wp_error( $r ) ? "activate FAILED: $p — " . $r->get_error_message() . "\n" : "activated: $p\n";
}
// Give it a real post + title so the front page has content behind the widget.
wp_insert_post( array(
	"post_title"   => "Welcome to AccessPath",
	"post_content" => "AccessPath adds a floating accessibility button to every page. Try the panel in the corner.",
	"post_status"  => "publish",
	"post_type"    => "post",
) );
'

BASE="http://localhost:$PORT" OUT_DIR="$OUT_DIR" node "$HERE/screenshots.mjs"
