#!/usr/bin/env bash

# 生产更新脚本：拉取最新代码，滚动重启核心服务

set -euo pipefail

COMPOSE_FILE="docker-compose.production.yml"

step(){ echo -e "\033[0;34m[STEP]\033[0m $*"; }
ok(){ echo -e "\033[0;32m[OK]\033[0m $*"; }

step "拉取最新代码"
git fetch --all --prune
git pull --rebase || true

step "构建镜像"
docker compose -f "$COMPOSE_FILE" build --no-cache

step "重启服务（保持数据卷）"
docker compose -f "$COMPOSE_FILE" up -d

step "健康检查"
bash scripts/health-check.sh

ok "更新完成"

