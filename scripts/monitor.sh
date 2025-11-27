#!/usr/bin/env bash

# 简单的运行时监控脚本（围绕容器与端口健康）

set -euo pipefail

interval=${1:-10}

echo "[INFO] 每 ${interval}s 输出一次 docker stats，Ctrl+C 退出"

while true; do
  date '+%F %T'
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}' || true
  echo "-- 健康检查 --"
  for c in matrix-postgres matrix-redis matrix-synapse dashboard-backend dashboard-bot dashboard-frontend matrix-nginx; do
    if docker inspect -f '{{.State.Health.Status}}' "$c" 2>/dev/null | grep -q healthy; then
      echo "  $c: healthy"
    else
      echo "  $c: unknown/unhealthy"
    fi
  done
  echo
  sleep "$interval"
done

