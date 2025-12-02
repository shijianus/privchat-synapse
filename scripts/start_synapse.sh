#!/bin/bash

# 启动 Synapse 服务的脚本
set -euo pipefail

echo "🚀 启动 Matrix Synapse 服务..."

# 创建 systemd 服务文件
echo "创建 systemd 服务文件..."
sudo tee /etc/systemd/system/matrix-synapse.service > /dev/null << 'EOF'
[Unit]
Description=Matrix Synapse homeserver
After=network-online.target postgresql.service redis.service
Wants=network-online.target postgresql.service redis.service

[Service]
Type=notify
NotifyAccess=all
User=synapse
Group=synapse
WorkingDirectory=/var/lib/matrix-synapse
Environment=PATH=/root/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=PYTHONPATH=/home/shijian/projects/privchat-synapse
ExecStart=/root/.local/bin/poetry run python -m synapse.app.homeserver \
    --config-path=/etc/matrix-synapse/homeserver.yaml \
    --config-path=/etc/matrix-synapse/log_config.yaml
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

echo "重新加载 systemd..."
sudo systemctl daemon-reload

echo "启用 Synapse 服务..."
sudo systemctl enable matrix-synapse

echo "启动 Synapse 服务..."
sudo systemctl start matrix-synapse

echo "检查 Synapse 服务状态..."
sudo systemctl status matrix-synapse --no-pager

echo "✅ Synapse 服务配置完成"
echo "💡 查看日志: sudo journalctl -u matrix-synapse -f --no-pager"