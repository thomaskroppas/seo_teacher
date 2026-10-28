#!/usr/bin/env bash
# Локальный стенд для тестов: mock OpenAI :9101 -> relay :8787 -> PHP :8080 (pid-файлы в /tmp/claude-0/stack)
cd "$(dirname "$0")/../.."
D=/tmp/claude-0/stack; mkdir -p $D
case "$1" in
  start)
    PORT=9101 nohup node tests/e2e/mock-openai.js > $D/mock.log 2>&1 & echo $! > $D/mock.pid
    RELAY_SECRET=relaysecret123 OPENAI_API_KEY=sk-mock OPENAI_BASE_URL=http://127.0.0.1:9101 PORT=8787 nohup node relay/server.js > $D/relay.log 2>&1 & echo $! > $D/relay.pid
    nohup php -S 127.0.0.1:8080 -t . > $D/php.log 2>&1 & echo $! > $D/php.pid
    sleep 1.5; echo started;;
  stop) for n in mock relay php; do [ -f $D/$n.pid ] && kill $(cat $D/$n.pid) 2>/dev/null; rm -f $D/$n.pid; done; echo stopped;;
esac
