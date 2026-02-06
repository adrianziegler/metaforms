// Get all leads assigned to a specific team member
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { getFormAliasMap } from '@/lib/form-aliases';

interface Lead {
    id: string;
    email: string;
    phone: string;
    full_name: string;
    status: string;
    quality_status: string;
    quality_feedback_sent: boolean;
    form_id: string | null;
    form_name: string | null;
    ad_id: string | null;
    assigned_to: string | null;
    notes: string | null;
    created_at: string;
    raw_data: Record<string, unknown> | null;
    capi_sent_stages: string[] | null;
}

interface StatusCount {
    status: string;
    count: string;
}

interface QualityCount {
    quality_status: string;
    count: string;
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

        const { id: memberId } = await params;

        // Verify team member belongs to this org (team_members table, not users)
        const memberResult = await query<{ id: string }>(
            'SELECT id FROM team_members WHERE id = $1 AND org_id = $2',
            [memberId, payload.orgId]
        );

        if (memberResult.length === 0) {
            return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
        }

        // Get all leads assigned to this team member
        const leadsResult = await query<Lead>(
            `SELECT l.*, CONCAT(tm.first_name, ' ', tm.last_name) as assignee_name
             FROM leads l
             LEFT JOIN team_members tm ON l.assigned_to = tm.id
             WHERE l.org_id = $1 AND l.assigned_to = $2
             ORDER BY l.created_at DESC`,
            [payload.orgId, memberId]
        );

        // Apply form aliases
        const aliasMap = await getFormAliasMap(payload.orgId);
        const leads = (leadsResult || []).map(lead => ({
            ...lead,
            form_name: (lead.form_id && aliasMap.has(lead.form_id))
                ? aliasMap.get(lead.form_id)
                : lead.form_name,
        }));

        // Get status counts for analytics
        const statusCounts = await query<StatusCount>(
            `SELECT status, COUNT(*) as count
             FROM leads
             WHERE org_id = $1 AND assigned_to = $2
             GROUP BY status`,
            [payload.orgId, memberId]
        );

        // Get quality status counts
        const qualityCounts = await query<QualityCount>(
            `SELECT quality_status, COUNT(*) as count
             FROM leads
             WHERE org_id = $1 AND assigned_to = $2
             GROUP BY quality_status`,
            [payload.orgId, memberId]
        );

        // Transform counts into analytics object
        const analytics = {
            total: leads.length,
            byStatus: {
                new: 0,
                contacted: 0,
                qualified: 0,
                proposal: 0,
                won: 0,
                lost: 0,
            } as Record<string, number>,
            byQuality: {
                pending: 0,
                qualified: 0,
                unqualified: 0,
            } as Record<string, number>,
        };

        for (const sc of statusCounts) {
            analytics.byStatus[sc.status] = parseInt(sc.count);
        }

        for (const qc of qualityCounts) {
            analytics.byQuality[qc.quality_status] = parseInt(qc.count);
        }

        return NextResponse.json({
            leads: leads || [],
            analytics,
        });
    } catch (error) {
        console.error('Team member leads error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
