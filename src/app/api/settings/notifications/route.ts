// API endpoint to manage organization notification settings
import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface NotificationSettings {
    notify_new_lead: boolean;
    notify_lead_assigned: boolean;
}

// GET - Fetch notification settings
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '') || request.cookies.get('auth_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const settings = await queryOne<NotificationSettings>(
            'SELECT notify_new_lead, notify_lead_assigned FROM organizations WHERE id = $1',
            [payload.orgId]
        );

        return NextResponse.json({
            notifyNewLead: settings?.notify_new_lead ?? true,
            notifyLeadAssigned: settings?.notify_lead_assigned ?? true,
        });
    } catch (error) {
        console.error('Error fetching notification settings:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Update notification settings
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '') || request.cookies.get('auth_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const body = await request.json();
        const updates: string[] = [];
        const values: (boolean | string)[] = [];
        let paramIndex = 1;

        if (typeof body.notifyNewLead === 'boolean') {
            updates.push(`notify_new_lead = $${paramIndex++}`);
            values.push(body.notifyNewLead);
        }

        if (typeof body.notifyLeadAssigned === 'boolean') {
            updates.push(`notify_lead_assigned = $${paramIndex++}`);
            values.push(body.notifyLeadAssigned);
        }

        if (updates.length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        values.push(payload.orgId);
        await query(
            `UPDATE organizations SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
            values
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating notification settings:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
