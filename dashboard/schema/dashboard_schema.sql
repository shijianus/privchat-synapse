-- DASHBOARD INTEGRATION: Dashboard schema定义，满足 REQUEST/ADVICE 要求

CREATE SCHEMA IF NOT EXISTS dashboard;

CREATE TABLE IF NOT EXISTS dashboard.user_profiles (
    id BIGSERIAL PRIMARY KEY,
    synapse_user_id TEXT NOT NULL UNIQUE,
    user_group TEXT NOT NULL DEFAULT 'general' CHECK (user_group IN ('free', 'standard', 'premium', 'enterprise')),
    registration_status TEXT NOT NULL DEFAULT 'active' CHECK (registration_status IN ('pending', 'active', 'suspended', 'deleted')),
    risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboard.user_bans (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES dashboard.user_profiles(id) ON DELETE CASCADE,
    ban_type TEXT NOT NULL CHECK (ban_type IN ('none', 'silence', 'soft_ban', 'hard_ban')),
    reason TEXT,
    evidence JSONB,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
    created_by TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_bans_user_idx ON dashboard.user_bans(user_id);
CREATE INDEX IF NOT EXISTS user_bans_status_idx ON dashboard.user_bans(status);

CREATE TABLE IF NOT EXISTS dashboard.user_appeals (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES dashboard.user_profiles(id) ON DELETE CASCADE,
    ban_id BIGINT REFERENCES dashboard.user_bans(id) ON DELETE SET NULL,
    contact_email TEXT,
    contact_matrix TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_appeals_user_idx ON dashboard.user_appeals(user_id);

CREATE TABLE IF NOT EXISTS dashboard.appeal_messages (
    id BIGSERIAL PRIMARY KEY,
    appeal_id BIGINT NOT NULL REFERENCES dashboard.user_appeals(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboard.operation_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_synapse_user_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operation_logs_actor_idx ON dashboard.operation_logs(actor_id);
CREATE INDEX IF NOT EXISTS operation_logs_target_idx ON dashboard.operation_logs(target_synapse_user_id) WHERE target_synapse_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS dashboard.media_metadata (
    id BIGSERIAL PRIMARY KEY,
    media_hash TEXT NOT NULL,
    uploader_id TEXT NOT NULL,
    room_id TEXT,
    content_type TEXT,
    size_bytes BIGINT,
    reference_count INTEGER NOT NULL DEFAULT 1,
    cooling_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS media_metadata_hash_idx ON dashboard.media_metadata(media_hash);

CREATE TABLE IF NOT EXISTS dashboard.storage_policies (
    id BIGSERIAL PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('global', 'room', 'user')),
    scope_id TEXT,
    min_retention_hours INTEGER NOT NULL,
    max_retention_hours INTEGER NOT NULL,
    cooling_period_hours INTEGER NOT NULL DEFAULT 24,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboard.media_sync_tasks (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT REFERENCES dashboard.storage_policies(id) ON DELETE SET NULL,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'paused', 'failed', 'completed')),
    queued_files INTEGER NOT NULL DEFAULT 0,
    processed_files INTEGER NOT NULL DEFAULT 0,
    failed_files INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboard.registration_applications (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    msisdn TEXT,
    ip_address TEXT NOT NULL,
    device_fingerprint TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewer TEXT,
    reviewer_note TEXT,
    synapse_user_id TEXT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS registration_applications_status_idx
    ON dashboard.registration_applications(status);

CREATE TABLE IF NOT EXISTS dashboard.registration_blacklist (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('username', 'email', 'msisdn', 'ip_address', 'device_fingerprint')),
    value TEXT NOT NULL,
    reason TEXT,
    created_by TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (type, value)
);

CREATE TABLE IF NOT EXISTS dashboard.system_config (
    config_key TEXT PRIMARY KEY,
    config_value JSONB NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dashboard.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard.user_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_policy ON dashboard.user_profiles
    FOR SELECT
    TO PUBLIC
    USING (true);

CREATE POLICY user_bans_policy ON dashboard.user_bans
    FOR SELECT
    TO PUBLIC
    USING (true);

CREATE TABLE IF NOT EXISTS dashboard.admin_users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'moderator', 'operator', 'viewer')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'locked')),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_users_role_idx ON dashboard.admin_users(role);
CREATE INDEX IF NOT EXISTS admin_users_status_idx ON dashboard.admin_users(status);

INSERT INTO dashboard.admin_users (email, password_hash, full_name, role)
VALUES (
    'admin@matrix.local',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewwMdpd1xjvP4j7W',
    'Default Administrator',
    'super_admin'
)
ON CONFLICT (email) DO NOTHING;

