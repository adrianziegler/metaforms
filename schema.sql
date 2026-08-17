-- outrnk Leads PostgreSQL Schema
-- Complete schema matching migrate.ts

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255),
  subscription_status VARCHAR(50) DEFAULT 'trial',
  subscription_plan VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'member',
  is_super_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Team members table (for lead assignment)
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(org_id, email)
);

-- Meta connections table (stores OAuth tokens)
CREATE TABLE IF NOT EXISTS meta_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  user_id VARCHAR(255),
  page_id VARCHAR(255),
  page_name VARCHAR(255),
  pixel_id VARCHAR(255),
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(org_id)
);

-- Lead forms table
CREATE TABLE IF NOT EXISTS lead_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  meta_form_id VARCHAR(255) NOT NULL,
  form_name VARCHAR(255),
  page_id VARCHAR(255),
  page_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(org_id, meta_form_id)
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  meta_lead_id VARCHAR(255) NOT NULL,

  -- Lead data
  email VARCHAR(255),
  phone VARCHAR(50),
  full_name VARCHAR(255),
  raw_data JSONB,

  -- Form info
  form_id VARCHAR(255),
  form_name VARCHAR(255),
  ad_id VARCHAR(255),

  -- Quality feedback
  quality_status VARCHAR(50) DEFAULT 'pending',
  quality_feedback_sent BOOLEAN DEFAULT false,
  quality_feedback_sent_at TIMESTAMP WITH TIME ZONE,
  rated_via VARCHAR(50), -- 'dashboard' or 'email'

  -- Status tracking
  status VARCHAR(50) DEFAULT 'new',
  notes TEXT,

  -- Assignment tracking
  assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(org_id, meta_lead_id)
);

-- Quality signals for CAPI
CREATE TABLE IF NOT EXISTS quality_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  signal_type VARCHAR(50) NOT NULL,
  event_name VARCHAR(100),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  meta_response JSONB
);

-- Email rating tokens table
CREATE TABLE IF NOT EXISTS lead_email_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System settings for global configuration
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email templates table (custom email templates per organization)
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  template_type VARCHAR(50) NOT NULL DEFAULT 'lead_assignment',
  subject VARCHAR(500) NOT NULL,
  html_content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(org_id, template_type)
);

-- Team member portal tokens (for one-time login links)
CREATE TABLE IF NOT EXISTS team_member_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_org_id ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_quality_status ON leads(quality_status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_lead_forms_org_id ON lead_forms(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_team_members_org_id ON team_members(org_id);
CREATE INDEX IF NOT EXISTS idx_email_tokens_token ON lead_email_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_templates_org_id ON email_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_team_member_tokens_token ON team_member_tokens(token);
CREATE INDEX IF NOT EXISTS idx_team_member_tokens_member ON team_member_tokens(team_member_id);
-- Partial unique index: at most one active portal token per team member (ON CONFLICT target)
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_member_tokens_active_unique ON team_member_tokens(team_member_id) WHERE is_active = true;
