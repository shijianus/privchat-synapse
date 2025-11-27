#!/usr/bin/env bash

# 回滚脚本（基础版）：回滚至指定 Git 提交或标签后重启服务

set -euo pipefail

TARGET_REF=${1:-}
COMPOSE_FILE="docker-compose.production.yml"

if [ -z "$TARGET_REF" ]; then
  echo "用法: $0 <git-ref>"
  echo "示例: $0 v1.0.7 或 $0 1a2b3c4d"
  exit 1
fi

echo "[STEP] 回退至 $TARGET_REF"
git fetch --all --tags
git checkout --detach "$TARGET_REF"

echo "[STEP] 重建镜像并启动"
docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d

echo "[STEP] 健康检查"
bash scripts/health-check.sh || {
  echo "[ERR] 回滚后健康检查失败，请检查日志"
  exit 1
}

echo "[OK] 回滚完成 -> $TARGET_REF"

