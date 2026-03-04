-- Wingman Tech Platform - Supabase Schema
-- Run this in Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TABLE: closers
-- Stores Closer (agent) profiles
-- ============================================
CREATE TABLE IF NOT EXISTS closers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    balance DECIMAL(10,2) DEFAULT 0.00,
    min_balance DECIMAL(10,2) DEFAULT 0.50,
    is_available BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookup by email
CREATE INDEX IF NOT EXISTS idx_closers_email ON closers(email);

-- Index for finding available closers
CREATE INDEX IF NOT EXISTS idx_closers_available ON closers(is_available, balance);

-- ============================================
-- TABLE: closer_licenses
-- Stores state licenses for each Closer
-- ============================================
CREATE TABLE IF NOT EXISTS closer_licenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closer_id UUID NOT NULL REFERENCES closers(id) ON DELETE CASCADE,
    state_code CHAR(2) NOT NULL,
    license_number TEXT,
    verified BOOLEAN DEFAULT false,
    expires_at DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(closer_id, state_code)
);

-- Index for finding closers licensed in a state
CREATE INDEX IF NOT EXISTS idx_closer_licenses_state ON closer_licenses(state_code, verified);

-- ============================================
-- TABLE: area_code_mapping
-- Maps US area codes to state and city
-- ============================================
CREATE TABLE IF NOT EXISTS area_code_mapping (
    area_code CHAR(3) PRIMARY KEY,
    state_code CHAR(2) NOT NULL,
    state_name TEXT NOT NULL,
    city TEXT NOT NULL
);

-- Index for quick area code lookups
CREATE INDEX IF NOT EXISTS idx_area_code_state ON area_code_mapping(state_code);

-- ============================================
-- TABLE: call_logs
-- Stores all call records with encrypted phone numbers
-- ============================================
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Lead info (phone encrypted, rest stored normally)
    lead_phone_encrypted BYTEA NOT NULL,  -- AES-256 encrypted
    lead_phone_hash TEXT NOT NULL,         -- SHA-256 for lookup
    lead_email TEXT,
    lead_name TEXT,
    lead_company TEXT,
    lead_state CHAR(2),
    lead_city TEXT,

    -- Vapi call tracking
    vapi_call_id TEXT,

    -- Closer assignment
    closer_id UUID REFERENCES closers(id),

    -- Call status lifecycle
    status TEXT NOT NULL DEFAULT 'pending_call',
    -- Valid statuses: 'pending_call', 'calling', 'in_qualification',
    --                 'qualified', 'ringing_closers', 'connected',
    --                 'no_answer', 'dq', 'completed'

    -- Timestamps for each stage
    vapi_triggered_at TIMESTAMPTZ,
    lead_answered_at TIMESTAMPTZ,
    qualified_at TIMESTAMPTZ,
    closer_accepted_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    -- Call metrics
    duration_sec INTEGER,
    outcome TEXT,  -- 'approved', 'denied', 'callback'

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for finding calls by Vapi ID
CREATE INDEX IF NOT EXISTS idx_call_logs_vapi ON call_logs(vapi_call_id);

-- Index for phone hash lookup
CREATE INDEX IF NOT EXISTS idx_call_logs_phone_hash ON call_logs(lead_phone_hash);

-- Index for closer's call history
CREATE INDEX IF NOT EXISTS idx_call_logs_closer ON call_logs(closer_id, created_at DESC);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_call_logs_status ON call_logs(status);

-- ============================================
-- TABLE: callback_queue
-- Stores scheduled callbacks when no Closer available
-- ============================================
CREATE TABLE IF NOT EXISTS callback_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_log_id UUID REFERENCES call_logs(id),
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending',  -- 'pending', 'completed', 'cancelled'
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_callback_queue_scheduled ON callback_queue(scheduled_at, status);

-- ============================================
-- FUNCTION: Update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers for updated_at
CREATE TRIGGER update_closers_updated_at
    BEFORE UPDATE ON closers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_closer_licenses_updated_at
    BEFORE UPDATE ON closer_licenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_call_logs_updated_at
    BEFORE UPDATE ON call_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE closers ENABLE ROW LEVEL SECURITY;
ALTER TABLE closer_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE callback_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_code_mapping ENABLE ROW LEVEL SECURITY;

-- Closers: Users can only read/update their own profile
CREATE POLICY "Closers can view own profile"
    ON closers FOR SELECT
    USING (auth.uid()::text = id::text);

CREATE POLICY "Closers can update own profile"
    ON closers FOR UPDATE
    USING (auth.uid()::text = id::text);

-- Closer licenses: Users can manage their own licenses
CREATE POLICY "Closers can view own licenses"
    ON closer_licenses FOR SELECT
    USING (closer_id::text = auth.uid()::text);

CREATE POLICY "Closers can insert own licenses"
    ON closer_licenses FOR INSERT
    WITH CHECK (closer_id::text = auth.uid()::text);

CREATE POLICY "Closers can update own licenses"
    ON closer_licenses FOR UPDATE
    USING (closer_id::text = auth.uid()::text);

CREATE POLICY "Closers can delete own licenses"
    ON closer_licenses FOR DELETE
    USING (closer_id::text = auth.uid()::text);

-- Call logs: Closers can only view their own calls (no phone numbers exposed)
CREATE POLICY "Closers can view own calls"
    ON call_logs FOR SELECT
    USING (closer_id::text = auth.uid()::text);

-- Area code mapping: Everyone can read (public data)
CREATE POLICY "Area codes are public"
    ON area_code_mapping FOR SELECT
    TO authenticated
    USING (true);

-- ============================================
-- SERVICE ROLE POLICIES (for n8n backend)
-- These allow the service role to bypass RLS
-- ============================================

-- The service role can do everything (used by n8n)
-- This is automatic with Supabase service_role key

-- ============================================
-- FUNCTION: Find eligible closers for a lead
-- ============================================
CREATE OR REPLACE FUNCTION find_eligible_closers(lead_state_code CHAR(2))
RETURNS TABLE (
    closer_id UUID,
    email TEXT,
    full_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.email, c.full_name
    FROM closers c
    JOIN closer_licenses cl ON c.id = cl.closer_id
    WHERE c.is_available = true
      AND c.balance >= c.min_balance
      AND cl.state_code = lead_state_code
      AND cl.verified = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Claim a call (atomic operation)
-- Returns true if claimed successfully, false if already taken
-- ============================================
CREATE OR REPLACE FUNCTION claim_call(
    p_call_id UUID,
    p_closer_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
BEGIN
    -- Lock the row and check status
    SELECT status INTO v_current_status
    FROM call_logs
    WHERE id = p_call_id
    FOR UPDATE;

    -- If call is still available (status = ringing_closers)
    IF v_current_status = 'ringing_closers' THEN
        UPDATE call_logs
        SET closer_id = p_closer_id,
            status = 'connected',
            closer_accepted_at = now(),
            connected_at = now()
        WHERE id = p_call_id;
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on functions
GRANT EXECUTE ON FUNCTION find_eligible_closers TO authenticated;
GRANT EXECUTE ON FUNCTION claim_call TO authenticated;
