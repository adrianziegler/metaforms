import { Resend } from 'resend';
import crypto from 'crypto';
import { query, queryOne } from './db';

// Generate email headers for spam compliance (List-Unsubscribe + Precedence)
function getEmailHeaders(appUrl: string, orgId: string, recipientEmail: string): Record<string, string> {
  // One-click unsubscribe URL (RFC 8058)
  const unsubscribeUrl = `${appUrl}/api/unsubscribe?org=${orgId}&email=${encodeURIComponent(recipientEmail)}`;
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'Precedence': 'bulk',
    'X-Auto-Response-Suppress': 'All',
  };
}

// Generate plain text version from HTML (basic conversion for spam compliance)
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

// Retry helper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; onRetry?: (attempt: number, error: unknown) => void } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, onRetry } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        onRetry?.(attempt, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Log email attempt to audit table (fire-and-forget)
async function logEmailAudit(params: {
  orgId: string;
  emailType: string;
  recipient: string;
  subject: string;
  success: boolean;
  errorMessage?: string;
  resendId?: string;
}) {
  try {
    await query(
      `INSERT INTO email_audit (org_id, email_type, recipient, subject, success, error_message, resend_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [params.orgId, params.emailType, params.recipient, params.subject, params.success, params.errorMessage || null, params.resendId || null]
    );
  } catch (e) {
    // Table might not exist yet - don't fail the main operation
    console.warn('[EMAIL_AUDIT] Failed to log (table may not exist):', e);
  }
}

// System Resend client (lazy, uses env RESEND_API_KEY)
let systemResendClient: Resend | null = null;
function getSystemResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!systemResendClient) systemResendClient = new Resend(process.env.RESEND_API_KEY);
  return systemResendClient;
}

// Per-org Resend client cache
const orgResendCache = new Map<string, { client: Resend; fromEmail: string }>();

export interface ResendConfig {
  client: Resend;
  fromEmail: string;
  isCustom: boolean;
}

/**
 * Get the Resend client + from-email for an org.
 * If the org has their own Resend API key + verified from email, use those.
 * Otherwise fall back to system Resend (noreply@leadsignal.de).
 */
export async function getResendForOrg(orgId: string): Promise<ResendConfig | null> {
  try {
    const org = await queryOne<{ resend_api_key: string | null; resend_from_email: string | null }>(
      'SELECT resend_api_key, resend_from_email FROM organizations WHERE id = $1',
      [orgId]
    );

    if (org?.resend_api_key && org?.resend_from_email) {
      // Org has custom Resend — use it
      const cached = orgResendCache.get(orgId);
      if (cached && cached.fromEmail === org.resend_from_email) {
        return { client: cached.client, fromEmail: org.resend_from_email, isCustom: true };
      }
      const client = new Resend(org.resend_api_key);
      orgResendCache.set(orgId, { client, fromEmail: org.resend_from_email });
      return { client, fromEmail: org.resend_from_email, isCustom: true };
    }
  } catch {
    // columns might not exist yet — fall through to system
  }

  // Fall back to system Resend
  const sys = getSystemResend();
  if (!sys) return null;
  return { client: sys, fromEmail: 'noreply@leadsignal.de', isCustom: false };
}

// Keep legacy helper for backwards compat within this file
function getResend(): Resend | null {
  return getSystemResend();
}

interface LeadInfo {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  formName: string | null;
}

interface LeadAssignmentEmailParams {
  to: string;
  assigneeName: string;
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  leadId: string;
  formName?: string;
  orgId: string; // Added for custom templates
  teamMemberId?: string; // For portal link
  rawData?: Record<string, string>; // All form field answers
}

interface EmailTemplate {
  subject: string;
  html_content: string;
}

interface OrgBranding {
  companyName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}

/**
 * Get organization branding settings
 */
async function getOrgBranding(orgId: string): Promise<OrgBranding> {
  try {
    const branding = await queryOne<{
      branding_company_name: string | null;
      branding_logo_url: string | null;
      branding_primary_color: string | null;
    }>(
      `SELECT branding_company_name, branding_logo_url, branding_primary_color
       FROM organizations WHERE id = $1`,
      [orgId]
    );
    return {
      companyName: branding?.branding_company_name || null,
      logoUrl: branding?.branding_logo_url || null,
      primaryColor: branding?.branding_primary_color || null,
    };
  } catch {
    return { companyName: null, logoUrl: null, primaryColor: null };
  }
}

/**
 * Generate email header HTML based on branding
 */
function generateBrandedHeader(branding: OrgBranding): string {
  const color = branding.primaryColor || '#0052FF';

  if (branding.logoUrl) {
    return `<img src="${branding.logoUrl}" alt="Logo" style="max-height: 40px; max-width: 180px; object-fit: contain;" />`;
  }

  const name = branding.companyName || 'outrnk';
  return `<span style="font-size: 20px; font-weight: 700; color: #111827;">${name}<span style="color: ${color};">.</span></span>
          ${!branding.companyName ? '<span style="color: #d1d5db; margin: 0 8px;">|</span><span style="color: #6b7280; font-size: 14px;">Leads</span>' : ''}`;
}

/**
 * Generate footer text based on branding
 */
function generateBrandedFooter(branding: OrgBranding): string {
  return branding.companyName || 'outrnk. Leads';
}

// Default template for lead assignment emails - minimal, no PII to avoid spam filters
const DEFAULT_TEMPLATE: EmailTemplate = {
  subject: 'Neue Lead-Zuweisung - {{form_name}}',
  html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">

          <!-- Header with Logo -->
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
              {{brand_header}}
            </td>
          </tr>

          <!-- Lead Badge -->
          <tr>
            <td style="padding: 24px 32px 16px;">
              <span style="display: inline-block; padding: 4px 10px; background-color: #dbeafe; border-radius: 4px; color: #1d4ed8; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Neuer Lead</span>
              <h1 style="margin: 12px 0 0; color: #111827; font-size: 22px; font-weight: 600; line-height: 1.3;">Neue Lead-Zuweisung</h1>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 0 32px 20px;">
              <p style="margin: 0; color: #6b7280; font-size: 15px; line-height: 1.6;">
                Hallo {{assignee_name}}, dir wurde ein neuer Lead aus dem Formular <strong>{{form_name}}</strong> zugewiesen. Alle Details findest du in deinem Portal.
              </p>
            </td>
          </tr>

          <!-- Portal Link -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <a href="{{portal_url}}" style="display: inline-block; padding: 12px 24px; background-color: {{brand_color}}; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
                Lead im Portal ansehen
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.6;">
                {{brand_footer}}
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 11px; text-align: center;">
                <a href="{{unsubscribe_url}}" style="color: #9ca3af; text-decoration: underline;">Abmelden</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
};

interface SimpleTemplateTexts {
  subject: string;
  greeting: string;
  message: string;
  ctaText?: string;
  portalText?: string;
}

/**
 * Generate HTML email from simple template texts
 */
function generateHtmlFromSimpleTexts(
  texts: SimpleTemplateTexts,
  branding: OrgBranding,
  templateType: 'lead_assignment' | 'team_member_welcome' | 'new_lead_notification'
): string {
  const color = branding.primaryColor || '#0052FF';
  const companyName = branding.companyName || 'outrnk';
  const footerText = branding.companyName || 'outrnk. Leads';

  const headerContent = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="Logo" style="max-height: 36px; max-width: 180px; object-fit: contain;">`
    : `<span style="font-size: 20px; font-weight: 700; color: #111827;">${companyName}<span style="color: ${color};">.</span></span>`;

  const badgeText = templateType === 'lead_assignment' ? 'Neuer Lead' : templateType === 'new_lead_notification' ? 'Neuer Lead' : 'Willkommen';
  const badgeColor = templateType === 'lead_assignment' || templateType === 'new_lead_notification' ? '#dcfce7' : '#dcfce7';
  const badgeTextColor = templateType === 'lead_assignment' || templateType === 'new_lead_notification' ? '#166534' : '#166534';

  // No PII in emails to avoid spam filters - just show form name and link to portal
  const leadDetailsSection = (templateType === 'lead_assignment' || templateType === 'new_lead_notification') ? `
    <!-- Lead Info (no PII) -->
    <tr>
      <td style="padding: 0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
          <tr><td style="padding: 16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding: 8px 0;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Formular</span><span style="color: #111827; font-size: 14px; font-weight: 500;">{{form_name}}</span></td></tr>
            </table>
          </td></tr>
        </table>
      </td>
    </tr>` : '';

  // Rating buttons removed - they triggered spam filters
  const ratingSection = '';

  const memberInfoSection = templateType === 'team_member_welcome' ? `
    <!-- Account Details Card -->
    <tr>
      <td style="padding: 0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
          <tr><td style="padding: 16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding: 8px 0;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Name</span><span style="color: #111827; font-size: 14px; font-weight: 500;">{{member_name}}</span></td></tr>
              <tr><td style="padding: 8px 0; border-top: 1px solid #e5e7eb;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">E-Mail</span><span style="color: #111827; font-size: 14px;">{{member_email}}</span></td></tr>
            </table>
          </td></tr>
        </table>
      </td>
    </tr>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
        <!-- Header -->
        <tr><td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">${headerContent}</td></tr>
        <!-- Badge + Greeting -->
        <tr><td style="padding: 24px 32px 16px;">
          <span style="display: inline-block; padding: 4px 10px; background-color: ${badgeColor}; border-radius: 4px; color: ${badgeTextColor}; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${badgeText}</span>
          <h1 style="margin: 12px 0 0; color: #111827; font-size: 22px; font-weight: 600; line-height: 1.3;">${texts.greeting}</h1>
        </td></tr>
        <!-- Message -->
        <tr><td style="padding: 0 32px 20px;"><p style="margin: 0; color: #6b7280; font-size: 15px; line-height: 1.6;">${texts.message}</p></td></tr>
        ${leadDetailsSection}
        ${memberInfoSection}
        ${ratingSection}
        <!-- Portal Link -->
        <tr><td style="padding: 0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
            <tr><td style="padding: 16px;">
              <p style="margin: 0 0 12px; color: #1e40af; font-size: 14px; font-weight: 500;">${templateType === 'lead_assignment' ? 'Dein Lead-Portal' : 'Dein personliches Portal'}</p>
              <p style="margin: 0 0 16px; color: #6b7280; font-size: 13px; line-height: 1.5;">${texts.portalText || 'Hier kannst du alle Leads verwalten.'}</p>
              <a href="{{portal_url}}" style="display: inline-block; padding: 12px 24px; background-color: ${color}; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">Portal offnen</a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding: 20px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.6;">${footerText}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Get simple template texts if available
 */
async function getSimpleTemplateTexts(orgId: string, templateType: string): Promise<SimpleTemplateTexts | null> {
  try {
    const result = await queryOne<{ texts: string }>(
      `SELECT texts FROM email_template_texts WHERE org_id = $1 AND template_type = $2`,
      [orgId, templateType]
    );
    if (result) {
      console.log(`[EMAIL] Found custom template for org ${orgId}, type ${templateType}`);
      return typeof result.texts === 'string' ? JSON.parse(result.texts) : result.texts;
    }
    console.log(`[EMAIL] No custom template found for org ${orgId}, type ${templateType}`);
  } catch (error) {
    console.error(`[EMAIL] Error loading template for org ${orgId}, type ${templateType}:`, error);
  }
  return null;
}

/**
 * Get custom email template for organization or return default
 */
async function getEmailTemplate(orgId: string): Promise<EmailTemplate> {
  try {
    // First check for simple template texts
    const simpleTexts = await getSimpleTemplateTexts(orgId, 'lead_assignment');
    if (simpleTexts) {
      const branding = await getOrgBranding(orgId);
      return {
        subject: simpleTexts.subject,
        html_content: generateHtmlFromSimpleTexts(simpleTexts, branding, 'lead_assignment'),
      };
    }

    // Fall back to old HTML templates
    const template = await queryOne<EmailTemplate>(
      `SELECT subject, html_content FROM email_templates
       WHERE org_id = $1 AND template_type = 'lead_assignment' AND is_active = true`,
      [orgId]
    );
    return template || DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

/**
 * Generate HTML rows for additional form fields (raw_data) in email
 */
function generateFormFieldsHtml(
  rawData: Record<string, string> | undefined,
  brandColor: string
): string {
  if (!rawData || Object.keys(rawData).length === 0) return '';

  const STANDARD_FIELDS = [
    'email', 'phone', 'phone_number', 'full_name', 'first_name', 'last_name',
    'name', 'Name', 'Email', 'E-Mail', 'E-Mail-Adresse', 'e-mail', 'e-mail-adresse',
    'Telefonnummer', 'telefonnummer', 'Telefon', 'Handy', 'Handynummer',
    'Vollständiger Name', 'vollständiger name', 'Vorname', 'Nachname',
  ];
  const extraFields = Object.entries(rawData)
    .filter(([key]) => !STANDARD_FIELDS.includes(key))
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');

  if (extraFields.length === 0) return '';

  const rows = extraFields.map(([key, value]) => {
    const label = key
      .replace(/_/g, ' ')
      .replace(/^question\s*(\d+)$/i, 'Frage $1')
      .replace(/\b\w/g, l => l.toUpperCase());
    return `<tr>
      <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
        <span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">${label}</span>
        <span style="color: #111827; font-size: 14px; font-weight: 500;">${String(value)}</span>
      </td>
    </tr>`;
  }).join('');

  return rows;
}

/**
 * Replace template variables with actual values
 */
function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value || '-');
  }
  return result;
}

/**
 * Generate a secure token and store it in database
 */
async function generateAndStoreToken(leadId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await query(
    `INSERT INTO lead_email_tokens (lead_id, token, expires_at) VALUES ($1, $2, $3)`,
    [leadId, token, expiresAt]
  );

  return token;
}

/**
 * Get or create portal token for team member
 */
async function getOrCreatePortalToken(teamMemberId: string, orgId: string): Promise<string | null> {
  try {
    // Check for existing active token
    const existing = await queryOne<{ token: string }>(
      'SELECT token FROM team_member_tokens WHERE team_member_id = $1 AND is_active = true',
      [teamMemberId]
    );

    if (existing) {
      return existing.token;
    }

    // Create new token
    const token = crypto.randomBytes(32).toString('hex');
    await query(
      `INSERT INTO team_member_tokens (team_member_id, org_id, token, is_active)
       VALUES ($1, $2, $3, true)`,
      [teamMemberId, orgId, token]
    );

    return token;
  } catch (e) {
    console.error('Failed to get/create portal token:', e);
    return null;
  }
}

/**
 * Get app URL from system settings or env
 */
async function getAppUrl(): Promise<string> {
  try {
    const setting = await queryOne<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'app_url'"
    );
    if (setting?.value) return setting.value;
  } catch {
    // table might not exist yet
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000';
}

/**
 * Send email when lead is assigned to team member
 * Uses custom template if available, otherwise default
 */
export async function sendLeadAssignmentEmail(params: LeadAssignmentEmailParams) {
  const appUrl = await getAppUrl();

  // Generate rating token
  let ratingToken = '';
  try {
    ratingToken = await generateAndStoreToken(params.leadId);
  } catch (e) {
    console.error('Failed to generate rating token:', e);
  }

  // Get or create portal token for team member
  let portalUrl = `${appUrl}/dashboard/kanban`; // fallback
  if (params.teamMemberId) {
    const portalToken = await getOrCreatePortalToken(params.teamMemberId, params.orgId);
    if (portalToken) {
      portalUrl = `${appUrl}/portal/${portalToken}`;
    }
  }

  const qualifiedUrl = `${appUrl}/api/leads/rate?token=${ratingToken}&rating=qualified`;
  const unqualifiedUrl = `${appUrl}/api/leads/rate?token=${ratingToken}&rating=unqualified`;
  const dashboardUrl = `${appUrl}/dashboard/kanban`;

  try {
    // Get org-specific or system Resend client
    const resendConfig = await getResendForOrg(params.orgId);
    if (!resendConfig) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[DEV] Email skipped - no Resend configured');
      }
      return { success: true, dev: true };
    }

    // Get custom template or default
    const template = await getEmailTemplate(params.orgId);

    // Get org branding for customization
    const branding = await getOrgBranding(params.orgId);
    const brandColor = branding.primaryColor || '#0052FF';

    // Generate extra form fields HTML
    const formFieldsHtml = generateFormFieldsHtml(params.rawData, brandColor);

    // Define template variables
    const variables: Record<string, string> = {
      '{{assignee_name}}': params.assigneeName,
      '{{lead_name}}': params.leadName || '-',
      '{{lead_email}}': params.leadEmail || '-',
      '{{lead_phone}}': params.leadPhone || '-',
      '{{form_name}}': params.formName || '-',
      '{{lead_details}}': formFieldsHtml,
      '{{qualified_url}}': qualifiedUrl,
      '{{unqualified_url}}': unqualifiedUrl,
      '{{dashboard_url}}': dashboardUrl,
      '{{portal_url}}': portalUrl,
      '{{brand_header}}': generateBrandedHeader(branding),
      '{{brand_name}}': branding.companyName || 'outrnk. Leads',
      '{{brand_color}}': brandColor,
      '{{brand_footer}}': generateBrandedFooter(branding),
      '{{unsubscribe_url}}': `${appUrl}/api/unsubscribe?org=${params.orgId}&email=${encodeURIComponent(params.to)}`,
    };

    // Replace variables in subject and content
    const subject = replaceTemplateVariables(template.subject, variables);
    const htmlContent = replaceTemplateVariables(template.html_content, variables);

    // Determine sender name and from address
    const senderName = branding.companyName || 'outrnk Leads';

    const { data, error } = await resendConfig.client.emails.send({
      from: `${senderName} <${resendConfig.fromEmail}>`,
      to: params.to,
      subject,
      html: htmlContent,
      text: htmlToPlainText(htmlContent),
      headers: getEmailHeaders(appUrl, params.orgId, params.to),
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error };
  }
}

/**
 * Send email when new lead arrives (optional notification)
 * Uses custom template if available, otherwise default
 */
export async function sendNewLeadNotification(adminEmail: string, lead: LeadInfo, orgId: string) {
  const appUrl = await getAppUrl();
  const dashboardUrl = `${appUrl}/dashboard/leads`;
  let subject = '';

  try {
    // Get org-specific or system Resend client
    const resendConfig = await getResendForOrg(orgId);
    if (!resendConfig) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[DEV] Admin notification skipped - no Resend configured');
      }
      return { success: true, dev: true };
    }

    // Get custom template or default
    const template = await getNewLeadNotificationTemplate(orgId);

    // Get org branding for customization
    const branding = await getOrgBranding(orgId);
    const brandColor = branding.primaryColor || '#10b981';

    // Define template variables
    const variables: Record<string, string> = {
      '{{lead_name}}': lead.fullName || '-',
      '{{lead_email}}': lead.email || '-',
      '{{lead_phone}}': lead.phone || '-',
      '{{form_name}}': lead.formName || '-',
      '{{dashboard_url}}': dashboardUrl,
      '{{brand_header}}': generateBrandedHeader(branding),
      '{{brand_name}}': branding.companyName || 'outrnk. Leads',
      '{{brand_color}}': brandColor,
      '{{brand_footer}}': generateBrandedFooter(branding),
      '{{unsubscribe_url}}': `${appUrl}/api/unsubscribe?org=${orgId}&email=${encodeURIComponent(adminEmail)}`,
    };

    // Replace variables in subject and content
    subject = replaceTemplateVariables(template.subject, variables);
    let htmlContent = replaceTemplateVariables(template.html_content, variables);

    // Apply branding to default template (replace hardcoded values)
    if (branding.companyName || branding.logoUrl || branding.primaryColor) {
      htmlContent = htmlContent.replace(/#10b981/g, brandColor);
      htmlContent = htmlContent.replace(/outrnk\. Leads/g, generateBrandedFooter(branding));
    }

    // Determine sender name and from address
    const senderName = branding.companyName || 'outrnk Leads';

    // Send with retry logic (3 attempts with exponential backoff)
    let retryCount = 0;
    const result = await withRetry(
      async () => {
        const { data, error } = await resendConfig.client.emails.send({
          from: `${senderName} <${resendConfig.fromEmail}>`,
          to: adminEmail,
          subject,
          html: htmlContent,
          text: htmlToPlainText(htmlContent),
          headers: getEmailHeaders(appUrl, orgId, adminEmail),
        });

        if (error) {
          // Throw to trigger retry
          throw new Error(typeof error === 'object' ? JSON.stringify(error) : String(error));
        }

        return data;
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        onRetry: (attempt, error) => {
          retryCount = attempt;
          console.warn(`[NEW_LEAD_NOTIFICATION] Retry ${attempt}/3 for ${adminEmail}:`, error);
        },
      }
    );

    // Log success
    console.log(`[NEW_LEAD_NOTIFICATION] Sent to ${adminEmail} (retries: ${retryCount}, resend_id: ${result?.id})`);
    await logEmailAudit({
      orgId,
      emailType: 'new_lead_notification',
      recipient: adminEmail,
      subject,
      success: true,
      resendId: result?.id,
    });

    return { success: true, data: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[NEW_LEAD_NOTIFICATION] FAILED after 3 retries for ${adminEmail}:`, errorMessage);

    // Log failure
    await logEmailAudit({
      orgId,
      emailType: 'new_lead_notification',
      recipient: adminEmail,
      subject,
      success: false,
      errorMessage,
    });

    return { success: false, error: errorMessage };
  }
}

