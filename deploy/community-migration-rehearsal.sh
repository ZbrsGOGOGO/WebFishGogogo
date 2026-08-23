#!/bin/sh
set -eu

BASELINE_TIMESTAMP=1700000000007
HARDENING_TIMESTAMP=1700000000008
ACCOUNT_SECURITY_TIMESTAMP=1700000000013
CHAT_TIMESTAMP=1700000000014
NEWS_TIMESTAMP=1700000000015
GAME_GROWTH_TIMESTAMP=1700000000018
UNIFIED_ECONOMY_TIMESTAMP=1700000000019
GUILD_TIMESTAMP=1700000000020
GUILD_BOSS_TIMESTAMP=1700000000021
HOT_NEWS_TIMESTAMP=1700000000022
ARCADE_TIMESTAMP=1700000000023
LATEST_TIMESTAMP=1700000000023
POSTGRES_IMAGE=${POSTGRES_IMAGE:-postgres:16.14-alpine}
LOCK_TIMEOUT_MS=${REHEARSAL_LOCK_TIMEOUT_MS:-1000}

usage() {
  printf '%s\n' "Usage: sh deploy/community-migration-rehearsal.sh COMMUNITY_API_IMAGE SNAPSHOT_0007.sql" >&2
  printf '%s\n' "The snapshot must be a plain, no-owner PostgreSQL dump whose latest migration is 1700000000007." >&2
}

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

pass() {
  printf 'PASS: %s\n' "$*"
}

[ "$#" -eq 2 ] || {
  usage
  exit 2
}

API_IMAGE=$1
SNAPSHOT=$2
case "$API_IMAGE" in
  ''|-*|*[!A-Za-z0-9._:/@-]*) fail "COMMUNITY_API_IMAGE has an unsafe image reference" ;;
esac
case "$POSTGRES_IMAGE" in
  ''|-*|*[!A-Za-z0-9._:/@-]*) fail "POSTGRES_IMAGE has an unsafe image reference" ;;
esac
[ -f "$SNAPSHOT" ] || fail "0007 snapshot not found: $SNAPSHOT"
[ -s "$SNAPSHOT" ] || fail "0007 snapshot is empty: $SNAPSHOT"

case "$LOCK_TIMEOUT_MS" in
  ''|*[!0-9]*) fail "REHEARSAL_LOCK_TIMEOUT_MS must be an integer" ;;
  *) [ "$LOCK_TIMEOUT_MS" -ge 100 ] && [ "$LOCK_TIMEOUT_MS" -le 5000 ] ||
       fail "REHEARSAL_LOCK_TIMEOUT_MS must be between 100 and 5000" ;;
esac

for tool in docker grep mktemp date sleep; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is required"
done
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable"
docker image inspect "$API_IMAGE" >/dev/null 2>&1 ||
  fail "community API image is not present locally: $API_IMAGE"

RUN_ID=$(date +%s)-$$
NETWORK=webfish-migration-rehearsal-$RUN_ID
PG_CONTAINER=webfish-pg16-rehearsal-$RUN_ID
PG_PASSWORD=webfish-rehearsal-$RUN_ID
REHEARSAL_TMP=$(mktemp -d "${TMPDIR:-/tmp}/webfish-community-migration.XXXXXX") ||
  fail "unable to create rehearsal temporary directory"
LOCK_EXEC_PID=

