#!/usr/bin/env bash
# 停止前端/后端/数据库
ROOT="$(cd "$(dirname "$0")" && pwd)"
pkill -f "next start" 2>/dev/null || true
pkill -f "ts-node src/main.ts" 2>/dev/null || true
pkill -f "node dist/main.js" 2>/dev/null || true
if [ -f "$ROOT/mariadb-tmp/mariadbd.pid" ]; then
  kill "$(cat "$ROOT/mariadb-tmp/mariadbd.pid")" 2>/dev/null || true
fi
echo "已停止前端、后端与 MariaDB"
