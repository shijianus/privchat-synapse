#!/usr/bin/env bash

# 生产数据备份脚本
# - 备份 PostgreSQL、Redis、Synapse 媒体存储

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info(){ echo -e "${BLUE}[INFO]${NC} $*"; }
ok(){ echo -e "${GREEN}[OK]${NC} $*"; }
err(){ echo -e "${RED}[ERR]${NC} $*"; }

BACKUP_DIR=${BACKUP_DIR:-"/var/backups/matrix-dashboard"}
TS=$(date +"%Y%m%d_%H%M%S")
OUT_DIR="$BACKUP_DIR/$TS"

mkdir -p "$OUT_DIR"

backup_postgres(){
  info "备份 PostgreSQL 数据库"
  docker exec matrix-postgres pg_dump -U synapse synapse >"$OUT_DIR/postgres.sql" || {
    err "PostgreSQL 备份失败"; return 1; }
  ok "PostgreSQL 备份完成: $OUT_DIR/postgres.sql"
}

backup_redis(){
  info "备份 Redis 数据"
  docker exec matrix-redis sh -lc 'redis-cli BGSAVE && sleep 2 && cp /data/dump.rdb /tmp/dump.rdb'
  docker cp matrix-redis:/tmp/dump.rdb "$OUT_DIR/redis.rdb" || {
    err "Redis 备份失败"; return 1; }
  ok "Redis 备份完成: $OUT_DIR/redis.rdb"
}

backup_media(){
  info "备份媒体存储（可能较大）"
  tar -C . -czf "$OUT_DIR/media_store.tgz" ./docker/media_store 2>/dev/null || true
  # 如果媒体卷未直接映射目录，可从容器内复制
  if [ ! -s "$OUT_DIR/media_store.tgz" ]; then
    docker run --rm -v synapse_data:/src -v "$OUT_DIR":/dst alpine sh -lc \
      'cd /src && tar -czf /dst/media_store.tgz media_store 2>/dev/null || true'
  fi
  ok "媒体存储打包完成: $OUT_DIR/media_store.tgz"
}

main(){
  info "开始数据备份 -> $OUT_DIR"
  backup_postgres || true
  backup_redis || true
  backup_media || true
  ok "备份结束: $OUT_DIR"
}

main "$@"

