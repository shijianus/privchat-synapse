#!/bin/bash

# Matrix Synapse 密钥生成脚本
set -euo pipefail

echo "🔐 生成 Synapse 签名密钥..."

# 生成签名密钥
sudo -u synapse bash -c "cd /etc/matrix-synapse && /root/.local/bin/poetry run python -m synapse.crypto.keygen --key-type ed25519 --output \"/etc/matrix-synapse/chat.831511.xyz.signing.key\""

# 设置权限
sudo chmod 600 /etc/matrix-synapse/chat.831511.xyz.signing.key
sudo chown synapse:synapse /etc/matrix-synapse/chat.831511.xyz.signing.key

echo "✅ 签名密钥生成完成"
ls -la /etc/matrix-synapse/