cleanup() {
  if [ -n "$PG_CONTAINER" ]; then
    docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
  fi
  if [ -n "$NETWORK" ]; then
    docker network rm "$NETWORK" >/dev/null 2>&1 || true
  fi
  if [ -n "$REHEARSAL_TMP" ] && [ -d "$REHEARSAL_TMP" ]; then
    rm -rf -- "$REHEARSAL_TMP"
  fi
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

pg_scalar() {
  database=$1
  sql=$2
  docker exec \
    -e PGPASSWORD="$PG_PASSWORD" \
    "$PG_CONTAINER" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database" -Atq -c "$sql"
}

assert_baseline() {
  database=$1
  table_name=$(pg_scalar "$database" "SELECT COALESCE(to_regclass('public.migrations')::text, '');")
  [ "$table_name" = migrations ] || fail "$database does not contain public.migrations"
  latest=$(pg_scalar "$database" 'SELECT COALESCE(MAX("timestamp"), 0)::text FROM "migrations";')
  [ "$latest" = "$BASELINE_TIMESTAMP" ] ||
    fail "$database latest migration is $latest, expected exactly $BASELINE_TIMESTAMP"
  hardening_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $HARDENING_TIMESTAMP;")
  [ "$hardening_count" = 0 ] || fail "$database already contains migration $HARDENING_TIMESTAMP"
}

assert_target_applied() {
  database=$1
  hardening_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $HARDENING_TIMESTAMP;")
  [ "$hardening_count" = 1 ] || fail "$database did not record migration $HARDENING_TIMESTAMP"
  security_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $ACCOUNT_SECURITY_TIMESTAMP;")
  [ "$security_count" = 1 ] || fail "$database did not record migration $ACCOUNT_SECURITY_TIMESTAMP"
  chat_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $CHAT_TIMESTAMP;")
  [ "$chat_count" = 1 ] || fail "$database did not record migration $CHAT_TIMESTAMP"
  news_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $NEWS_TIMESTAMP;")
  [ "$news_count" = 1 ] || fail "$database did not record migration $NEWS_TIMESTAMP"
  growth_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $GAME_GROWTH_TIMESTAMP;")
  [ "$growth_count" = 1 ] || fail "$database did not record migration $GAME_GROWTH_TIMESTAMP"
  economy_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $UNIFIED_ECONOMY_TIMESTAMP;")
  [ "$economy_count" = 1 ] || fail "$database did not record migration $UNIFIED_ECONOMY_TIMESTAMP"
  guild_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $GUILD_TIMESTAMP;")
  [ "$guild_count" = 1 ] || fail "$database did not record migration $GUILD_TIMESTAMP"
  guild_boss_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $GUILD_BOSS_TIMESTAMP;")
  [ "$guild_boss_count" = 1 ] || fail "$database did not record migration $GUILD_BOSS_TIMESTAMP"
  hot_news_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $HOT_NEWS_TIMESTAMP;")
  [ "$hot_news_count" = 1 ] || fail "$database did not record migration $HOT_NEWS_TIMESTAMP"
  arcade_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $ARCADE_TIMESTAMP;")
  [ "$arcade_count" = 1 ] || fail "$database did not record migration $ARCADE_TIMESTAMP"
  latest_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $LATEST_TIMESTAMP;")
  [ "$latest_count" = 1 ] || fail "$database did not record migration $LATEST_TIMESTAMP"
  latest_applied=$(pg_scalar "$database" 'SELECT COALESCE(MAX("timestamp"), 0)::text FROM "migrations";')
  [ "$latest_applied" = "$LATEST_TIMESTAMP" ] ||
    fail "$database latest migration is $latest_applied, expected exactly $LATEST_TIMESTAMP"
  column_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email_normalized';")
  [ "$column_count" = 1 ] || fail "$database is missing users.email_normalized after migration"
  for security_table in password_reset_tokens social_verification_sessions social_verification_callback_receipts account_restrictions account_appeals account_deletion_requests; do
    table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$security_table';")
    [ "$table_count" = 1 ] || fail "$database is missing $security_table after migration"
  done
  reset_index_count=$(pg_scalar "$database" "SELECT count(*)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_password_reset_tokens_one_unused' AND indexdef LIKE '%WHERE (used_at IS NULL)%';")
  [ "$reset_index_count" = 1 ] || fail "$database is missing the one-unused password-reset constraint"
  for chat_table in chat_rooms chat_socket_tickets chat_messages chat_message_mentions chat_message_reports; do
    table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$chat_table';")
    [ "$table_count" = 1 ] || fail "$database is missing $chat_table after migration"
  done
  for news_table in news_sources news_articles news_article_revisions news_review_decisions news_user_preferences news_negative_feedback; do
    table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$news_table';")
    [ "$table_count" = 1 ] || fail "$database is missing $news_table after migration"
  done
  for arcade_table in arcade_game_runs arcade_best_scores; do
    table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$arcade_table';")
    [ "$table_count" = 1 ] || fail "$database is missing $arcade_table after migration"
  done
  operational_index_count=$(pg_scalar "$database" "SELECT count(*)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('idx_auth_sessions_active_order', 'idx_community_notifications_page', 'idx_community_notifications_unread_category', 'idx_friend_requests_requester_created', 'idx_user_blocks_blocker_created', 'idx_chat_messages_author_room_created', 'idx_news_articles_public_feed', 'idx_office_battle_offer_sets_unconsumed');")
  [ "$operational_index_count" = 8 ] || fail "$database is missing one or more 0016 operational indexes"
  username_column_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('username', 'username_normalized');")
  [ "$username_column_count" = 2 ] || fail "$database is missing the 0017 username columns"
  username_index_count=$(pg_scalar "$database" "SELECT count(*)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_users_username_normalized';")
  [ "$username_index_count" = 1 ] || fail "$database is missing the 0017 username uniqueness index"
  farm_growth_column_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'desk_plants' AND column_name IN ('farm_coins', 'total_harvests', 'selected_crop_key', 'tool_levels', 'skill_levels', 'farm_version')) OR (table_name = 'desk_plant_cycles' AND column_name = 'crop_key') OR (table_name = 'office_battle_profiles' AND column_name = 'skill_levels'));")
  [ "$farm_growth_column_count" = 8 ] || fail "$database is missing one or more 0018 game-growth columns"
  energy_default_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'energy_states' AND column_name IN ('balance', 'capacity') AND column_default = '120';")
  [ "$energy_default_count" = 2 ] || fail "$database is missing the 0019 unified 120-energy defaults"
  unified_constraint_count=$(pg_scalar "$database" "SELECT count(*)::text FROM pg_constraint WHERE conname = 'chk_energy_state_capacity' AND pg_get_constraintdef(oid) LIKE '%capacity = 120%';")
  [ "$unified_constraint_count" = 1 ] || fail "$database is missing the 0019 fixed-capacity energy constraint"
  for guild_table in guilds guild_members guild_ledger; do
    table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$guild_table';")
    [ "$table_count" = 1 ] || fail "$database is missing $guild_table after migration"
  done
  guild_index_count=$(pg_scalar "$database" "SELECT count(*)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('idx_guild_members_guild_joined', 'idx_guild_ledger_guild_created');")
  [ "$guild_index_count" = 2 ] || fail "$database is missing one or more 0020 guild indexes"
  for boss_table in guild_boss_runs guild_boss_contributions; do
    table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$boss_table';")
    [ "$table_count" = 1 ] || fail "$database is missing $boss_table after migration"
  done
  boss_index_count=$(pg_scalar "$database" "SELECT count(*)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('idx_guild_boss_runs_guild_created', 'idx_guild_boss_contributions_rank');")
  [ "$boss_index_count" = 2 ] || fail "$database is missing one or more 0021 guild-boss indexes"
  hot_news_table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('hot_news_headlines', 'hot_news_refresh_runs');")
  [ "$hot_news_table_count" = 2 ] || fail "$database is missing one or more 0022 daily-hot-news tables"
  invite_currency_count=$(pg_scalar "$database" "SELECT count(*)::text FROM pg_constraint WHERE conname IN ('chk_wallet_currency', 'chk_wallet_ledger_currency') AND pg_get_constraintdef(oid) LIKE '%invite_coin%';")
  [ "$invite_currency_count" = 2 ] || fail "$database is missing the 0022 invite-coin wallet constraints"
}

