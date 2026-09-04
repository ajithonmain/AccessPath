#!/usr/bin/env bash
#
# Full-WordPress smoke test: assembles a throwaway SQLite-backed WordPress in a
# temp dir, drops the built plugin in, force-activates it, starts `php -S`, and
# runs tests/smoke.mjs (Playwright) against it.
#
# Requires: php (>=7.4, with pdo_sqlite), a `playwright` install resolvable by
# node, curl, unzip, and network access to wordpress.org.
#
# Usage:  npm run build -w @accesspath/wordpress   # produce plugin/assets/embed.js
#         packages/wordpress/tests/smoke.sh
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$HERE/../plugin" && pwd)"
WORK="${ACCESSPATH_SMOKE_DIR:-$(mktemp -d)}"
PORT="${ACCESSPATH_SMOKE_PORT:-8883}"
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
define( 'WP_DEBUG', true ); define( 'WP_DEBUG_LOG', true ); define( 'WP_DEBUG_DISPLAY', false );
foreach ( array('AUTH_KEY','SECURE_AUTH_KEY','LOGGED_IN_KEY','NONCE_KEY','AUTH_SALT','SECURE_AUTH_SALT','LOGGED_IN_SALT','NONCE_SALT') as \$k ) { define( \$k, 'test-' . \$k ); }
define( 'WP_HOME', 'http://localhost:$PORT' ); define( 'WP_SITEURL', 'http://localhost:$PORT' );
if ( ! defined( 'ABSPATH' ) ) define( 'ABSPATH', __DIR__ . '/' );
require_once ABSPATH . 'wp-settings.php';
PHP

rm -rf "$WPROOT/wp-content/plugins/accesspath"
cp -R "$PLUGIN_DIR" "$WPROOT/wp-content/plugins/accesspath"

php -S "localhost:$PORT" -t "$WPROOT" > "$WORK/php.log" 2>&1 &
PHP_PID=$!
trap 'kill $PHP_PID 2>/dev/null || true' EXIT
sleep 2

curl -fsS -m 90 "http://localhost:$PORT/wp-admin/install.php?step=2" \
	--data-urlencode "weblog_title=AP Smoke" \
	--data-urlencode "user_name=admin" \
	--data-urlencode "admin_password=admin-pass-123" \
	--data-urlencode "admin_password2=admin-pass-123" \
	--data-urlencode "pw_weak=1" \
	--data-urlencode "admin_email=admin@example.com" \
	--data-urlencode "blog_public=0" -o "$WORK/install.html"

# Activate the plugin through WP itself (post-schema, so no race).
php -r '
define("WP_ADMIN", true);
require "'"$WPROOT"'/wp-load.php";
require ABSPATH . "wp-admin/includes/plugin.php";
foreach ( array("sqlite-database-integration/load.php", "accesspath/accesspath.php") as $p ) {
	$r = activate_plugin( $p );
	echo is_wp_error( $r ) ? "activate FAILED: $p — " . $r->get_error_message() . "\n" : "activated: $p\n";
}
'

BASE="http://localhost:$PORT" node "$HERE/smoke.mjs"
