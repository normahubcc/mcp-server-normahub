#!/usr/bin/env bash
# Публикация @normahub/mcp-server без токена в командной строке.
#
# Токен лежит в файле с правами 600 и не попадает ни в argv, ни в историю
# shell: npm получает его через временный .npmrc, который удаляется трапом.
# Без файла скрипт падает до запуска сборки — лучше упасть здесь, чем узнать
# о проблеме после трёхминутного прогона тестов.
#
# Использование:
#   ./scripts/publish.sh              # реальная публикация
#   ./scripts/publish.sh --dry-run    # проверка без отправки в реестр
set -euo pipefail

cd "$(dirname "$0")/.."

private_dir="${NORMAHUB_PRIVATE_DIR:-$HOME/.private}"
token_file="$private_dir/npm-token"

die() { echo "publish: $*" >&2; exit 1; }

[[ -f "$token_file" ]] || die "нет файла с токеном: $token_file (права 600, только для владельца)"

mode="$(stat -c '%a' "$token_file" 2>/dev/null || stat -f '%Lp' "$token_file")"
case "$mode" in
  600|400) ;;
  *) die "у $token_file права $mode — нужно 600 или 400" ;;
esac

token="$(tr -d '\r\n' < "$token_file")"
[[ -n "$token" ]] || die "файл $token_file пуст"

echo "== preflight"
npm run --silent check:release
echo "== tests"
npm test --silent

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT INT TERM
umask 077
printf '//registry.npmjs.org/:_authToken=%s\n' "$token" > "$workdir/.npmrc"

echo "== publish $(node -p "require('./package.json').name + '@' + require('./package.json').version")"
npm publish --access public --userconfig "$workdir/.npmrc" "$@"

echo "== done. Проверьте: npm view $(node -p "require('./package.json').name") version"