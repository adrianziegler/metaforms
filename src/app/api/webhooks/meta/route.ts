// Meta Webhook Handler for Lead Generation
import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getLeadDetails, getFormDetails } from '@/lib/meta-api';
import { sendAutoMessages } from '@/lib/auto-message';
import { sendNewLeadNotification } from '@/lib/email';

interface MetaConnection {
    org_id: string;
    access_token: string;
    page_id: string;
}

interface OrgNotifySettings {
    notify_new_lead: boolean;
}

// Webhook verification (GET request from Meta)
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    console.log('Webhook verification attempt:', { mode, token, challenge, expected: process.env.WEBHOOK_SECRET });

    if (mode === 'subscribe' && token === process.env.WEBHOOK_SECRET) {
        console.log('Webhook verified successfully');
        // Return challenge as plain text with explicit Content-Type
        return new Response(challenge, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
        });
    }

    console.log('Webhook verification failed - token mismatch');
    return new Response('Forbidden', { status: 403 });
}

// Handle incoming lead data (POST request from Meta)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        console.log('[WEBHOOK] Received:', JSON.stringify(body, null, 2));

        // Process each entry
        for (const entry of body.entry || []) {
            console.log('[WEBHOOK] Processing entry:', entry.id);
            for (const change of entry.changes || []) {
                console.log('[WEBHOOK] Change field:', change.field);
                if (change.field === 'leadgen') {
                    const leadgenId = change.value.leadgen_id;
                    const pageId = change.value.page_id;
                    const formId = change.value.form_id;
                    const adId = change.value.ad_id;

                    console.log('[WEBHOOK] Lead received:', { leadgenId, pageId, formId, adId });
                    await processLead(leadgenId, pageId, formId, adId);
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[WEBHOOK] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

async function processLead(
    leadgenId: string,
    pageId: string,
    formId: string,
    adId?: string
) {
    console.log('[PROCESS] Starting for lead:', leadgenId, 'page:', pageId);
    try {
        // Find the meta connection for this page
        const connection = await queryOne<MetaConnection>(
            'SELECT * FROM meta_connections WHERE page_id = $1',
            [pageId]
        );

        if (!connection) {
            // Log all existing connections for debugging
            const allConnections = await query<{ page_id: string; org_id: string }>(
                'SELECT page_id, org_id FROM meta_connections'
            );
            console.error('[PROCESS] No connection found for page:', pageId);
            console.error('[PROCESS] Available connections:', JSON.stringify(allConnections));
            return;
        }
        console.log('[PROCESS] Found connection for org:', connection.org_id);

        // Check if lead already exists
        const existing = await queryOne<{ id: string }>(
            'SELECT id FROM leads WHERE org_id = $1 AND meta_lead_id = $2',
            [connection.org_id, leadgenId]
        );

        if (existing) {
            console.log('Lead already exists:', leadgenId);
            return;
        }

        // Fetch lead details from Meta
        console.log('[PROCESS] Fetching lead details from Meta...');
        const leadData = await getLeadDetails(leadgenId, connection.access_token);
        console.log('[PROCESS] Lead data received:', JSON.stringify(leadData, null, 2));

        // Fetch form name from Meta
        let formName = `Form ${formId?.slice(-6) || 'Unknown'}`;
        if (formId) {
            try {
                const formDetails = await getFormDetails(formId, connection.access_token);
                formName = formDetails.name;
            } catch (e) {
                console.error('Failed to fetch form name:', e);
            }
        }

        // Parse field data - store all values (FB multiple choice can have multiple)
        const fieldMap: Record<string, string> = {};
        for (const field of leadData.field_data || []) {
            if (field.values.length > 1) {
                fieldMap[field.name] = field.values.join(', ');
            } else {
                fieldMap[field.name] = field.values[0] || '';
            }
        }

        // Extract standard fields
        const fullName = fieldMap['full_name'] || `${fieldMap['first_name'] || ''} ${fieldMap['last_name'] || ''}`.trim();
        const email = fieldMap['email'] || null;
        const phone = fieldMap['phone_number'] || fieldMap['phone'] || null;

        // Insert lead into database with form info
        console.log('[PROCESS] Inserting lead into DB:', { orgId: connection.org_id, email, phone, fullName, formName });
        await query(
            `INSERT INTO leads (org_id, meta_lead_id, email, phone, full_name, raw_data, form_id, form_name, ad_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')`,
            [connection.org_id, leadgenId, email, phone, fullName, JSON.stringify(fieldMap), formId, formName, adId || null]
        );

        console.log('[PROCESS] ✅ Lead saved successfully:', leadgenId, 'Form:', formName);

        // Send auto-messages (email + WhatsApp) to the new lead
        try {
            const insertedLead = await queryOne<{ id: string }>(
                'SELECT id FROM leads WHERE org_id = $1 AND meta_lead_id = $2',
                [connection.org_id, leadgenId]
            );
            if (insertedLead) {
                await sendAutoMessages(connection.org_id, insertedLead.id, {
                    id: insertedLead.id,
                    email,
                    phone,
                    fullName,
                    formId,
                    formName,
                    rawData: fieldMap,
                }, 'new_lead');
            }
        } catch (autoMsgError) {
            console.error('Auto-message sending failed (non-blocking):', autoMsgError);
        }

        // Send notification to org admin(s) about new lead
        try {
            const orgSettings = await queryOne<OrgNotifySettings>(
                'SELECT notify_new_lead FROM organizations WHERE id = $1',
                [connection.org_id]
            );

            console.log('[PROCESS] Org notification settings:', { orgId: connection.org_id, notify_new_lead: orgSettings?.notify_new_lead });

            // Default to true if column doesn't exist or is null
            if (orgSettings?.notify_new_lead !== false) {
                // Get admin users for this org (admin role OR first registered user)
                const admins = await query<{ email: string }>(
                    `SELECT DISTINCT email FROM users WHERE org_id = $1 AND (role = 'admin' OR id = (SELECT id FROM users WHERE org_id = $1 ORDER BY created_at ASC LIMIT 1))`,
                    [connection.org_id]
                );

                console.log('[PROCESS] Found admins to notify:', admins.length, admins.map(a => a.email));

                if (admins.length === 0) {
                    console.warn('[PROCESS] No admins found for org', connection.org_id);
                }

                let successCount = 0;
                let failCount = 0;
                for (const admin of admins) {
                    const result = await sendNewLeadNotification(admin.email, {
                        id: leadgenId,
                        fullName,
                        email,
                        phone,
                        formName,
                    }, connection.org_id);

                    if (result.success) {
                        successCount++;
                        console.log('[PROCESS] Admin notification SUCCESS:', admin.email);
                    } else {
                        failCount++;
                        console.error('[PROCESS] Admin notification FAILED:', admin.email, result.error);
                    }
                }
                console.log(`[PROCESS] Admin notifications complete: ${successCount} sent, ${failCount} failed`);
            } else {
                console.log('[PROCESS] Admin notifications disabled for org', connection.org_id);
            }
        } catch (notifyError) {
            console.error('Admin notification failed (non-blocking):', notifyError);
        }
    } catch (error) {
        console.error('Failed to process lead:', error);
    }
}