// Default template for new lead notification emails (admin) - minimal, no PII
const DEFAULT_NEW_LEAD_NOTIFICATION_TEMPLATE: EmailTemplate = {
  subject: 'Neuer Lead eingegangen - {{form_name}}',
  html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
              {{brand_header}}
            </td>
          </tr>
          <!-- Badge + Greeting -->
          <tr>
            <td style="padding: 24px 32px 16px;">
              <span style="display: inline-block; padding: 4px 10px; background-color: #dcfce7; border-radius: 4px; color: #166534; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Neuer Lead</span>
              <h1 style="margin: 12px 0 0; color: #111827; font-size: 22px; font-weight: 600; line-height: 1.3;">Neuer Lead eingegangen</h1>
            </td>
          </tr>
          <!-- Message -->
          <tr>
            <td style="padding: 0 32px 20px;">
              <p style="margin: 0; color: #6b7280; font-size: 15px; line-height: 1.6;">Ein neuer Lead ist über das Formular <strong>{{form_name}}</strong> eingegangen. Die Details findest du im Dashboard.</p>
            </td>
          </tr>
          <!-- Dashboard Link -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">Im Dashboard ansehen</a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.6;">{{brand_footer}}</p>
              <p style="margin: 0; color: #9ca3af; font-size: 11px; text-align: center;"><a href="{{unsubscribe_url}}" style="color: #9ca3af; text-decoration: underline;">Abmelden</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
};

