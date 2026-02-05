// Auto-message sending utility
// Sends emails and WhatsApp messages to leads automatically after form submission
import { query, queryOne } from './db';
import { getResendForOrg } from './email';

interface AutoMessageTemplate {
    id: string;
    org_id: string;
    name: string;
    type: string;
    trigger: string;
    form_id: string | null;
    subject: string | null;
    sender_name: string | null;
    content: EmailContent | WhatsAppContent;
    is_active: boolean;
    branding_preset_id: string | null;
}

interface BrandingPreset {
    id: string;
    logo_url: string | null;
    company_name: string | null;
    primary_color: string;
    footer_text: string | null;
}

interface EmailBranding {
    logoUrl: string | null;
    companyName: string | null;
    primaryColor: string;
    footerText: string | null;
}

interface EmailContent {
    blocks: EmailBlock[];
}

interface EmailBlock {
    type: 'heading' | 'text' | 'button' | 'divider' | 'image';
    text?: string;
    url?: string;
    src?: string;
    alt?: string;
}

interface WhatsAppContent {
    message: string;
}

interface OrgSettings {
    auto_email_enabled: boolean;
    auto_whatsapp_enabled: boolean;
    whatsapp_api_key: string | null;
    branding_company_name: string | null;
    branding_logo_url: string | null;
    branding_primary_color: string | null;
}

interface LeadData {
    id: string;
    email: string | null;
    phone: string | null;
    fullName: string | null;
    formId: string | null;
    formName: string | null;
    rawData: Record<string, string>;
    assigneeName?: string | null;
    assigneeEmail?: string | null;
}

/**
 * Replace {{variable}} placeholders with actual lead data
 */
function replaceVariables(text: string, lead: LeadData, orgName: string | null): string {
    const firstName = lead.fullName?.split(' ')[0] || '';
    const lastName = lead.fullName?.split(' ').slice(1).join(' ') || '';

    let result = text
        .replace(/\{\{full_name\}\}/g, lead.fullName || '')
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{last_name\}\}/g, lastName)
        .replace(/\{\{email\}\}/g, lead.email || '')
        .replace(/\{\{phone\}\}/g, lead.phone || '')
        .replace(/\{\{form_name\}\}/g, lead.formName || '')
        .replace(/\{\{company_name\}\}/g, orgName || '')
        .replace(/\{\{assignee_name\}\}/g, lead.assigneeName || '')
        .replace(/\{\{assignee_email\}\}/g, lead.assigneeEmail || '');

    // Replace custom raw_data fields: {{field_name}}
    for (const [key, value] of Object.entries(lead.rawData)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
    }

    return result;
}

/**
 * Convert email blocks to inline-styled HTML for email
 */
function blocksToHtml(blocks: EmailBlock[], primaryColor: string): string {
    return blocks.map(block => {
        switch (block.type) {
            case 'heading':
                return `<h1 style="margin: 0 0 16px; color: #111827; font-size: 22px; font-weight: 600; line-height: 1.3;">${block.text || ''}</h1>`;
            case 'text':
                return `<p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">${(block.text || '').replace(/\n/g, '<br>')}</p>`;
            case 'button':
                return `<table cellpadding="0" cellspacing="0" style="margin: 8px 0 16px;">
                    <tr><td style="border-radius: 6px; background-color: ${primaryColor};">
                        <a href="${block.url || '#'}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: 500; font-size: 15px;">${block.text || 'Klicken'}</a>
                    </td></tr>
                </table>`;
            case 'divider':
                return `<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">`;
            case 'image':
                return block.src ? `<img src="${block.src}" alt="${block.alt || ''}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0 16px;">` : '';
            default:
                return '';
        }
    }).join('\n');
}

/**
 * Wrap email content in a professional email template
 */
function wrapInEmailTemplate(bodyHtml: string, branding: EmailBranding): string {
    const color = branding.primaryColor || '#0052FF';
    const companyName = branding.companyName || 'outrnk';

    const headerContent = branding.logoUrl
        ? `<img src="${branding.logoUrl}" alt="Logo" style="max-height: 36px; max-width: 180px; object-fit: contain;">`
        : `<span style="font-size: 20px; font-weight: 700; color: #111827;">${companyName}<span style="color: ${color};">.</span></span>`;

    const footerText = branding.footerText || branding.companyName || 'outrnk. Leads';

    return `<!DOCTYPE html>
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
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
              ${headerContent}
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                ${footerText}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Log a sent message
 */
async function logMessage(
    orgId: string,
    templateId: string,
    leadId: string,
    type: string,
    recipient: string,
    subject: string | null,
    status: string,
    errorMessage?: string
) {
    try {
        await query(
            `INSERT INTO auto_message_logs (org_id, template_id, lead_id, type, recipient, subject, status, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [orgId, templateId, leadId, type, recipient, subject, status, errorMessage || null]
        );
    } catch (e) {
        console.error('Failed to log auto-message:', e);
    }
}

/**
 * Send an auto email to a lead
 */
