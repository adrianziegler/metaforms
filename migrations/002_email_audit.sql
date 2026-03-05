-- Email audit table for tracking sent emails and failures
CREATE TABLE IF NOT EXISTS email_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email_type VARCHAR(50) NOT NULL, -- 'new_lead_notification', 'assignment', 'welcome', 'auto_message'
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    success BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    resend_id VARCHAR(100), -- Resend's message ID for tracking
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying recent failures
CREATE INDEX IF NOT EXISTS idx_email_audit_org_created ON email_audit(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_audit_success ON email_audit(success, created_at DESC);
