import { pool } from './db';

export async function runMigrations() {
  console.log('Running database migrations...');

  try {
    // Enable UUID extension
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Organizations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        stripe_customer_id VARCHAR(255),
        subscription_status VARCHAR(50) DEFAULT 'trial',
        subscription_plan VARCHAR(50) DEFAULT 'free',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Users table
    await pool.query(`
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
      )
    `);

    // Add is_super_admin if not exists (for existing databases)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false`);

    // Team members table (for lead assignment)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS team_members (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(org_id, email)
      )
    `);

    // Meta connections table
    await pool.query(`
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
      )
    `);

    // Add pixel_id if not exists
    await pool.query(`
      ALTER TABLE meta_connections ADD COLUMN IF NOT EXISTS pixel_id VARCHAR(255)
    `);

    // Leads table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
        meta_lead_id VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        full_name VARCHAR(255),
        raw_data JSONB,
        form_id VARCHAR(255),
        form_name VARCHAR(255),
        ad_id VARCHAR(255),
        quality_status VARCHAR(50) DEFAULT 'pending',
        quality_feedback_sent BOOLEAN DEFAULT false,
        quality_feedback_sent_at TIMESTAMP WITH TIME ZONE,
        status VARCHAR(50) DEFAULT 'new',
        notes TEXT,
        assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(org_id, meta_lead_id)
      )
    `);

    // Add columns if not exists (for existing databases)
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS form_id VARCHAR(255)`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS form_name VARCHAR(255)`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ad_id VARCHAR(255)`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS rated_via VARCHAR(50)`); // 'dashboard' or 'email'
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS capi_sent_stages JSONB DEFAULT '[]'`); // Track which funnel stages were sent to Meta

    // Email rating tokens table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_email_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
        token VARCHAR(64) NOT NULL UNIQUE,
        used BOOLEAN DEFAULT false,
        used_at TIMESTAMP WITH TIME ZONE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Email templates table (custom email templates per organization)
    await pool.query(`
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
      )
    `);

    // Team member portal tokens (for one-time login links)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS team_member_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
        org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
        token VARCHAR(64) NOT NULL UNIQUE,
        is_active BOOLEAN DEFAULT true,
        last_used_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // System settings table (for global app configuration)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Temporary storage for Meta OAuth flow (page selection)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meta_oauth_temp (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_access_token TEXT NOT NULL,
        pages_json JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '15 minutes'
      )
    `);

    // Lead activities table (timeline tracking: calls, meetings, notes, etc.)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_activities (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        created_by_type VARCHAR(20) NOT NULL DEFAULT 'admin',
        created_by_id UUID,
        activity_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        activity_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Organization branding columns (for whitelabel)
    await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS branding_company_name VARCHAR(255)`);
    await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS branding_logo_url TEXT`); // Base64 data URL or external URL
    await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS branding_primary_color VARCHAR(7)`); // Hex color like #0052FF

    // Auto-message templates (emails/WhatsApp sent to leads on form submission)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auto_message_templates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'email',
        form_id VARCHAR(255),
        form_name VARCHAR(255),
        subject VARCHAR(500),
        sender_name VARCHAR(255),
        content JSONB NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Auto-message send logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auto_message_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        template_id UUID REFERENCES auto_message_templates(id) ON DELETE SET NULL,
        lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
        type VARCHAR(20) NOT NULL,
        recipient VARCHAR(255) NOT NULL,
        subject VARCHAR(500),
        status VARCHAR(20) DEFAULT 'sent',
        error_message TEXT,
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Automation settings (WhatsApp API key, global toggles)
    await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_api_key TEXT`);
    await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS auto_email_enabled BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS auto_whatsapp_enabled BOOLEAN DEFAULT false`);

    // Custom Resend integration (org's own Resend account for all emails)
    await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS resend_api_key TEXT`);
    await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS resend_from_email VARCHAR(255)`);

    // Trigger column for auto-message templates (new_lead = on form submission, lead_assigned = on assignment)
    await pool.query(`ALTER TABLE auto_message_templates ADD COLUMN IF NOT EXISTS trigger VARCHAR(30) DEFAULT 'new_lead'`);

    // Branding presets table (reusable branding for email templates)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS branding_presets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        logo_url TEXT,
        company_name VARCHAR(255),
        primary_color VARCHAR(10) DEFAULT '#0052FF',
        footer_text VARCHAR(500),
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Link branding preset to auto-message templates
    await pool.query(`ALTER TABLE auto_message_templates ADD COLUMN IF NOT EXISTS branding_preset_id UUID REFERENCES branding_presets(id) ON DELETE SET NULL`);

    // Notification settings for org admins
    await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS notify_new_lead BOOLEAN DEFAULT true`);
    await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS notify_lead_assigned BOOLEAN DEFAULT true`);

    // Indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_org_id ON leads(org_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_team_members_org_id ON team_members(org_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_tokens_token ON lead_email_tokens(token)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_templates_org_id ON email_templates(org_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_team_member_tokens_token ON team_member_tokens(token)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_team_member_tokens_member ON team_member_tokens(team_member_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auto_message_templates_org ON auto_message_templates(org_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auto_message_logs_org ON auto_message_logs(org_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auto_message_logs_lead ON auto_message_logs(lead_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_branding_presets_org ON branding_presets(org_id)`);

    // Form aliases table (custom display names for Meta forms)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS form_aliases (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        form_id VARCHAR(255) NOT NULL,
        original_name VARCHAR(255),
        display_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(org_id, form_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_form_aliases_org ON form_aliases(org_id)`);

    console.log('Database migrations completed successfully!');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}
