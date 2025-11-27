#!/usr/bin/env bash

# 自签名证书生成脚本（开发/测试用）
# 使用方法：在仓库根目录执行
#   bash docker/nginx/ssl/generate-self-signed.sh "your.domain.example"

set -euo pipefail

DOMAIN=${1:-"localhost"}
OUT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[INFO] 生成自签名证书到: $OUT_DIR (CN=$DOMAIN)"
openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
  -keyout "$OUT_DIR/key.pem" \
  -out "$OUT_DIR/cert.pem" \
  -subj "/C=CN/ST=Dev/L=Dev/O=Dev/OU=Dev/CN=$DOMAIN"

echo "[OK] 自签名证书已生成："
echo "  cert: $OUT_DIR/cert.pem"
echo "  key : $OUT_DIR/key.pem"

