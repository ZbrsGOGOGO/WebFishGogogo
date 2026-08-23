#!/bin/sh
set -eu

usage() {
  printf '%s\n' "Usage: BASE_URL=https://example.com sh deploy/public-smoke.sh" >&2
  printf '%s\n' "   or: sh deploy/public-smoke.sh https://example.com" >&2
}

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

pass() {
  printf 'PASS: %s\n' "$*"
}

if [ "$#" -gt 1 ]; then
  usage
  exit 2
fi

if [ "$#" -eq 1 ]; then
  SMOKE_BASE_URL=$1
else
  SMOKE_BASE_URL=${BASE_URL:-}
fi

[ -n "$SMOKE_BASE_URL" ] || {
  usage
  exit 2
}

SMOKE_BASE_URL=${SMOKE_BASE_URL%/}
case "$SMOKE_BASE_URL" in
  http://*|https://*) ;;
  *) fail "BASE_URL must be an http(s) origin" ;;
esac

smoke_authority=${SMOKE_BASE_URL#*://}
case "$smoke_authority" in
  ''|*/*|*@*|*'?'*|*'#'*)
    fail "BASE_URL must not contain credentials, a path, query or fragment"
    ;;
esac

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v grep >/dev/null 2>&1 || fail "grep is required"
command -v sed >/dev/null 2>&1 || fail "sed is required"
command -v sort >/dev/null 2>&1 || fail "sort is required"

SMOKE_TMP=$(mktemp -d "${TMPDIR:-/tmp}/webfish-public-smoke.XXXXXX") ||
  fail "unable to create temporary directory"
trap 'rm -rf -- "$SMOKE_TMP"' EXIT
trap 'exit 130' HUP INT TERM

smoke_request_number=0

fetch_exact() {
  fetch_path=$1
  fetch_expected=$2
  fetch_output=$3
  smoke_request_number=$((smoke_request_number + 1))

  if ! fetch_status=$(curl \
    --silent \
    --show-error \
    --compressed \
    --connect-timeout 5 \
    --max-time 20 \
    --user-agent 'WebFish-public-smoke/1.0' \
    --output "$fetch_output" \
    --write-out '%{http_code}' \
    "$SMOKE_BASE_URL$fetch_path"); then
    fail "$fetch_path request failed"
  fi

  [ "$fetch_status" = "$fetch_expected" ] ||
    fail "$fetch_path returned HTTP $fetch_status, expected $fetch_expected"
  pass "$fetch_path -> HTTP $fetch_status"
}

check_hidden_redirect() {
  hidden_path=$1
  hidden_destination=$2
  hidden_output=$3
  smoke_request_number=$((smoke_request_number + 1))

  if ! hidden_meta=$(curl \
    --silent \
    --show-error \
    --compressed \
    --connect-timeout 5 \
    --max-time 20 \
    --max-redirs 5 \
    --location \
    --user-agent 'WebFish-public-smoke/1.0' \
    --output "$hidden_output" \
    --write-out '%{http_code}\n%{url_effective}\n%{num_redirects}' \
    "$SMOKE_BASE_URL$hidden_path"); then
    fail "$hidden_path redirect request failed"
  fi

  hidden_status=$(printf '%s\n' "$hidden_meta" | sed -n '1p')
  hidden_effective_url=$(printf '%s\n' "$hidden_meta" | sed -n '2p')
  hidden_redirects=$(printf '%s\n' "$hidden_meta" | sed -n '3p')

  [ "$hidden_status" = "200" ] ||
    fail "$hidden_path ended with HTTP $hidden_status, expected 200"
  case "$hidden_redirects" in
    ''|*[!0-9]*) fail "$hidden_path returned an invalid redirect count" ;;
  esac
  [ "$hidden_redirects" -gt 0 ] ||
    fail "$hidden_path was served directly instead of being hidden"

  case "$hidden_destination" in
    home)
      case "$hidden_effective_url" in
        "$SMOKE_BASE_URL"|"$SMOKE_BASE_URL/") ;;
        *) fail "$hidden_path ended at unexpected URL $hidden_effective_url" ;;
      esac
      ;;
    home-or-games)
      case "$hidden_effective_url" in
        "$SMOKE_BASE_URL"|"$SMOKE_BASE_URL/"|"$SMOKE_BASE_URL/games"|"$SMOKE_BASE_URL/games/") ;;
        *) fail "$hidden_path ended at unexpected URL $hidden_effective_url" ;;
      esac
      ;;
    *) fail "internal smoke-test destination error" ;;
  esac

  pass "$hidden_path hidden by $hidden_redirects redirect(s) -> $hidden_effective_url"
}

require_literal() {
  literal_file=$1
  literal_value=$2
  literal_label=$3

  if ! grep -a -F -q "$literal_value" "$literal_file"; then
    fail "$literal_label is missing: $literal_value"
  fi
  pass "$literal_label"
}

forbid_regex() {
  forbidden_file=$1
  forbidden_regex=$2
  forbidden_label=$3

  if grep -a -E -q "$forbidden_regex" "$forbidden_file"; then
    fail "$forbidden_label is present"
  fi
  pass "$forbidden_label is absent"
}

# Public routes: eight serial GETs, exactly once each.
fetch_exact '/' 200 "$SMOKE_TMP/home.html"
fetch_exact '/ledou' 200 "$SMOKE_TMP/ledou.html"
fetch_exact '/tools' 200 "$SMOKE_TMP/tools.html"
fetch_exact '/games' 200 "$SMOKE_TMP/games.html"
fetch_exact '/games/tetris' 200 "$SMOKE_TMP/game-tetris.html"
fetch_exact '/games/tank' 200 "$SMOKE_TMP/game-tank.html"
fetch_exact '/privacy-policy' 200 "$SMOKE_TMP/privacy.html"
fetch_exact '/terms-of-service' 200 "$SMOKE_TMP/terms.html"

# Public-only deployment must not expose an API, including its health route.
fetch_exact '/api' 404 "$SMOKE_TMP/api.json"
fetch_exact '/api/health' 404 "$SMOKE_TMP/api-health.json"

# Hidden full-site routes must be server-side redirects. Following the redirect
# must end on a known public page; a direct 200 is treated as accidental exposure.
check_hidden_redirect '/login' home "$SMOKE_TMP/hidden-login.html"
check_hidden_redirect '/register' home "$SMOKE_TMP/hidden-register.html"
check_hidden_redirect '/farm' home "$SMOKE_TMP/hidden-farm.html"
check_hidden_redirect '/games/arena' home-or-games "$SMOKE_TMP/hidden-arena.html"
check_hidden_redirect '/games/high-low' home-or-games "$SMOKE_TMP/hidden-high-low.html"

# Vite serves an SPA shell for every public route. Inspect the entry bundle and
# the lazy office-battle and game chunks as well, otherwise curl would not see rendered copy.
: > "$SMOKE_TMP/public-artifacts.txt"
cat "$SMOKE_TMP/home.html" "$SMOKE_TMP/games.html" >> \
  "$SMOKE_TMP/public-artifacts.txt"

grep -a -E -o '/assets/[A-Za-z0-9._/-]+\.js' "$SMOKE_TMP/home.html" |
  sort -u > "$SMOKE_TMP/entry-assets.txt"
[ -s "$SMOKE_TMP/entry-assets.txt" ] ||
  fail "homepage does not reference a built JavaScript entry"

entry_count=$(wc -l < "$SMOKE_TMP/entry-assets.txt" | tr -d ' ')
[ "$entry_count" -le 3 ] ||
  fail "homepage references $entry_count entry scripts; refusing a noisy smoke test"

entry_index=0
while IFS= read -r entry_path; do
  [ -n "$entry_path" ] || continue
  entry_index=$((entry_index + 1))
  entry_file="$SMOKE_TMP/entry-$entry_index.js"
  fetch_exact "$entry_path" 200 "$entry_file"
  cat "$entry_file" >> "$SMOKE_TMP/public-artifacts.txt"
done < "$SMOKE_TMP/entry-assets.txt"

grep -a -E -o 'assets/[A-Za-z0-9._/-]+\.js' "$SMOKE_TMP/public-artifacts.txt" |
  grep -E '(OfficeBattlePage|PublicGamesPage|SnakeGamePage|TetrisGamePage|TankBattlePage|ThreeSumGamePage)-' |
  sed 's#^#/#' |
  sort -u > "$SMOKE_TMP/game-assets.txt"

game_asset_count=$(wc -l < "$SMOKE_TMP/game-assets.txt" | tr -d ' ')
[ "$game_asset_count" -ge 6 ] ||
  fail "found only $game_asset_count of the 6 expected public interactive chunks"
[ "$game_asset_count" -le 9 ] ||
  fail "found $game_asset_count game chunks; refusing a noisy smoke test"

game_asset_index=0
while IFS= read -r game_asset_path; do
  [ -n "$game_asset_path" ] || continue
  game_asset_index=$((game_asset_index + 1))
  game_asset_file="$SMOKE_TMP/game-asset-$game_asset_index.js"
  fetch_exact "$game_asset_path" 200 "$game_asset_file"
  cat "$game_asset_file" >> "$SMOKE_TMP/public-artifacts.txt"
done < "$SMOKE_TMP/game-assets.txt"

# Required public identity, product copy, games and ICP record.
require_literal "$SMOKE_TMP/home.html" \
  '办公室主题轻社区，提供本机办公室乐斗、浏览器工具与轻量单机游戏' \
  'public homepage metadata'
require_literal "$SMOKE_TMP/public-artifacts.txt" \
  '把工作里的角色，带进一个更有意思的办公室世界' \
  'public homepage copy'
require_literal "$SMOKE_TMP/public-artifacts.txt" '办公室乐斗' 'office battle title'
require_literal "$SMOKE_TMP/public-artifacts.txt" '程序员' 'developer profession'
require_literal "$SMOKE_TMP/public-artifacts.txt" '人力资源管理' 'HR profession'
require_literal "$SMOKE_TMP/public-artifacts.txt" '6 个装备位' 'six equipment slots'
require_literal "$SMOKE_TMP/public-artifacts.txt" \
  '经典小游戏' \
  'public games copy'
require_literal "$SMOKE_TMP/public-artifacts.txt" '俄罗斯方块' 'tetris title'
require_literal "$SMOKE_TMP/public-artifacts.txt" '坦克大战' 'tank game title'
require_literal "$SMOKE_TMP/public-artifacts.txt" \
  '浙ICP备2026060298号' \
  'ICP record'
require_literal "$SMOKE_TMP/public-artifacts.txt" \
  '浏览器本地存储仅用于保存部分单机游戏记录和办公室乐斗试玩进度' \
  'local progress storage disclosure'
require_literal "$SMOKE_TMP/public-artifacts.txt" \
  '不提供用户间互动、充值、提现、概率付费或交易功能' \
  'public game service boundary'
require_literal "$SMOKE_TMP/public-artifacts.txt" \
  '个人信息处理者' \
  'privacy processor disclosure'
require_literal "$SMOKE_TMP/public-artifacts.txt" \
  '个人信息权利请求' \
  'privacy rights request channel'
require_literal "$SMOKE_TMP/public-artifacts.txt" \
  '常规访问日志保存期限为 0 天' \
  'zero-day public application log retention'

# Public artifacts must not contain review/PII text or hidden full-site features.
forbid_regex "$SMOKE_TMP/public-artifacts.txt" \
  '审核|上线准备|暂未开放|网站主办者' \
  'review/operator/contact wording'
forbid_regex "$SMOKE_TMP/public-artifacts.txt" \
  '创建本机账户|账户注册与登录|成长农场|午休斗技场|午休竞技场|比大小|个人文档库|上传文档|每日签到|任务中心|/api/auth|/api/v1|/games/arena|/games/high-low' \
  'hidden full-site feature wording'

pass "public smoke completed with $smoke_request_number serial read-only requests"
