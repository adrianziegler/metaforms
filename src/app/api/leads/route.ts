// List leads for organization
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { applyFormAliases, getFormAliasMap } from '@/lib/form-aliases';

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
}

interface FormOption {
    form_id: string;
    form_name: string;
}

export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('auth_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse query params
        const searchParams = request.nextUrl.searchParams;
        const status = searchParams.get('status');
        const formId = searchParams.get('form_id');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = (page - 1) * limit;

        // Build query
        let sql = `
            SELECT l.*,
                   COALESCE(l.capi_sent_stages, '[]')::jsonb as capi_sent_stages,
                   CONCAT(tm.first_name, ' ', tm.last_name) as assignee_name
            FROM leads l
            LEFT JOIN team_members tm ON l.assigned_to = tm.id
            WHERE l.org_id = $1
        `;
        const params: (string | number)[] = [payload.orgId];
        let paramIndex = 2;

        if (status) {
            sql += ` AND l.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (formId) {
            sql += ` AND l.form_id = $${paramIndex}`;
            params.push(formId);
            paramIndex++;
        }

        sql += ` ORDER BY l.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const leads = await query<Lead>(sql, params);

        // Get total count
        let countSql = `SELECT COUNT(*) as count FROM leads WHERE org_id = $1`;
        const countParams: (string | number)[] = [payload.orgId];
        let countIndex = 2;

        if (status) {
            countSql += ` AND status = $${countIndex}`;
            countParams.push(status);
            countIndex++;
        }
        if (formId) {
            countSql += ` AND form_id = $${countIndex}`;
            countParams.push(formId);
        }

        const countResult = await query<{ count: string }>(countSql, countParams);
        const total = parseInt(countResult[0]?.count || '0');

        // Get distinct forms for filter dropdown
        const formsResult = await query<FormOption>(
            `SELECT DISTINCT form_id, form_name FROM leads WHERE org_id = $1 AND form_id IS NOT NULL ORDER BY form_name`,
            [payload.orgId]
        );

        // Apply form aliases to leads and forms
        const aliasMap = await getFormAliasMap(payload.orgId);
        const leadsWithAliases = (leads || []).map(lead => ({
            ...lead,
            form_name: (lead.form_id && aliasMap.has(lead.form_id))
                ? aliasMap.get(lead.form_id)
                : lead.form_name,
        }));
        const formsWithAliases = (formsResult || []).map(form => ({
            ...form,
            form_name: aliasMap.has(form.form_id)
                ? aliasMap.get(form.form_id)!
                : form.form_name,
        }));

        return NextResponse.json({
            leads: leadsWithAliases,
            forms: formsWithAliases,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Leads list error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
