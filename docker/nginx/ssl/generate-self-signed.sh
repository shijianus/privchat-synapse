#!/usr/bin/env bash

# 自签名证书生成脚本（开发/测试用）
# 使用方法：在仓库根目录执行
#   bash docker/nginx/ssl/generate-self-signed.sh "your.domain.example"

set -euo pipefail

DOMAINS_RAW=${1:-"localhost"}
OUT_DIR="$(cd "$(dirname "$0")" && pwd)"

IFS=',' read -r -a DOMAINS <<< "$DOMAINS_RAW"
PRIMARY_CN="${DOMAINS[0]}"

ALT_NAMES=""
for NAME in "${DOMAINS[@]}"; do
  ALT_NAMES+="DNS:${NAME},"
done
ALT_NAMES+="DNS:localhost,IP:127.0.0.1"

echo "[INFO] 生成自签名证书到: $OUT_DIR (CN=$PRIMARY_CN, SAN=$ALT_NAMES)"
openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
  -keyout "$OUT_DIR/key.pem" \
  -out "$OUT_DIR/cert.pem" \
  -subj "/C=CN/ST=Dev/L=Dev/O=Dev/OU=Dev/CN=$PRIMARY_CN" \
  -addext "subjectAltName=${ALT_NAMES}"

echo "[OK] 自签名证书已生成："
echo "  cert: $OUT_DIR/cert.pem"
echo "  key : $OUT_DIR/key.pem"