async function sendAutoEmail(
    template: AutoMessageTemplate,
    lead: LeadData,
    settings: OrgSettings
): Promise<boolean> {
    if (!lead.email) return false;

    const resendConfig = await getResendForOrg(template.org_id);
    if (!resendConfig) {
        console.log('[AUTO-EMAIL] Resend not configured, skipping');
        return false;
    }

    try {
        // Get branding - use preset if available, otherwise org settings
        let branding: EmailBranding = {
            logoUrl: settings.branding_logo_url,
            companyName: settings.branding_company_name,
            primaryColor: settings.branding_primary_color || '#0052FF',
            footerText: null,
        };

        if (template.branding_preset_id) {
            try {
                const preset = await queryOne<BrandingPreset>(
                    'SELECT * FROM branding_presets WHERE id = $1',
                    [template.branding_preset_id]
                );
                if (preset) {
                    branding = {
                        logoUrl: preset.logo_url,
                        companyName: preset.company_name,
                        primaryColor: preset.primary_color || '#0052FF',
                        footerText: preset.footer_text,
                    };
                }
            } catch (e) {
                console.error('[AUTO-EMAIL] Failed to load branding preset:', e);
            }
        }

        const content = template.content as EmailContent;
        const orgName = branding.companyName || null;

        // Build email body from blocks with variable replacement
        const bodyBlocks = content.blocks.map(block => ({
            ...block,
            text: block.text ? replaceVariables(block.text, lead, orgName) : block.text,
            url: block.url ? replaceVariables(block.url, lead, orgName) : block.url,
        }));

        const bodyHtml = blocksToHtml(bodyBlocks, branding.primaryColor);
        const html = wrapInEmailTemplate(bodyHtml, branding);
        const subject = replaceVariables(template.subject || 'Nachricht', lead, orgName);
        const senderName = template.sender_name || branding.companyName || 'outrnk Leads';

        const { error } = await resendConfig.client.emails.send({
            from: `${senderName} <${resendConfig.fromEmail}>`,
            to: lead.email,
            subject,
            html,
        });

        if (error) {
            console.error('[AUTO-EMAIL] Send error:', error);
            await logMessage(lead.id.split('-')[0], template.id, lead.id, 'email', lead.email, subject, 'failed', JSON.stringify(error));
            return false;
        }

        await logMessage(template.org_id, template.id, lead.id, 'email', lead.email, subject, 'sent');
        console.log(`[AUTO-EMAIL] Sent to ${lead.email} (template: ${template.name})`);
        return true;
    } catch (error) {
        console.error('[AUTO-EMAIL] Error:', error);
        await logMessage(template.org_id, template.id, lead.id, 'email', lead.email!, template.subject || '', 'failed', String(error));
        return false;
    }
}

/**
 * Send an auto WhatsApp message to a lead
 */
async function sendAutoWhatsApp(
    template: AutoMessageTemplate,
    lead: LeadData,
    settings: OrgSettings
): Promise<boolean> {
    if (!lead.phone || !settings.whatsapp_api_key) return false;

    try {
        const content = template.content as WhatsAppContent;
        const orgName = settings.branding_company_name || null;
        const message = replaceVariables(content.message, lead, orgName);

        // Normalize phone number (remove spaces, dashes, keep +)
        let phone = lead.phone.replace(/[\s\-()]/g, '');
        // Remove leading + for API
        if (phone.startsWith('+')) phone = phone.substring(1);

        const res = await fetch('https://wa.outrnk.io/api/send-message', {
            method: 'POST',
            headers: {
                'X-API-Key': settings.whatsapp_api_key,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ phone, message }),
        });

        const data = await res.json();

        if (!data.success) {
            console.error('[AUTO-WA] Send error:', data);
            await logMessage(template.org_id, template.id, lead.id, 'whatsapp', lead.phone, null, 'failed', data.error || 'Unknown error');
            return false;
        }

        await logMessage(template.org_id, template.id, lead.id, 'whatsapp', lead.phone, null, 'sent');
        console.log(`[AUTO-WA] Sent to ${lead.phone} (template: ${template.name})`);
        return true;
    } catch (error) {
        console.error('[AUTO-WA] Error:', error);
        await logMessage(template.org_id, template.id, lead.id, 'whatsapp', lead.phone!, null, 'failed', String(error));
        return false;
    }
}

/**
 * Main function: Send all matching auto-messages for a lead event
 * @param trigger - 'new_lead' (form submission) or 'lead_assigned' (assigned to team member)
 */
export async function sendAutoMessages(
    orgId: string,
    leadId: string,
    lead: LeadData,
    trigger: 'new_lead' | 'lead_assigned' = 'new_lead'
) {
    try {
        // Get org settings
        let settings: OrgSettings | null = null;
        try {
            settings = await queryOne<OrgSettings>(
                `SELECT auto_email_enabled, auto_whatsapp_enabled, whatsapp_api_key,
                        branding_company_name, branding_logo_url, branding_primary_color
                 FROM organizations WHERE id = $1`,
                [orgId]
            );
        } catch {
            return; // Table/column doesn't exist yet
        }

        if (!settings) return;
        if (!settings.auto_email_enabled && !settings.auto_whatsapp_enabled) return;

        // Get active templates matching this form and trigger
        let templates: AutoMessageTemplate[] = [];
        try {
            templates = await query<AutoMessageTemplate>(
                `SELECT * FROM auto_message_templates
                 WHERE org_id = $1 AND is_active = true
                 AND (trigger = $2 OR trigger IS NULL)
                 AND (form_id IS NULL OR form_id = $3)
                 ORDER BY created_at ASC`,
                [orgId, trigger, lead.formId]
            );
        } catch {
            return; // Table doesn't exist yet
        }

        if (templates.length === 0) return;

        // Send each matching template
        for (const template of templates) {
            // Parse content if stored as string
            if (typeof template.content === 'string') {
                try { template.content = JSON.parse(template.content); } catch { continue; }
            }

            if (template.type === 'email' && settings.auto_email_enabled && lead.email) {
                await sendAutoEmail(template, lead, settings);
            }
            if (template.type === 'whatsapp' && settings.auto_whatsapp_enabled && lead.phone) {
                await sendAutoWhatsApp(template, lead, settings);
            }
        }
    } catch (error) {
        console.error('[AUTO-MSG] Error sending auto-messages:', error);
    }
}
