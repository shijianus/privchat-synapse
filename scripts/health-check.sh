#!/usr/bin/env bash

# 系统健康检查脚本（适用于 docker-compose.production.yml）
# 用途：快速验证各服务是否健康并联通

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info(){ echo -e "${BLUE}[INFO]${NC} $*"; }
ok(){ echo -e "${GREEN}[OK]${NC} $*"; }
warn(){ echo -e "${YELLOW}[WARN]${NC} $*"; }
err(){ echo -e "${RED}[ERR]${NC} $*"; }

COMPOSE_FILE="docker-compose.production.yml"

require(){ command -v "$1" &>/dev/null || { err "缺少命令：$1"; exit 1; }; }
require docker
require bash

check_http(){
  local name="$1"; shift
  local url="$1"; shift
  local container="$1"; shift

  info "检查 $name: $url"
  if docker exec "$container" sh -lc "curl -fsSL --max-time 5 '$url'" >/dev/null; then
    ok "$name 健康"
  else
    err "$name 不健康或无法访问"
    return 1
  fi
}

main(){
  info "验证容器运行状态"
  docker compose -f "$COMPOSE_FILE" ps

  local rc=0

  check_http "PostgreSQL" "http://localhost:5432" "matrix-postgres" || rc=1
  check_http "Redis" "http://localhost:6379" "matrix-redis" || rc=1
  check_http "Synapse" "http://localhost:8008/health" "matrix-synapse" || rc=1
  check_http "Dashboard Backend" "http://localhost:3001/health" "dashboard-backend" || rc=1
  check_http "Dashboard Bot" "http://localhost:3002/health" "dashboard-bot" || rc=1
  check_http "Dashboard Frontend" "http://localhost:3000" "dashboard-frontend" || rc=1
  check_http "Nginx" "http://localhost/health" "matrix-nginx" || rc=1

  if [ "$rc" -eq 0 ]; then
    ok "所有服务健康检查通过"
  else
    err "部分服务健康检查失败"
  fi

  exit "$rc"
}

main "$@"

