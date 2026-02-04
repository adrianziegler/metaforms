// Meta Webhook Handler for Lead Generation
import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getLeadDetails, getFormDetails } from '@/lib/meta-api';
import { sendAutoMessages } from '@/lib/auto-message';

interface MetaConnection {
    org_id: string;
    access_token: string;
    page_id: string;
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

        // Process each entry
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                if (change.field === 'leadgen') {
                    const leadgenId = change.value.leadgen_id;
                    const pageId = change.value.page_id;
                    const formId = change.value.form_id;
                    const adId = change.value.ad_id;

                    await processLead(leadgenId, pageId, formId, adId);
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
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
    try {
        // Find the meta connection for this page
        const connection = await queryOne<MetaConnection>(
            'SELECT * FROM meta_connections WHERE page_id = $1',
            [pageId]
        );

        if (!connection) {
            console.error('No connection found for page:', pageId);
            return;
        }

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
        const leadData = await getLeadDetails(leadgenId, connection.access_token);

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
        await query(
            `INSERT INTO leads (org_id, meta_lead_id, email, phone, full_name, raw_data, form_id, form_name, ad_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')`,
            [connection.org_id, leadgenId, email, phone, fullName, JSON.stringify(fieldMap), formId, formName, adId || null]
        );

        console.log('Lead saved successfully:', leadgenId, 'Form:', formName);

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
    } catch (error) {
        console.error('Failed to process lead:', error);
    }
}
