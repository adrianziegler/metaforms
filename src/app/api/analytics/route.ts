import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { getFormAliasMap } from '@/lib/form-aliases';

interface DailyStats {
    date: string;
    total: string;
    qualified: string;
    unqualified: string;
}

interface FormStats {
    form_id: string | null;
    form_name: string;
    total: string;
    qualified: string;
    quality_rate: string;
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

        // Get overall stats
        const overallStats = await query<{
            total: string;
            qualified: string;
            unqualified: string;
            signals_sent: string;
        }>(
            `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'qualified') as qualified,
        COUNT(*) FILTER (WHERE status = 'unqualified') as unqualified,
        COUNT(*) FILTER (WHERE quality_feedback_sent = true) as signals_sent
      FROM leads WHERE org_id = $1`,
            [payload.orgId]
        );

        // Get daily stats for last 30 days
        const dailyStats = await query<DailyStats>(
            `SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'qualified') as qualified,
        COUNT(*) FILTER (WHERE status = 'unqualified') as unqualified
      FROM leads 
      WHERE org_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC`,
            [payload.orgId]
        );

        // Get per-form stats
        const formStats = await query<FormStats>(
            `SELECT
        form_id,
        COALESCE(form_name, 'Unbekannt') as form_name,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'qualified') as qualified,
        ROUND(COUNT(*) FILTER (WHERE status = 'qualified')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as quality_rate
      FROM leads
      WHERE org_id = $1
      GROUP BY form_id, form_name
      ORDER BY total DESC`,
            [payload.orgId]
        );

        // Apply form aliases
        const aliasMap = await getFormAliasMap(payload.orgId);

        const overall = overallStats[0] || { total: '0', qualified: '0', unqualified: '0', signals_sent: '0' };
        const qualityRate = parseInt(overall.total) > 0
            ? Math.round((parseInt(overall.qualified) / parseInt(overall.total)) * 100)
            : 0;

        return NextResponse.json({
            overview: {
                total: parseInt(overall.total),
                qualified: parseInt(overall.qualified),
                unqualified: parseInt(overall.unqualified),
                signalsSent: parseInt(overall.signals_sent),
                qualityRate,
            },
            daily: dailyStats.map(d => ({
                date: d.date,
                total: parseInt(d.total),
                qualified: parseInt(d.qualified),
                unqualified: parseInt(d.unqualified),
            })),
            forms: formStats.map(f => ({
                formName: (f.form_id && aliasMap.has(f.form_id))
                    ? aliasMap.get(f.form_id)!
                    : f.form_name,
                total: parseInt(f.total),
                qualified: parseInt(f.qualified),
                qualityRate: parseFloat(f.quality_rate) || 0,
            })),
        });
    } catch (error) {
        console.error('Analytics error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error' },
            { status: 500 }
        );
    }
}
