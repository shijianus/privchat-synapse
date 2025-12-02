#!/bin/bash

# 创建管理员用户的脚本
set -euo pipefail

echo "👤 创建 Matrix 管理员用户..."

# 管理员用户配置
ADMIN_USER="admin"
ADMIN_PASSWORD="AwY1zB0mSqGqb94VVBw7IG71ZbPwfmgu"

echo "切换到项目目录..."
cd /home/shijian/projects/privchat-synapse

echo "创建管理员账户..."
export PATH="$HOME/.local/bin:$PATH"
/root/.local/bin/poetry run register_new_matrix_user \
    --config /etc/matrix-synapse/homeserver.yaml \
    --user "$ADMIN_USER" \
    --password "$ADMIN_PASSWORD" \
    --admin

echo "✅ 管理员用户创建完成"
echo "用户名: $ADMIN_USER"
echo "密码: $ADMIN_PASSWORD"
echo "服务器: https://chat.831511.xyz"
echo
echo "💡 现在您可以使用以下信息登录："
echo "   - 客户端: Element Web/Android/iOS"
echo "   - 服务器地址: https://chat.831511.xyz"
echo "   - 用户名: @admin:chat.831511.xyz"
echo "   - 密码: $ADMIN_PASSWORD"