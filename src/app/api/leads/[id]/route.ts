// Update lead status with auto CAPI signal for positive stages
import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { sendCAPIEvent, createQualifiedLeadEvent } from '@/lib/meta-api';

interface Lead {
    id: string;
    org_id: string;
    email: string | null;
    phone: string | null;
    full_name: string;
    status: string;
    notes: string;
    meta_lead_id: string;
    quality_feedback_sent: boolean;
}

interface MetaConnection {
    access_token: string;
    pixel_id: string;
}

// Stages that trigger CAPI signal
const CAPI_STAGES = ['qualified', 'interested', 'meeting', 'won'];

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = request.cookies.get('auth_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const { status, notes } = body as { status?: string; notes?: string };

        // Build update
        const updates: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (status) {
            updates.push(`status = $${paramIndex++}`);
            values.push(status);
        }
        if (notes !== undefined) {
            updates.push(`notes = $${paramIndex++}`);
            values.push(notes);
        }

        if (updates.length === 0) {
            return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
        }

        values.push(id, payload.orgId);

        const lead = await queryOne<Lead>(
            `UPDATE leads SET ${updates.join(', ')}, updated_at = NOW() 
       WHERE id = $${paramIndex++} AND org_id = $${paramIndex} 
       RETURNING *`,
            values
        );

        if (!lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        // Auto-send CAPI signal for positive stages
        let capiSent = false;
        if (status && CAPI_STAGES.includes(status) && !lead.quality_feedback_sent) {
            capiSent = await sendQualitySignalForLead(lead, payload.orgId);
        }

        return NextResponse.json({
            success: true,
            lead,
            capiSent,
            message: capiSent ? 'Status aktualisiert & Signal an Meta gesendet!' : undefined
        });
    } catch (error) {
        console.error('Lead update error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

async function sendQualitySignalForLead(lead: Lead, orgId: string): Promise<boolean> {
    try {
        const connection = await queryOne<MetaConnection>(
            'SELECT access_token, pixel_id FROM meta_connections WHERE org_id = $1',
            [orgId]
        );

        if (!connection?.pixel_id || !connection?.access_token) {
            console.log('No Meta connection for CAPI signal');
            return false;
        }

        const event = createQualifiedLeadEvent(
            lead.email,
            lead.phone,
            lead.meta_lead_id
        );

        await sendCAPIEvent(connection.pixel_id, connection.access_token, [event]);

        // Mark as sent
        await query(
            `UPDATE leads SET quality_feedback_sent = true, quality_feedback_sent_at = NOW() WHERE id = $1`,
            [lead.id]
        );

        console.log('CAPI signal auto-sent for stage:', lead.status);
        return true;
    } catch (error) {
        console.error('Failed to send CAPI signal:', error);
        return false;
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = request.cookies.get('auth_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const lead = await queryOne<Lead>(
            'SELECT * FROM leads WHERE id = $1 AND org_id = $2',
            [id, payload.orgId]
        );

        if (!lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        return NextResponse.json({ lead });
    } catch (error) {
        console.error('Lead fetch error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = request.cookies.get('auth_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Delete related records first (activities, assignments, etc.)
        await query('DELETE FROM lead_activities WHERE lead_id = $1', [id]);

        // Delete the lead
        const result = await queryOne<{ id: string }>(
            'DELETE FROM leads WHERE id = $1 AND org_id = $2 RETURNING id',
            [id, payload.orgId]
        );

        if (!result) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Lead delete error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