/**
 * Get custom new lead notification template for organization or return default
 */
async function getNewLeadNotificationTemplate(orgId: string): Promise<EmailTemplate> {
  try {
    // First check for simple template texts
    const simpleTexts = await getSimpleTemplateTexts(orgId, 'new_lead_notification');
    if (simpleTexts) {
      const branding = await getOrgBranding(orgId);
      return {
        subject: simpleTexts.subject,
        html_content: generateHtmlFromSimpleTextsForAdminNotification(simpleTexts, branding),
      };
    }

    // Fall back to default template
    return DEFAULT_NEW_LEAD_NOTIFICATION_TEMPLATE;
  } catch {
    return DEFAULT_NEW_LEAD_NOTIFICATION_TEMPLATE;
  }
}

/**
 * Generate HTML for admin notification from simple texts
 */
function generateHtmlFromSimpleTextsForAdminNotification(texts: SimpleTemplateTexts, branding: OrgBranding): string {
  const color = branding.primaryColor || '#10b981';
  const companyName = branding.companyName || 'outrnk';
  const footerText = branding.companyName || 'outrnk. Leads';

  const headerContent = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="Logo" style="max-height: 36px; max-width: 180px; object-fit: contain;">`
    : `<span style="font-size: 20px; font-weight: 700; color: #111827;">${companyName}<span style="color: ${color};">.</span></span>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
        <!-- Header -->
        <tr><td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">${headerContent}</td></tr>
        <!-- Badge + Greeting -->
        <tr><td style="padding: 24px 32px 16px;">
          <span style="display: inline-block; padding: 4px 10px; background-color: #dcfce7; border-radius: 4px; color: #166534; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Neuer Lead</span>
          <h1 style="margin: 12px 0 0; color: #111827; font-size: 22px; font-weight: 600; line-height: 1.3;">${texts.greeting}</h1>
        </td></tr>
        <!-- Message -->
        <tr><td style="padding: 0 32px 20px;"><p style="margin: 0; color: #6b7280; font-size: 15px; line-height: 1.6;">${texts.message}</p></td></tr>
        <!-- No PII - just link to dashboard -->
        <!-- Dashboard Link -->
        <tr><td style="padding: 0 32px 24px;">
          <a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background-color: ${color}; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">${texts.ctaText || 'Im Dashboard ansehen'}</a>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding: 20px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.6;">${footerText}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Default template for team member welcome emails - Outrnk UI Style (Light + Blue)
const DEFAULT_TEAM_WELCOME_TEMPLATE: EmailTemplate = {
  subject: 'Willkommen bei {{brand_name}}!',
  html_content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">

          <!-- Header with Logo -->
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
              {{brand_header}}
            </td>
          </tr>

          <!-- Welcome Badge + Name -->
          <tr>
            <td style="padding: 24px 32px 16px;">
              <span style="display: inline-block; padding: 4px 10px; background-color: #dcfce7; border-radius: 4px; color: #166534; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Willkommen</span>
              <h1 style="margin: 12px 0 0; color: #111827; font-size: 22px; font-weight: 600; line-height: 1.3;">Hallo {{member_name}}!</h1>
            </td>
          </tr>

          <!-- Welcome Message -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <p style="margin: 0; color: #6b7280; font-size: 15px; line-height: 1.6;">
                Du wurdest als Team-Mitglied hinzugefügt. Ab jetzt kannst du Leads über dein persönliches Portal einsehen und verwalten.
              </p>
            </td>
          </tr>

          <!-- Account Details Card -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Name</span>
                          <span style="color: #111827; font-size: 14px; font-weight: 500;">{{member_name}}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
                          <span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">E-Mail</span>
                          <span style="color: #111827; font-size: 14px;">{{member_email}}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Portal Link -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 12px; color: #1e40af; font-size: 14px; font-weight: 500;">
                      Dein persönliches Lead-Portal
                    </p>
                    <p style="margin: 0 0 16px; color: #6b7280; font-size: 13px; line-height: 1.5;">
                      Über diesen Link erreichst du jederzeit deine zugewiesenen Leads. Speichere den Link in deinen Lesezeichen.
                    </p>
                    <a href="{{portal_url}}" style="display: inline-block; padding: 12px 24px; background-color: {{brand_color}}; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
                      Portal öffnen
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.6;">
                {{brand_footer}}
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 11px; text-align: center;">
                <a href="{{unsubscribe_url}}" style="color: #9ca3af; text-decoration: underline;">E-Mail-Benachrichtigungen verwalten</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
};

interface TeamMemberWelcomeEmailParams {
  to: string;
  memberName: string;
  memberEmail: string;
  teamMemberId: string;
  orgId: string;
}

/**
 * Get custom team welcome email template for organization or return default
 */
async function getTeamWelcomeTemplate(orgId: string): Promise<EmailTemplate> {
  try {
    // First check for simple template texts
    const simpleTexts = await getSimpleTemplateTexts(orgId, 'team_member_welcome');
    if (simpleTexts) {
      const branding = await getOrgBranding(orgId);
      return {
        subject: simpleTexts.subject,
        html_content: generateHtmlFromSimpleTexts(simpleTexts, branding, 'team_member_welcome'),
      };
    }

    // Fall back to old HTML templates
    const template = await queryOne<EmailTemplate>(
      `SELECT subject, html_content FROM email_templates
       WHERE org_id = $1 AND template_type = 'team_member_welcome' AND is_active = true`,
      [orgId]
    );
    return template || DEFAULT_TEAM_WELCOME_TEMPLATE;
  } catch {
    return DEFAULT_TEAM_WELCOME_TEMPLATE;
  }
}

/**
 * Send welcome email to new team member with portal link
 */
export async function sendTeamMemberWelcomeEmail(params: TeamMemberWelcomeEmailParams) {
  const appUrl = await getAppUrl();

  // Get or create portal token for team member
  const portalToken = await getOrCreatePortalToken(params.teamMemberId, params.orgId);
  const portalUrl = portalToken ? `${appUrl}/portal/${portalToken}` : `${appUrl}/dashboard/kanban`;

  try {
    // Get org-specific or system Resend client
    const resendConfig = await getResendForOrg(params.orgId);
    if (!resendConfig) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[DEV] Welcome email skipped - no Resend configured');
        console.log('[DEV] Would send to:', params.to);
        console.log('[DEV] Portal URL:', portalUrl);
      }
      return { success: true, dev: true };
    }

    // Get custom template or default
    const template = await getTeamWelcomeTemplate(params.orgId);

    // Get org branding for customization
    const branding = await getOrgBranding(params.orgId);
    const brandColor = branding.primaryColor || '#0052FF';

    // Define template variables
    const variables: Record<string, string> = {
      '{{member_name}}': params.memberName,
      '{{member_email}}': params.memberEmail,
      '{{portal_url}}': portalUrl,
      '{{brand_header}}': generateBrandedHeader(branding),
      '{{brand_name}}': branding.companyName || 'outrnk. Leads',
      '{{brand_color}}': brandColor,
      '{{brand_footer}}': generateBrandedFooter(branding),
    };

    // Replace variables in subject and content
    const subject = replaceTemplateVariables(template.subject, variables);
    const htmlContent = replaceTemplateVariables(template.html_content, variables);

    // Determine sender name and from address
    const senderName = branding.companyName || 'outrnk Leads';

    const { data, error } = await resendConfig.client.emails.send({
      from: `${senderName} <${resendConfig.fromEmail}>`,
      to: params.to,
      subject,
      html: htmlContent,
      text: htmlToPlainText(htmlContent),
      headers: getEmailHeaders(appUrl, params.orgId, params.to),
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return { success: false, error };
  }
}
