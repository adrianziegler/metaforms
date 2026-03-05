// API endpoint to fetch email audit logs for admin notifications
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface EmailLog {
    id: string;
    recipient: string;
    subject: string;
    success: boolean;
    error_message: string | null;
    created_at: string;
}

// GET - Fetch email logs for new lead notifications
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

        // Get limit from query params (default 20)
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

        const logs = await query<EmailLog>(
            `SELECT id, recipient, subject, success, error_message, created_at
             FROM email_audit
             WHERE org_id = $1 AND email_type = 'new_lead_notification'
             ORDER BY created_at DESC
             LIMIT $2`,
            [payload.orgId, limit]
        );

        return NextResponse.json({ logs });
    } catch (error) {
        console.error('Error fetching email logs:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