assert_target_absent() {
  database=$1
  hardening_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $HARDENING_TIMESTAMP;")
  [ "$hardening_count" = 0 ] || fail "$database still records migration $HARDENING_TIMESTAMP"
  security_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $ACCOUNT_SECURITY_TIMESTAMP;")
  [ "$security_count" = 0 ] || fail "$database still records migration $ACCOUNT_SECURITY_TIMESTAMP"
  chat_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $CHAT_TIMESTAMP;")
  [ "$chat_count" = 0 ] || fail "$database still records migration $CHAT_TIMESTAMP"
  news_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $NEWS_TIMESTAMP;")
  [ "$news_count" = 0 ] || fail "$database still records migration $NEWS_TIMESTAMP"
  growth_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $GAME_GROWTH_TIMESTAMP;")
  [ "$growth_count" = 0 ] || fail "$database still records migration $GAME_GROWTH_TIMESTAMP"
  economy_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $UNIFIED_ECONOMY_TIMESTAMP;")
  [ "$economy_count" = 0 ] || fail "$database still records migration $UNIFIED_ECONOMY_TIMESTAMP"
  guild_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $GUILD_TIMESTAMP;")
  [ "$guild_count" = 0 ] || fail "$database still records migration $GUILD_TIMESTAMP"
  guild_boss_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $GUILD_BOSS_TIMESTAMP;")
  [ "$guild_boss_count" = 0 ] || fail "$database still records migration $GUILD_BOSS_TIMESTAMP"
  hot_news_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $HOT_NEWS_TIMESTAMP;")
  [ "$hot_news_count" = 0 ] || fail "$database still records migration $HOT_NEWS_TIMESTAMP"
  arcade_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $ARCADE_TIMESTAMP;")
  [ "$arcade_count" = 0 ] || fail "$database still records migration $ARCADE_TIMESTAMP"
  latest_count=$(pg_scalar "$database" "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" = $LATEST_TIMESTAMP;")
  [ "$latest_count" = 0 ] || fail "$database still records migration $LATEST_TIMESTAMP"
  column_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email_normalized';")
  [ "$column_count" = 0 ] || fail "$database retained users.email_normalized after rollback/failure"
  security_table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('password_reset_tokens', 'social_verification_sessions', 'social_verification_callback_receipts', 'account_restrictions', 'account_appeals', 'account_deletion_requests');")
  [ "$security_table_count" = 0 ] || fail "$database retained account-security tables after rollback/failure"
  chat_table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('chat_rooms', 'chat_socket_tickets', 'chat_messages', 'chat_message_mentions', 'chat_message_reports');")
  [ "$chat_table_count" = 0 ] || fail "$database retained chat tables after rollback/failure"
  news_table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('news_sources', 'news_articles', 'news_article_revisions', 'news_review_decisions', 'news_user_preferences', 'news_negative_feedback');")
  [ "$news_table_count" = 0 ] || fail "$database retained news tables after rollback/failure"
  arcade_table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('arcade_game_runs', 'arcade_best_scores');")
  [ "$arcade_table_count" = 0 ] || fail "$database retained arcade tables after rollback/failure"
  operational_index_count=$(pg_scalar "$database" "SELECT count(*)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('idx_auth_sessions_active_order', 'idx_community_notifications_page', 'idx_community_notifications_unread_category', 'idx_friend_requests_requester_created', 'idx_user_blocks_blocker_created', 'idx_chat_messages_author_room_created', 'idx_news_articles_public_feed', 'idx_office_battle_offer_sets_unconsumed');")
  [ "$operational_index_count" = 0 ] || fail "$database retained 0016 operational indexes after rollback/failure"
  username_column_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('username', 'username_normalized');")
  [ "$username_column_count" = 0 ] || fail "$database retained 0017 username columns after rollback/failure"
  username_index_count=$(pg_scalar "$database" "SELECT count(*)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_users_username_normalized';")
  [ "$username_index_count" = 0 ] || fail "$database retained the 0017 username uniqueness index after rollback/failure"
  farm_growth_column_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'desk_plants' AND column_name IN ('farm_coins', 'total_harvests', 'selected_crop_key', 'tool_levels', 'skill_levels', 'farm_version')) OR (table_name = 'desk_plant_cycles' AND column_name = 'crop_key') OR (table_name = 'office_battle_profiles' AND column_name = 'skill_levels'));")
  [ "$farm_growth_column_count" = 0 ] || fail "$database retained 0018 game-growth columns after rollback/failure"
  guild_table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('guilds', 'guild_members', 'guild_ledger');")
  [ "$guild_table_count" = 0 ] || fail "$database retained 0020 guild tables after rollback/failure"
  guild_boss_table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('guild_boss_runs', 'guild_boss_contributions');")
  [ "$guild_boss_table_count" = 0 ] || fail "$database retained 0021 guild-boss tables after rollback/failure"
  hot_news_table_count=$(pg_scalar "$database" "SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('hot_news_headlines', 'hot_news_refresh_runs');")
  [ "$hot_news_table_count" = 0 ] || fail "$database retained 0022 daily-hot-news tables after rollback/failure"
}

