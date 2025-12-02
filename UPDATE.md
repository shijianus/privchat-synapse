# privchat-synapse 部署進度匯報（截至 2025-11-29）

## 1. 專案與部署目標

* 專案路徑：`/home/shijian/projects/privchat-synapse`
* 目標：

  * 在 **Ubuntu Server** 上部署 Matrix Synapse（帶 Dashboard 整合）
  * 只在本機端口提供服務（`127.0.0.1`），透過 **Cloudflare Tunnel** 做內網穿透
  * 對外暴露的最終域名：`chat.831511.xyz`

---

## 2. PostgreSQL 資料庫初始化

### 2.1 啟動服務

* 透過 `systemctl` 啟動 PostgreSQL（先前已完成）並確保服務運行。

### 2.2 建立 Synapse 專用使用者與資料庫

在專案目錄下執行：

```bash
sudo -u postgres psql << 'EOSQL'
CREATE USER synapse_user WITH PASSWORD 'SmartKevin520';

CREATE DATABASE synapse
  WITH ENCODING='UTF8'
       LC_COLLATE='C'
       LC_CTYPE='C'
       TEMPLATE=template0
       OWNER synapse_user;

GRANT ALL PRIVILEGES ON DATABASE synapse TO synapse_user;
EOSQL
```

### 2.3 驗證建立結果

* 查詢資料庫：

  ```bash
  sudo -u postgres psql -c "SELECT datname FROM pg_database WHERE datname='synapse';"
  ```

  返回：

  ```text
   datname
  ---------
   synapse
  (1 row)
  ```

* 查詢使用者：

  ```bash
  sudo -u postgres psql -c "SELECT usename FROM pg_user WHERE usename='synapse_user';"
  ```

  返回：

  ```text
     usename
  --------------
   synapse_user
  (1 row)
  ```

> 結論：`synapse` 資料庫與 `synapse_user` 使用者建立成功，密碼為 `SmartKevin520`，後續已在 `homeserver.yaml` 中對應設定。

---

## 3. Redis 服務準備

### 3.1 啟動與開機自啟

執行：

```bash
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### 3.2 驗證 Redis 狀態

使用：

```bash
sudo systemctl status redis-server
```

關鍵狀態輸出：

```text
● redis-server.service - Advanced key-value store
     Loaded: loaded (...; enabled; preset: enabled)
     Active: active (running) since Sat 2025-11-29 00:51:09 UTC; 6h ago
     Status: "Ready to accept connections"
     ...
     └─ "/usr/bin/redis-server 127.0.0.1:6379"
```

> 結論：Redis 已啟動且設為開機自啟，監聽 `127.0.0.1:6379`，狀態正常。

---

## 4. Synapse 系統帳號與目錄結構

### 4.1 系統帳號與群組

先前已存在 `synapse` 系統使用者，指令：

```bash
sudo adduser --system --no-create-home synapse
```

回應：

```text
info: The system user `synapse' already exists. Exiting.
```

隨後建立群組並調整主群組：

```bash
sudo addgroup synapse
sudo usermod -g synapse synapse
```

驗證：

```bash
id synapse
```

輸出：

```text
uid=112(synapse) gid=1001(synapse) groups=1001(synapse)
```

> 結論：`synapse` 使用者主群組為 `synapse`（GID 1001），符合預期。

### 4.2 Synapse 相關目錄與權限

建立目錄：

```bash
sudo mkdir -p /var/lib/matrix-synapse/media_store
sudo mkdir -p /var/log/matrix-synapse
sudo mkdir -p /etc/matrix-synapse
```

設定擁有者：

```bash
sudo chown -R synapse:synapse /var/lib/matrix-synapse
sudo chown -R synapse:synapse /var/log/matrix-synapse
sudo chown -R synapse:synapse /etc/matrix-synapse
```

設定權限：

```bash
sudo chmod 700 /var/lib/matrix-synapse
sudo chmod 750 /var/log/matrix-synapse
sudo chmod 700 /etc/matrix-synapse
```

> 結論：Synapse 資料目錄、日誌目錄與配置目錄已建立，權限收斂到 `synapse` 系統帳號，外部使用者無法直接存取 `/etc/matrix-synapse`（符合安全預期）。

---

## 5. Python 依賴安裝與 Rust 元件建置

