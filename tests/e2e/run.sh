#!/usr/bin/env bash
# Полный прогон: стенд + тесты API + тесты интерфейса. Требуются php, node, playwright (PLAYWRIGHT_PATH).
set -e
cd "$(dirname "$0")/../.."
DATA=$(php -r '$c=require "api/config.php"; echo $c["data_dir"];')
tests/e2e/stack.sh stop >/dev/null 2>&1 || true
rm -rf "$DATA"; tests/e2e/stack.sh start
node tests/e2e/api.test.js
rm -rf "$DATA"
node tests/e2e/ui.test.js
tests/e2e/stack.sh stop