restore_snapshot() {
  database=$1
  docker exec -e PGPASSWORD="$PG_PASSWORD" "$PG_CONTAINER" \
    createdb -U postgres "$database" >/dev/null
  docker exec -e PGPASSWORD="$PG_PASSWORD" -i "$PG_CONTAINER" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database" \
    < "$SNAPSHOT" >/dev/null
  assert_baseline "$database"
  extension_count=$(pg_scalar "$database" "SELECT count(*)::text FROM pg_extension WHERE extname = 'pgcrypto';")
  [ "$extension_count" = 1 ] || fail "$database snapshot is missing the pgcrypto extension"
  pass "$database restored at migration $BASELINE_TIMESTAMP"
}

run_migration_cli() {
  database=$1
  lock_timeout=$2
  action=$3
  docker run --rm \
    --network "$NETWORK" \
    -e NODE_ENV=production \
    -e DB_HOST="$PG_CONTAINER" \
    -e DB_PORT=5432 \
    -e DB_USERNAME=postgres \
    -e DB_PASSWORD="$PG_PASSWORD" \
    -e DB_DATABASE="$database" \
    -e DB_SCHEMA=public \
    -e DB_SSL=false \
    -e DB_LOGGING=false \
    -e DB_POOL_MAX=2 \
    -e DB_CONNECT_TIMEOUT_MS=5000 \
    -e DB_POOL_IDLE_TIMEOUT_MS=5000 \
    -e DB_STATEMENT_TIMEOUT_MS=60000 \
    -e DB_QUERY_TIMEOUT_MS=65000 \
    -e DB_LOCK_TIMEOUT_MS="$lock_timeout" \
    -e DB_IDLE_TRANSACTION_TIMEOUT_MS=60000 \
    "$API_IMAGE" \
    node node_modules/typeorm/cli.js "$action" \
    -d packages/backend/dist/database/data-source.js
}