### 5.1 設定 PATH 並進入專案

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /home/shijian/projects/privchat-synapse
```

### 5.2 使用 Poetry 安裝依賴

執行：

```bash
poetry install
```

關鍵結果：

* 建立虛擬環境：

  ```text
  Creating virtualenv matrix-synapse-ZxT95rQn-py3.12 in /home/shijian/.cache/pypoetry/virtualenvs
  ```

* 安裝 dependencies 與專案本身：

  ```text
  Installing dependencies from lock file
  ...
  Installing the current project: matrix-synapse (1.143.0rc2)
  ```

> 結論：專案 `matrix-synapse (1.143.0rc2)` 已成功安裝到 Poetry 虛擬環境中。

### 5.3 建置 Rust 元件

執行：

```bash
poetry run python build_rust.py
```

指令執行後無錯誤輸出，表示 Rust 相關元件建置流程正常結束。

> 結論：Synapse 所需的 Rust 部分已完成建置。

---

## 6. 簽名密鑰（Signing Key）生成與部署

### 6.1 使用 Synapse CLI 生成簽名密鑰

在專案目錄中執行：

```bash
cd ~/projects/privchat-synapse

poetry run generate_signing_key \
  --output_file /tmp/chat.831511.xyz.signing.key
```

檢查輸出檔案：

```bash
ls -l /tmp/chat.831511.xyz.signing.key
```

返回：

```text
-rw-r----- 1 shijian shijian 59 Nov 29 09:21 /tmp/chat.831511.xyz.signing.key
```

> 說明：`generate_signing_key` 取代舊版 `synapse.crypto.keygen`，用於生成 ed25519 簽名密鑰。

### 6.2 將密鑰移至正式位置並收斂權限

執行：

```bash
sudo mv /tmp/chat.831511.xyz.signing.key /etc/matrix-synapse/
sudo chown synapse:synapse /etc/matrix-synapse/chat.831511.xyz.signing.key
sudo chmod 600 /etc/matrix-synapse/chat.831511.xyz.signing.key
```

以 root 檢查：

```bash
sudo -i
cd /etc/matrix-synapse/
ll
```

輸出：

```text
total 12
drwx------   2 synapse synapse 4096 Nov 29 09:22 ./
drwxr-xr-x 116 root    root    4096 Nov 29 07:05 ../
-rw-------   1 synapse synapse   59 Nov 29 09:21 chat.831511.xyz.signing.key
```

> 結論：
>
> * `/etc/matrix-synapse` 目錄權限 `700`，owner 為 `synapse:synapse`
> * `chat.831511.xyz.signing.key` 檔案權限 `600`，owner 為 `synapse:synapse`
> * 非 root / 非 synapse 使用者無法進入該目錄或讀取密鑰，符合安全設計。
> * 後續在 `homeserver.yaml` 中使用路徑：`/etc/matrix-synapse/chat.831511.xyz.signing.key`。

---

## 7. Synapse 主配置檔 homeserver.yaml 調整

### 7.1 複製生產配置模板至系統目錄

在專案目錄中執行：

```bash
cd ~/projects/privchat-synapse

sudo cp config/homeserver_matrix_production.yaml /etc/matrix-synapse/homeserver.yaml
sudo cp config/log_config_production.yaml       /etc/matrix-synapse/log_config.yaml
```

調整擁有者與權限：

```bash
sudo chown synapse:synapse /etc/matrix-synapse/homeserver.yaml
sudo chown synapse:synapse /etc/matrix-synapse/log_config.yaml
sudo chmod 600 /etc/matrix-synapse/homeserver.yaml
sudo chmod 644 /etc/matrix-synapse/log_config.yaml
```

### 7.2 編輯 homeserver.yaml 核心配置

使用：

```bash
sudo vi /etc/matrix-synapse/homeserver.yaml
```

並完成以下關鍵項目修改（目前檔案實際內容如下片段所示）：

#### 7.2.1 基本伺服器設定

```yaml
# 伺服器名稱（重要：設定後不可更改）
server_name: "chat.831511.xyz"

pid_file: "/var/lib/matrix-synapse/homeserver.pid"

listeners:
  - port: 8008
    type: http
    tls: false
    x_forwarded: true
    bind_addresses: ['127.0.0.1']
    resources:
      - names: [client, federation]
        compress: false
  - port: 8088
    type: http
    tls: false
    bind_addresses: ['127.0.0.1']
    resources:
      - names: [health]

