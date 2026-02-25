// API endpoint to assign a lead to a team member
import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { sendLeadAssignmentEmail } from '@/lib/email';
import { sendAutoMessages } from '@/lib/auto-message';
import { getFormDisplayName } from '@/lib/form-aliases';

interface AssignLeadBody {
    leadId: string;
    teamMemberId: string;
}

interface Lead {
    id: string;
    org_id: string;
    full_name: string;
    email: string;
    phone: string;
    form_id: string | null;
    form_name: string;
    raw_data: string | null;
}

interface TeamMember {
    id: string;
    org_id: string;
    first_name: string;
    last_name: string;
    email: string;
}

export async function POST(request: NextRequest) {
    console.log('=== ASSIGN API CALLED ===');

    try {
        // Verify authentication
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '') || request.cookies.get('auth_token')?.value;

        console.log('Auth token present:', !!token);

        if (!token) {
            console.log('ERROR: No token');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(token);
        console.log('Token payload:', payload ? { orgId: payload.orgId, userId: payload.userId } : null);

        if (!payload) {
            console.log('ERROR: Invalid token');
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const body: AssignLeadBody = await request.json();
        const { leadId, teamMemberId } = body;

        console.log('Request body:', { leadId, teamMemberId });

        if (!leadId || !teamMemberId) {
            console.log('ERROR: Missing required fields');
            return NextResponse.json({ error: 'leadId and teamMemberId are required' }, { status: 400 });
        }

        // Get the lead
        console.log('Fetching lead:', leadId);
        const lead = await queryOne<Lead>(
            'SELECT id, org_id, full_name, email, phone, form_id, form_name, raw_data FROM leads WHERE id = $1',
            [leadId]
        );

        console.log('Lead found:', lead ? { id: lead.id, org_id: lead.org_id } : null);

        if (!lead) {
            console.log('ERROR: Lead not found');
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        // Verify lead belongs to user's organization
        console.log('Checking org match - Lead org:', lead.org_id, 'User org:', payload.orgId);
        if (lead.org_id !== payload.orgId) {
            console.log('ERROR: Lead org mismatch');
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        // Get the team member to assign to
        console.log('Fetching team member:', teamMemberId);
        const teamMember = await queryOne<TeamMember>(
            'SELECT id, org_id, first_name, last_name, email FROM team_members WHERE id = $1',
            [teamMemberId]
        );

        console.log('Team member found:', teamMember ? { id: teamMember.id, org_id: teamMember.org_id } : null);

        if (!teamMember) {
            console.log('ERROR: Team member not found');
            return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
        }

        // Verify team member belongs to same organization
        console.log('Checking org match - Member org:', teamMember.org_id, 'User org:', payload.orgId);
        if (teamMember.org_id !== payload.orgId) {
            console.log('ERROR: Team member org mismatch');
            return NextResponse.json({ error: 'Team member not in same organization' }, { status: 403 });
        }

        // Update lead assignment
        console.log('Updating lead assignment in database...');
        await query(
            'UPDATE leads SET assigned_to = $1, assigned_at = NOW(), updated_at = NOW() WHERE id = $2 AND org_id = $3',
            [teamMemberId, leadId, payload.orgId]
        );
        console.log('Lead assignment updated successfully');

        // Resolve form display name (use custom alias if set)
        const displayFormName = await getFormDisplayName(payload.orgId, lead.form_id, lead.form_name);

        // Parse raw_data for email
        let rawData: Record<string, string> = {};
        if (lead.raw_data) {
            try { rawData = typeof lead.raw_data === 'string' ? JSON.parse(lead.raw_data) : lead.raw_data as Record<string, string>; } catch { /* */ }
        }

        // Send email notification with portal link
        try {
            console.log('Sending assignment email to:', teamMember.email);
            await sendLeadAssignmentEmail({
                to: teamMember.email,
                assigneeName: `${teamMember.first_name} ${teamMember.last_name}`,
                leadName: lead.full_name || 'Unbekannt',
                leadEmail: lead.email || '',
                leadPhone: lead.phone || '',
                leadId: lead.id,
                formName: displayFormName || undefined,
                orgId: payload.orgId,
                teamMemberId: teamMember.id,
                rawData,
            });
            console.log('Email sent successfully');
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
                formName: lead.form_name || null,
                rawData,
                assigneeName: `${teamMember.first_name} ${teamMember.last_name}`,
                assigneeEmail: teamMember.email,
            }, 'lead_assigned');
        } catch (autoMsgError) {
            console.error('Auto-message sending failed (non-blocking):', autoMsgError);
        }

        console.log('=== ASSIGN SUCCESS ===');
        return NextResponse.json({
            success: true,
            message: `Lead wurde ${teamMember.first_name} ${teamMember.last_name} zugewiesen. E-Mail wurde gesendet.`,
            assignee: {
                id: teamMember.id,
                name: `${teamMember.first_name} ${teamMember.last_name}`,
                email: teamMember.email,
            }
        });
    } catch (error) {
        console.error('=== ASSIGN ERROR ===');
        console.error('Failed to assign lead:', error);
        return NextResponse.json(
            { error: 'Failed to assign lead' },
            { status: 500 }
        );
    }
}