docker network create "$NETWORK" >/dev/null
docker run --detach \
  --name "$PG_CONTAINER" \
  --network "$NETWORK" \
  --memory 1024m \
  --cpus 1.0 \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  -e POSTGRES_DB=postgres \
  "$POSTGRES_IMAGE" >/dev/null

ready=0
attempt=1
while [ "$attempt" -le 30 ]; do
  if docker exec -e PGPASSWORD="$PG_PASSWORD" "$PG_CONTAINER" \
    pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done
[ "$ready" -eq 1 ] || fail "PostgreSQL 16 rehearsal container did not become ready"

server_version=$(pg_scalar postgres 'SHOW server_version;')
case "$server_version" in
  16.*) pass "isolated PostgreSQL server is $server_version" ;;
  *) fail "expected PostgreSQL 16, got $server_version" ;;
esac

# 1. 干净快照：up（含 0008 及后续） -> 逐个 down 到 0007 -> 再 up。
restore_snapshot rehearsal_clean
run_migration_cli rehearsal_clean 5000 migration:run \
  >"$REHEARSAL_TMP/clean-up-1.log" 2>&1 ||
  fail "clean migration up failed"
assert_target_applied rehearsal_clean
pass "clean snapshot migrated up through $LATEST_TIMESTAMP"

