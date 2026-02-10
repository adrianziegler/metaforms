import { Resend } from 'resend';
import crypto from 'crypto';
import { query, queryOne } from './db';

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

// Default template for lead assignment emails - Outrnk UI Style (Light + Blue)
const DEFAULT_TEMPLATE: EmailTemplate = {
  subject: 'Neuer Lead: {{lead_name}}',
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
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 700; color: #111827;">outrnk<span style="color: #0052FF;">.</span></span>
                    <span style="color: #d1d5db; margin: 0 8px;">|</span>
                    <span style="color: #6b7280; font-size: 14px;">Leads</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Lead Badge + Name -->
          <tr>
            <td style="padding: 24px 32px 16px;">
              <span style="display: inline-block; padding: 4px 10px; background-color: #dbeafe; border-radius: 4px; color: #1d4ed8; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Neuer Lead</span>
              <h1 style="margin: 12px 0 0; color: #111827; font-size: 22px; font-weight: 600; line-height: 1.3;">{{lead_name}}</h1>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 0 32px 20px;">
              <p style="margin: 0; color: #6b7280; font-size: 15px; line-height: 1.6;">
                Hallo {{assignee_name}}, dir wurde ein neuer Lead zugewiesen.
              </p>
            </td>
          </tr>

          <!-- Lead Details Card -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Name</span>
                          <span style="color: #111827; font-size: 14px; font-weight: 500;">{{lead_name}}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
                          <span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">E-Mail</span>
                          <a href="mailto:{{lead_email}}" style="color: #0052FF; font-size: 14px; text-decoration: none;">{{lead_email}}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
                          <span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Telefon</span>
                          <a href="tel:{{lead_phone}}" style="color: #0052FF; font-size: 14px; text-decoration: none;">{{lead_phone}}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">
                          <span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Formular</span>
                          <span style="color: #111827; font-size: 14px; font-weight: 500;">{{form_name}}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Rating Section -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <p style="margin: 0 0 12px; color: #6b7280; font-size: 14px;">
                Wie war das Gespräch?
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="48%" style="padding-right: 6px;">
                    <a href="{{qualified_url}}" style="display: block; text-align: center; padding: 12px 16px; background-color: #0052FF; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
                      Guter Lead
                    </a>
                  </td>
                  <td width="48%" style="padding-left: 6px;">
                    <a href="{{unqualified_url}}" style="display: block; text-align: center; padding: 12px 16px; background-color: #f3f4f6; color: #374151; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; border: 1px solid #d1d5db;">
                      Schlechter Lead
                    </a>
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
                      Alle deine Leads im Portal verwalten
                    </p>
                    <a href="{{portal_url}}" style="display: inline-block; padding: 10px 20px; background-color: #0052FF; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
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
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.6;">
                Automatisch gesendet von outrnk. Leads<br>
                Rating-Link ist 7 Tage gültig
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

  const leadDetailsSection = (templateType === 'lead_assignment' || templateType === 'new_lead_notification') ? `
    <!-- Lead Details Card -->
    <tr>
      <td style="padding: 0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
          <tr><td style="padding: 16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding: 8px 0;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Name</span><span style="color: #111827; font-size: 14px; font-weight: 500;">{{lead_name}}</span></td></tr>
              <tr><td style="padding: 8px 0; border-top: 1px solid #e5e7eb;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">E-Mail</span><a href="mailto:{{lead_email}}" style="color: ${color}; font-size: 14px; text-decoration: none;">{{lead_email}}</a></td></tr>
              <tr><td style="padding: 8px 0; border-top: 1px solid #e5e7eb;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Telefon</span><a href="tel:{{lead_phone}}" style="color: ${color}; font-size: 14px; text-decoration: none;">{{lead_phone}}</a></td></tr>
              <tr><td style="padding: 8px 0; border-top: 1px solid #e5e7eb;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Formular</span><span style="color: #111827; font-size: 14px; font-weight: 500;">{{form_name}}</span></td></tr>
            </table>
          </td></tr>
        </table>
      </td>
    </tr>` : '';

  const ratingSection = templateType === 'lead_assignment' ? `
    <!-- Rating Section -->
    <tr>
      <td style="padding: 0 32px 24px;">
        <p style="margin: 0 0 12px; color: #6b7280; font-size: 14px;">${texts.ctaText || 'Wie war das Gesprach?'}</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="48%" style="padding-right: 6px;"><a href="{{qualified_url}}" style="display: block; text-align: center; padding: 12px 16px; background-color: ${color}; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">Guter Lead</a></td>
            <td width="48%" style="padding-left: 6px;"><a href="{{unqualified_url}}" style="display: block; text-align: center; padding: 12px 16px; background-color: #f3f4f6; color: #374151; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; border: 1px solid #d1d5db;">Schlechter Lead</a></td>
          </tr>
        </table>
      </td>
    </tr>` : '';

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
      return typeof result.texts === 'string' ? JSON.parse(result.texts) : result.texts;
    }
  } catch {
    // Table might not exist yet
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

    // Define template variables
    const variables: Record<string, string> = {
      '{{assignee_name}}': params.assigneeName,
      '{{lead_name}}': params.leadName || '-',
      '{{lead_email}}': params.leadEmail || '-',
      '{{lead_phone}}': params.leadPhone || '-',
      '{{form_name}}': params.formName || '-',
      '{{qualified_url}}': qualifiedUrl,
      '{{unqualified_url}}': unqualifiedUrl,
      '{{dashboard_url}}': dashboardUrl,
      '{{portal_url}}': portalUrl,
      '{{brand_header}}': generateBrandedHeader(branding),
      '{{brand_name}}': branding.companyName || 'outrnk. Leads',
      '{{brand_color}}': brandColor,
      '{{brand_footer}}': generateBrandedFooter(branding),
    };

    // Replace variables in subject and content
    let subject = replaceTemplateVariables(template.subject, variables);
    let htmlContent = replaceTemplateVariables(template.html_content, variables);

    // Apply branding to default template (replace hardcoded values)
    if (branding.companyName || branding.logoUrl || branding.primaryColor) {
      htmlContent = htmlContent.replace(
        /<span style="font-size: 20px; font-weight: 700; color: #111827;">outrnk<span style="color: #0052FF;">\.<\/span><\/span>\s*<span style="color: #d1d5db; margin: 0 8px;">\|<\/span>\s*<span style="color: #6b7280; font-size: 14px;">Leads<\/span>/g,
        generateBrandedHeader(branding)
      );
      htmlContent = htmlContent.replace(/#0052FF/g, brandColor);
      htmlContent = htmlContent.replace(/outrnk\. Leads/g, generateBrandedFooter(branding));
    }

    // Determine sender name and from address
    const senderName = branding.companyName || 'outrnk Leads';

    const { data, error } = await resendConfig.client.emails.send({
      from: `${senderName} <${resendConfig.fromEmail}>`,
      to: params.to,
      subject,
      html: htmlContent,
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
    };

    // Replace variables in subject and content
    let subject = replaceTemplateVariables(template.subject, variables);
    let htmlContent = replaceTemplateVariables(template.html_content, variables);

    // Apply branding to default template (replace hardcoded values)
    if (branding.companyName || branding.logoUrl || branding.primaryColor) {
      htmlContent = htmlContent.replace(/#10b981/g, brandColor);
      htmlContent = htmlContent.replace(/outrnk\. Leads/g, generateBrandedFooter(branding));
    }

    // Determine sender name and from address
    const senderName = branding.companyName || 'outrnk Leads';

    const { data, error } = await resendConfig.client.emails.send({
      from: `${senderName} <${resendConfig.fromEmail}>`,
      to: adminEmail,
      subject,
      html: htmlContent,
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Failed to send notification:', error);
    return { success: false, error };
  }
}

// Default template for new lead notification emails (admin)
const DEFAULT_NEW_LEAD_NOTIFICATION_TEMPLATE: EmailTemplate = {
  subject: 'Neuer Lead eingegangen: {{lead_name}}',
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
              <h1 style="margin: 12px 0 0; color: #111827; font-size: 22px; font-weight: 600; line-height: 1.3;">Neuer Lead eingegangen!</h1>
            </td>
          </tr>
          <!-- Message -->
          <tr>
            <td style="padding: 0 32px 20px;">
              <p style="margin: 0; color: #6b7280; font-size: 15px; line-height: 1.6;">Ein neuer Lead ist eingegangen. Hier sind die Details:</p>
            </td>
          </tr>
          <!-- Lead Details Card -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <tr><td style="padding: 16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr><td style="padding: 8px 0;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Name</span><span style="color: #111827; font-size: 14px; font-weight: 500;">{{lead_name}}</span></td></tr>
                    <tr><td style="padding: 8px 0; border-top: 1px solid #e5e7eb;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">E-Mail</span><a href="mailto:{{lead_email}}" style="color: #10b981; font-size: 14px; text-decoration: none;">{{lead_email}}</a></td></tr>
                    <tr><td style="padding: 8px 0; border-top: 1px solid #e5e7eb;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Telefon</span><a href="tel:{{lead_phone}}" style="color: #10b981; font-size: 14px; text-decoration: none;">{{lead_phone}}</a></td></tr>
                    <tr><td style="padding: 8px 0; border-top: 1px solid #e5e7eb;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Formular</span><span style="color: #111827; font-size: 14px; font-weight: 500;">{{form_name}}</span></td></tr>
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>
          <!-- Dashboard Link -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">Leads anzeigen</a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.6;">{{brand_footer}}</p>
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
        <!-- Lead Details Card -->
        <tr>
          <td style="padding: 0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
              <tr><td style="padding: 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="padding: 8px 0;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Name</span><span style="color: #111827; font-size: 14px; font-weight: 500;">{{lead_name}}</span></td></tr>
                  <tr><td style="padding: 8px 0; border-top: 1px solid #e5e7eb;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">E-Mail</span><a href="mailto:{{lead_email}}" style="color: ${color}; font-size: 14px; text-decoration: none;">{{lead_email}}</a></td></tr>
                  <tr><td style="padding: 8px 0; border-top: 1px solid #e5e7eb;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Telefon</span><a href="tel:{{lead_phone}}" style="color: ${color}; font-size: 14px; text-decoration: none;">{{lead_phone}}</a></td></tr>
                  <tr><td style="padding: 8px 0; border-top: 1px solid #e5e7eb;"><span style="color: #9ca3af; font-size: 12px; display: block; margin-bottom: 2px;">Formular</span><span style="color: #111827; font-size: 14px; font-weight: 500;">{{form_name}}</span></td></tr>
                </table>
              </td></tr>
            </table>
          </td>
        </tr>
        <!-- Dashboard Link -->
        <tr><td style="padding: 0 32px 24px;">
          <a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background-color: ${color}; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">${texts.ctaText || 'Leads anzeigen'}</a>
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
  subject: 'Willkommen bei outrnk Leads!',
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
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 700; color: #111827;">outrnk<span style="color: #0052FF;">.</span></span>
                    <span style="color: #d1d5db; margin: 0 8px;">|</span>
                    <span style="color: #6b7280; font-size: 14px;">Leads</span>
                  </td>
                </tr>
              </table>
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
                    <a href="{{portal_url}}" style="display: inline-block; padding: 12px 24px; background-color: #0052FF; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
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
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.6;">
                Automatisch gesendet von outrnk. Leads<br>
                Bewahre diesen Link sicher auf
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
    let subject = replaceTemplateVariables(template.subject, variables);
    let htmlContent = replaceTemplateVariables(template.html_content, variables);

    // Apply branding to default template (replace hardcoded values)
    if (branding.companyName || branding.logoUrl || branding.primaryColor) {
      htmlContent = htmlContent.replace(
        /<span style="font-size: 20px; font-weight: 700; color: #111827;">outrnk<span style="color: #0052FF;">\.<\/span><\/span>\s*<span style="color: #d1d5db; margin: 0 8px;">\|<\/span>\s*<span style="color: #6b7280; font-size: 14px;">Leads<\/span>/g,
        generateBrandedHeader(branding)
      );
      htmlContent = htmlContent.replace(/#0052FF/g, brandColor);
      htmlContent = htmlContent.replace(/outrnk\. Leads/g, generateBrandedFooter(branding));
    }

    // Determine sender name and from address
    const senderName = branding.companyName || 'outrnk Leads';

    const { data, error } = await resendConfig.client.emails.send({
      from: `${senderName} <${resendConfig.fromEmail}>`,
      to: params.to,
      subject,
      html: htmlContent,
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
