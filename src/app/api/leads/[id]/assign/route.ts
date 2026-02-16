// API endpoint to assign a lead to a team member
import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { sendLeadAssignmentEmail } from '@/lib/email';
import { sendAutoMessages } from '@/lib/auto-message';
import { getFormDisplayName } from '@/lib/form-aliases';

interface AssignLeadBody {
    teamMemberId: string;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Verify authentication
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '') || request.cookies.get('auth_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const { id: leadId } = await params;
        const body: AssignLeadBody = await request.json();
        const { teamMemberId } = body;

        // Get the lead
        const lead = await queryOne<{ id: string; org_id: string; full_name: string; email: string; phone: string; form_id: string | null; form_name: string | null; raw_data: string | null }>(
            'SELECT id, org_id, full_name, email, phone, form_id, form_name, raw_data FROM leads WHERE id = $1',
            [leadId]
        );

        if (!lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        // Verify lead belongs to user's organization
        if (lead.org_id !== payload.orgId) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        // Get the team member to assign to
        const assignee = await queryOne<{ id: string; org_id: string; email: string; first_name: string; last_name: string }>(
            'SELECT id, org_id, email, first_name, last_name FROM team_members WHERE id = $1',
            [teamMemberId]
        );

        if (!assignee) {
            return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
        }

        // Verify team member belongs to same organization
        if (assignee.org_id !== payload.orgId) {
            return NextResponse.json({ error: 'Team member not in same organization' }, { status: 403 });
        }

        // Update lead assignment
        await query(
            'UPDATE leads SET assigned_to = $1, assigned_at = NOW(), updated_at = NOW() WHERE id = $2',
            [teamMemberId, leadId]
        );

        // Resolve form display name (use custom alias if set)
        const displayFormName = await getFormDisplayName(payload.orgId, lead.form_id, lead.form_name);

        // Parse raw_data for email
        let rawData: Record<string, string> = {};
        if (lead.raw_data) {
            try { rawData = typeof lead.raw_data === 'string' ? JSON.parse(lead.raw_data) : lead.raw_data as Record<string, string>; } catch { /* */ }
        }

        // Send email notification with custom template
        const assigneeName = `${assignee.first_name} ${assignee.last_name}`;
        try {
            await sendLeadAssignmentEmail({
                to: assignee.email,
                assigneeName: assigneeName,
                leadName: lead.full_name || 'Unbekannt',
                leadEmail: lead.email || '',
                leadPhone: lead.phone || '',
                leadId: lead.id,
                formName: displayFormName || undefined,
                orgId: payload.orgId,
                teamMemberId: teamMemberId,
                rawData,
            });
        } catch (emailError) {
            console.error('Failed to send assignment email:', emailError);
            // Don't fail the request if email fails
        }

        // Send auto-messages triggered by lead assignment
        try {
            await sendAutoMessages(payload.orgId, leadId, {
                id: leadId,
                email: lead.email || null,
                phone: lead.phone || null,
                fullName: lead.full_name || null,
                formId: lead.form_id || null,
                formName: displayFormName || null,
                rawData,
                assigneeName: assigneeName,
                assigneeEmail: assignee.email,
            }, 'lead_assigned');
        } catch (autoMsgError) {
            console.error('Auto-message sending failed (non-blocking):', autoMsgError);
        }

        return NextResponse.json({
            success: true,
            message: `Lead wurde ${assigneeName} zugewiesen. E-Mail-Benachrichtigung wurde gesendet.`,
            assignee: {
                id: assignee.id,
                name: assigneeName,
                email: assignee.email,
            }
        });
    } catch (error) {
        console.error('Failed to assign lead:', error);
        return NextResponse.json(
            { error: 'Failed to assign lead' },
            { status: 500 }
        );
    }
}

// Unassign a lead
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id: leadId } = await params;

        // Verify lead belongs to user's organization
        const lead = await queryOne<{ org_id: string }>(
            'SELECT org_id FROM leads WHERE id = $1',
            [leadId]
        );

        if (!lead || lead.org_id !== payload.orgId) {
            return NextResponse.json({ error: 'Lead not found or access denied' }, { status: 404 });
        }

        // Update lead to remove assignment
        await query(
            'UPDATE leads SET assigned_to = NULL, assigned_at = NULL, updated_at = NOW() WHERE id = $1',
            [leadId]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to unassign lead:', error);
        return NextResponse.json(
            { error: 'Failed to unassign lead' },
            { status: 500 }
        );
    }
}