public_baseurl: "https://chat.831511.xyz"
```

#### 7.2.2 資料庫連線配置

```yaml
database:
  name: psycopg2
  args:
    user: synapse_user
    password: "SmartKevin520"
    dbname: synapse
    host: 127.0.0.1
    port: 5432
    cp_min: 5
    cp_max: 10
    keepalives_idle: 10
    keepalives_interval: 10
    keepalives_count: 3
    query_timeout: 30
    options: "-c default_transaction_isolation=read_committed -c synchronous_commit=off -c statement_timeout=30000"
```

> 重點：`password` 已與 PostgreSQL 中 `synapse_user` 的實際密碼一致（`SmartKevin520`）。

#### 7.2.3 註冊與安全配置

```yaml
registration:
  enable_registration: false
  registration_shared_secret: "8dd73c6bc6d30f76bf89f263ba56965d4c50dfd1a02407fb8287f5feedbdd950"
  auto_join_rooms: []
  disable_msisdn_registration: true
```

> 目前關閉公開註冊，保留透過 shared secret / 儀錶板等方式進行受控創建帳號的可能。

#### 7.2.4 簽名密鑰與信任伺服器

```yaml
signing_key_path: "/etc/matrix-synapse/chat.831511.xyz.signing.key"

trusted_key_servers:
  - server_name: "matrix.org"
```

#### 7.2.5 媒體與日誌配置

```yaml
media_store_path: "/var/lib/matrix-synapse/media_store"

log_config: "/etc/matrix-synapse/log_config.yaml"
log_level: "INFO"
```

#### 7.2.6 Redis 與 Dashboard 整合

```yaml
redis:
  enabled: true
  host: 127.0.0.1
  port: 6379
  password: ""
  dbid: 0
  max_connections: 10

dashboard:
  enabled: true
  default_cache_ttl_seconds: 300
  redis_channel_user_events:
    - "dashboard.user.invalidate"
    - "dashboard.user.force_disconnect"
  database_pool_size: 10
  cache_refresh_interval: 60

modules:
  - module: "synapse.dashboard_integration.DashboardIntegrationModule"
    config:
      enabled: true
```

> 結論：目前 `homeserver.yaml` 已根據實際域名、資料庫憑證、signing key 路徑與 Redis/Dashboard 集成方案做完對齊。

---

## 8. 目前整體狀態小結

截至目前，你已完成的工作包括：

1. **資料庫層面**

   * 建立 PostgreSQL 使用者 `synapse_user`，密碼 `SmartKevin520`
   * 建立資料庫 `synapse` 並授予完整權限
   * 驗證 DB 與 user 均存在

2. **缓存與中介服務**

   * 啟動並啟用 `redis-server`，運作正常（`active (running)`）

3. **系統帳號與檔案結構**

   * 確保 `synapse` 系統使用者與 `synapse` 群組存在，主群組為 `synapse`
   * 建立 `/var/lib/matrix-synapse`、`/var/log/matrix-synapse`、`/etc/matrix-synapse` 並授予 `synapse:synapse` 權限
   * 收斂上述目錄的權限，避免一般使用者直接存取配置與資料

4. **應用依賴與編譯**

   * 使用 Poetry 建立虛擬環境並安裝 `matrix-synapse (1.143.0rc2)` 所有依賴
   * 成功執行 `build_rust.py` 完成 Rust 元件建置

5. **安全密鑰**

   * 透過 `poetry run generate_signing_key` 生成簽名密鑰
   * 將 `chat.831511.xyz.signing.key` 移至 `/etc/matrix-synapse`，設定 owner 為 `synapse:synapse`、權限為 `600`

6. **Synapse 主配置**

   * 將 `config/homeserver_matrix_production.yaml` 複製為 `/etc/matrix-synapse/homeserver.yaml`
   * 將 `config/log_config_production.yaml` 複製為 `/etc/matrix-synapse/log_config.yaml`
   * 在 `homeserver.yaml` 中完成以下關鍵設定：

     * `server_name: "chat.831511.xyz"`
     * `public_baseurl: "https://chat.831511.xyz"`
     * 資料庫連線參數，包含 `user: synapse_user`、`password: "SmartKevin520"`、`dbname: synapse` 等
     * `registration_shared_secret` 設定為強隨機值
     * `signing_key_path: "/etc/matrix-synapse/chat.831511.xyz.signing.key"`
     * 啟用 Redis 及 Dashboard 整合配置

整體來看，**基礎服務（PostgreSQL、Redis）、Synapse 系統帳號與檔案權限、依賴安裝、簽名密鑰與主配置檔** 都已完成，整個 Synapse 服務已具備啟動條件，並且配置已與目標域名 `chat.831511.xyz` 和實際資料庫憑證保持一致。

