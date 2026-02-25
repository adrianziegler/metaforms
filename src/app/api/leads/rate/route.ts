import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import crypto from 'crypto';

interface Lead {
    id: string;
    email: string | null;
    phone: string | null;
    full_name: string | null;
    status: string;
    org_id: string;
    meta_lead_id: string;
}

/**
 * One-click email rating endpoint
 * No login required - uses secure token
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const token = searchParams.get('token');
        const rating = searchParams.get('rating'); // 'qualified' or 'unqualified'

        if (!token || !rating) {
            return new NextResponse(renderErrorPage('Ungültiger Link'), {
                status: 400,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
        }

        if (!['qualified', 'unqualified'].includes(rating)) {
            return new NextResponse(renderErrorPage('Ungültige Bewertung'), {
                status: 400,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
        }

        // Verify token and get lead
        const lead = await queryOne<Lead>(
            `SELECT l.* FROM leads l
       JOIN lead_email_tokens t ON t.lead_id = l.id
       WHERE t.token = $1 AND t.used = false AND t.expires_at > NOW()`,
            [token]
        );

        if (!lead) {
            return new NextResponse(renderErrorPage('Link ist ungültig oder bereits verwendet'), {
                status: 400,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
        }

        // Update lead status
        await query(
            `UPDATE leads SET status = $1, rated_via = 'email', updated_at = NOW() WHERE id = $2 AND org_id = $3`,
            [rating, lead.id, lead.org_id]
        );

        // Mark token as used
        await query(
            `UPDATE lead_email_tokens SET used = true, used_at = NOW() WHERE token = $1`,
            [token]
        );

        // If qualified, send CAPI signal
        if (rating === 'qualified') {
            await sendQualitySignal(lead);
        }

        // Return success page
        return new NextResponse(renderSuccessPage(rating, lead), {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error) {
        console.error('Email rating error:', error);
        return new NextResponse(renderErrorPage('Ein Fehler ist aufgetreten'), {
            status: 500,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
}

async function sendQualitySignal(lead: Lead) {
    try {
        // Get Meta connection for this org
        const connection = await queryOne<{ access_token: string; pixel_id: string }>(
            'SELECT access_token, pixel_id FROM meta_connections WHERE org_id = $1',
            [lead.org_id]
        );

        if (!connection?.pixel_id || !connection?.access_token) {
            console.log('No Meta connection for quality signal');
            return;
        }

        // Import and use Meta CAPI functions
        const { sendCAPIEvent, createQualifiedLeadEvent } = await import('@/lib/meta-api');

        const event = createQualifiedLeadEvent(
            lead.email,
            lead.phone,
            lead.meta_lead_id
        );

        await sendCAPIEvent(connection.pixel_id, connection.access_token, [event]);

        // Mark as signal sent
        await query(
            `UPDATE leads SET quality_feedback_sent = true, quality_feedback_sent_at = NOW() WHERE id = $1 AND org_id = $2`,
            [lead.id, lead.org_id]
        );

        console.log('CAPI signal sent via email rating:', lead.id);
    } catch (error) {
        console.error('Failed to send CAPI signal:', error);
    }
}

/**
 * Generate a secure token for email rating
 */
export function generateRatingToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

function renderSuccessPage(rating: string, lead: Lead): string {
    const isQualified = rating === 'qualified';
    const emoji = isQualified ? '✅' : '❌';
    const color = isQualified ? '#10b981' : '#ef4444';
    const title = isQualified ? 'Lead qualifiziert!' : 'Lead als unqualifiziert markiert';
    const message = isQualified
        ? 'Der Lead wurde als qualifiziert markiert und das Qualitäts-Signal wurde an Meta gesendet. Der Algorithmus lernt jetzt, mehr solcher Leads zu finden.'
        : 'Der Lead wurde als unqualifiziert markiert. Diese Information hilft dabei, bessere Leads zu generieren.';

    return `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - outrnk Leads</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px 20px; background: #f3f4f6; }
        .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .emoji { font-size: 64px; margin-bottom: 20px; }
        h1 { color: ${color}; margin: 0 0 16px; font-size: 24px; }
        p { color: #6b7280; line-height: 1.6; margin: 0 0 24px; }
        .lead-info { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: left; }
        .lead-info div { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .lead-info div:last-child { border: none; }
        .lead-info span { color: #9ca3af; font-size: 14px; }
        .lead-info strong { color: #111827; display: block; }
        .info-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-top: 24px; text-align: left; }
        .info-box h3 { color: #1d4ed8; margin: 0 0 8px; font-size: 14px; }
        .info-box p { color: #1e40af; font-size: 13px; margin: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="emoji">${emoji}</div>
        <h1>${title}</h1>
        <p>${message}</p>
        
        <div class="lead-info">
          <div>
            <span>Name</span>
            <strong>${lead.full_name || '-'}</strong>
          </div>
          <div>
            <span>E-Mail</span>
            <strong>${lead.email || '-'}</strong>
          </div>
          <div>
            <span>Telefon</span>
            <strong>${lead.phone || '-'}</strong>
          </div>
        </div>

        ${isQualified ? `
        <div class="info-box">
          <h3>💡 Was passiert jetzt?</h3>
          <p>Meta's Algorithmus nutzt diese Information um zukünftig ähnliche Nutzer anzusprechen. Je mehr qualifizierte Leads du markierst, desto besser wird die Lead-Qualität.</p>
        </div>
        ` : ''}
        
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
          Du kannst dieses Fenster jetzt schließen.
        </p>
      </div>
    </body>
    </html>
  `;
}

function renderErrorPage(message: string): string {
    return `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Fehler - outrnk Leads</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px 20px; background: #f3f4f6; }
        .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .emoji { font-size: 64px; margin-bottom: 20px; }
        h1 { color: #ef4444; margin: 0 0 16px; font-size: 24px; }
        p { color: #6b7280; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="emoji">⚠️</div>
        <h1>Fehler</h1>
        <p>${message}</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
          Falls du Hilfe benötigst, kontaktiere den Administrator.
        </p>
      </div>
    </body>
    </html>
  `;
}
