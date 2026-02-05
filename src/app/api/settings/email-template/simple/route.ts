// API endpoint for simple email template texts (no HTML editing)
import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface TemplateTexts {
    subject: string;
    greeting: string;
    message: string;
    ctaText?: string;
    portalText?: string;
}

interface StoredTemplate {
    id: string;
    texts: TemplateTexts;
}

// GET - Fetch template texts
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

        const type = request.nextUrl.searchParams.get('type') || 'lead_assignment';

        // Try to get custom template
        const template = await queryOne<{ texts: string }>(
            `SELECT texts FROM email_template_texts
             WHERE org_id = $1 AND template_type = $2`,
            [payload.orgId, type]
        );

        if (template) {
            const texts = typeof template.texts === 'string'
                ? JSON.parse(template.texts)
                : template.texts;
            return NextResponse.json({ texts, isCustom: true });
        }

        // Return null to indicate using defaults
        return NextResponse.json({ texts: null, isCustom: false });
    } catch (error) {
        console.error('Error fetching template texts:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Save template texts
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
        const { type, texts } = body;

        if (!type || !texts) {
            return NextResponse.json({ error: 'Missing type or texts' }, { status: 400 });
        }

        // Ensure table exists
        await query(`
            CREATE TABLE IF NOT EXISTS email_template_texts (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                template_type VARCHAR(50) NOT NULL,
                texts JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(org_id, template_type)
            )
        `);

        // Upsert template texts
        await query(
            `INSERT INTO email_template_texts (org_id, template_type, texts)
             VALUES ($1, $2, $3)
             ON CONFLICT (org_id, template_type)
             DO UPDATE SET texts = $3, updated_at = NOW()`,
            [payload.orgId, type, JSON.stringify(texts)]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving template texts:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE - Reset to default
export async function DELETE(request: NextRequest) {
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

        const type = request.nextUrl.searchParams.get('type') || 'lead_assignment';

        await query(
            `DELETE FROM email_template_texts WHERE org_id = $1 AND template_type = $2`,
            [payload.orgId, type]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting template texts:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
