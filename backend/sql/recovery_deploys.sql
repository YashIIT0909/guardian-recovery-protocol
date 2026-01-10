-- Multi-signature Recovery Deploys Table
-- This table stores deploys for multi-sig recovery operations
-- deploy_json stores the original unsigned deploy
-- signed_deploys stores the chain of signed versions as guardians add signatures

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS recovery_deploys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recovery_id TEXT NOT NULL,               -- Contract recovery ID
    target_account TEXT NOT NULL,            -- Target account public key
    new_public_key TEXT NOT NULL,            -- New key to be added
    deploy_type TEXT NOT NULL,               -- 'key_rotation' | 'add_key' | 'remove_key' | 'update_thresholds'
    deploy_json JSONB,                       -- Original unsigned deploy JSON
    signed_deploys JSONB[] DEFAULT '{}',     -- Array of signed deploy JSONs (each guardian adds their signature)
    threshold INTEGER NOT NULL,              -- Required threshold
    status TEXT DEFAULT 'pending',           -- 'pending' | 'ready' | 'sent' | 'confirmed' | 'failed'
    deploy_hash TEXT,                        -- Set after sending to network
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_recovery_deploys_recovery_id ON recovery_deploys(recovery_id);
CREATE INDEX IF NOT EXISTS idx_recovery_deploys_target_account ON recovery_deploys(target_account);
CREATE INDEX IF NOT EXISTS idx_recovery_deploys_status ON recovery_deploys(status);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_recovery_deploys_updated_at ON recovery_deploys;
CREATE TRIGGER update_recovery_deploys_updated_at
    BEFORE UPDATE ON recovery_deploys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
