#!/usr/bin/env bash
# 一键启动: MariaDB + NestJS 后端(:4000) + Next.js 前端(:3000)
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# 1. MariaDB(首次需已解压 mariadb/ 并初始化 mariadb-data/,见 README)
if ! ./mariadb/bin/mysqladmin --no-defaults -S "$ROOT/mariadb-tmp/mysql.sock" ping >/dev/null 2>&1; then
  echo "[start] 启动 MariaDB (127.0.0.1:3307)..."
  mkdir -p mariadb-tmp
  nohup ./mariadb/bin/mariadbd --no-defaults \
    --basedir="$ROOT/mariadb" --datadir="$ROOT/mariadb-data" \
    --socket="$ROOT/mariadb-tmp/mysql.sock" --port=3307 \
    --bind-address=127.0.0.1 --pid-file="$ROOT/mariadb-tmp/mariadbd.pid" \
    > "$ROOT/mariadb-tmp/mariadbd.log" 2>&1 &
  for i in $(seq 1 30); do
    ./mariadb/bin/mysqladmin --no-defaults -S "$ROOT/mariadb-tmp/mysql.sock" ping >/dev/null 2>&1 && break
    sleep 1
  done
fi
echo "[start] MariaDB OK"

# 2. 后端
if ! curl -s -o /dev/null http://localhost:4000/api/auth/me; then
  echo "[start] 启动后端 API (:4000)..."
  (cd server && nohup npm run dev > /tmp/pet-server.log 2>&1 &)
  for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:4000/api/auth/me && break; sleep 2; done
fi
echo "[start] 后端 OK"

# 3. 前端
if ! curl -s -o /dev/null http://localhost:3000/login; then
  echo "[start] 启动前端 (:3000)..."
  (cd web && nohup npm run start > /tmp/pet-web.log 2>&1 &)
  for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:3000/login && break; sleep 2; done
fi
echo "[start] 前端 OK"
echo ""
echo "访问 http://localhost:3000  (测试账号见 README,密码均 123456)"