higher_count=$(pg_scalar rehearsal_clean "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" > $BASELINE_TIMESTAMP;")
while [ "$higher_count" -gt 0 ]; do
  previous_count=$higher_count
  run_migration_cli rehearsal_clean 5000 migration:revert \
    >"$REHEARSAL_TMP/clean-revert-${higher_count}.log" 2>&1 ||
    fail "migration revert failed while returning to $BASELINE_TIMESTAMP"
  higher_count=$(pg_scalar rehearsal_clean "SELECT count(*)::text FROM \"migrations\" WHERE \"timestamp\" > $BASELINE_TIMESTAMP;")
  [ "$higher_count" -lt "$previous_count" ] ||
    fail "migration revert did not reduce the post-0007 migration count"
done
assert_baseline rehearsal_clean
assert_target_absent rehearsal_clean
pass "all post-0007 migrations reverted cleanly"

run_migration_cli rehearsal_clean 5000 migration:run \
  >"$REHEARSAL_TMP/clean-up-2.log" 2>&1 ||
  fail "second clean migration up failed"
assert_target_applied rehearsal_clean
pass "clean snapshot migrated up a second time"

# 2. 脏邮箱：两个原始值不同但 trim/lower 后冲突，0008 必须在改 schema 前中止。
restore_snapshot rehearsal_dirty
pg_scalar rehearsal_dirty "
  INSERT INTO users (email, password_hash, display_name)
  VALUES
    ('Migration.Collision@example.invalid', 'rehearsal-not-a-login-hash', 'migration rehearsal'),
    (' migration.collision@example.invalid ', 'rehearsal-not-a-login-hash', 'migration rehearsal');
  SELECT count(*)::text FROM users;
" >/dev/null
if run_migration_cli rehearsal_dirty 5000 migration:run \
  >"$REHEARSAL_TMP/dirty-collision.log" 2>&1; then
  fail "dirty normalized-email collision unexpectedly migrated"
fi
grep -Fq 'EMAIL_NORMALIZATION_COLLISION' "$REHEARSAL_TMP/dirty-collision.log" ||
  fail "dirty migration failed without the expected collision guard"
assert_baseline rehearsal_dirty
assert_target_absent rehearsal_dirty
pass "normalized-email collision aborts before schema mutation"

# 3. 锁竞争：持有 user_profiles ACCESS EXCLUSIVE。0008 会先改 users，再在
#    user_profiles 处超时，用于证明迁移中途失败也会回滚先前 DDL/数据更改。
restore_snapshot rehearsal_lock
docker exec \
  -e PGPASSWORD="$PG_PASSWORD" \
  -e PGAPPNAME=webfish_migration_lock_holder \
  "$PG_CONTAINER" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d rehearsal_lock \
  -c 'BEGIN; LOCK TABLE user_profiles IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(30); ROLLBACK;' \
  >"$REHEARSAL_TMP/lock-holder.log" 2>&1 &
LOCK_EXEC_PID=$!

lock_ready=0
attempt=1
while [ "$attempt" -le 10 ]; do
  lock_count=$(pg_scalar rehearsal_lock "
    SELECT count(*)::text
    FROM pg_locks AS locks
    JOIN pg_class AS relation ON relation.oid = locks.relation
    JOIN pg_stat_activity AS activity ON activity.pid = locks.pid
    WHERE activity.application_name = 'webfish_migration_lock_holder'
      AND relation.relname = 'user_profiles'
      AND locks.mode = 'AccessExclusiveLock'
      AND locks.granted;
  ")
  if [ "$lock_count" -ge 1 ]; then
    lock_ready=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done
[ "$lock_ready" -eq 1 ] || fail "could not establish the rehearsal user_profiles-table lock"

if run_migration_cli rehearsal_lock "$LOCK_TIMEOUT_MS" migration:run \
  >"$REHEARSAL_TMP/lock-timeout.log" 2>&1; then
  fail "migration unexpectedly succeeded while user_profiles was locked"
fi
grep -Eiq 'lock timeout|canceling statement due to lock timeout|55P03' \
  "$REHEARSAL_TMP/lock-timeout.log" ||
  fail "locked migration failed without a PostgreSQL lock-timeout signal"
assert_baseline rehearsal_lock
assert_target_absent rehearsal_lock
pass "lock timeout leaves the 0007 schema unchanged"

pg_scalar rehearsal_lock "
  SELECT pg_terminate_backend(pid)::text
  FROM pg_stat_activity
  WHERE application_name = 'webfish_migration_lock_holder'
    AND pid <> pg_backend_pid();
" >/dev/null
wait "$LOCK_EXEC_PID" 2>/dev/null || true
LOCK_EXEC_PID=

run_migration_cli rehearsal_lock 5000 migration:run \
  >"$REHEARSAL_TMP/lock-recovery.log" 2>&1 ||
  fail "migration did not recover after the rehearsal lock was released"
assert_target_applied rehearsal_lock
pass "migration succeeds after lock release"

printf '%s\n' "Community PostgreSQL 16 migration rehearsal passed."
printf '%s\n' "Evidence: clean up/down/up through daily hot news and invite coin 0022 (including account-security 0013, chat 0014, news 0015, indexes 0016, username accounts 0017, game growth 0018, unified economy 0019 and guild foundation/boss 0020-0021), normalized-email collision abort, lock-timeout rollback and recovery."
