import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface FormAlias {
    id: string;
    form_id: string;
    original_name: string | null;
    display_name: string;
    created_at: string;
}

interface FormFromLeads {
    form_id: string;
    form_name: string;
}

// GET - Get all form aliases for organization + available forms
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

        // Get existing aliases
        let aliases: FormAlias[] = [];
        try {
            aliases = await query<FormAlias>(
                `SELECT id, form_id, original_name, display_name, created_at
                 FROM form_aliases
                 WHERE org_id = $1
                 ORDER BY display_name ASC`,
                [payload.orgId]
            );
        } catch (dbError: unknown) {
            // Table may not exist yet
            const msg = dbError instanceof Error ? dbError.message : '';
            if (!msg.includes('does not exist')) {
                throw dbError;
            }
        }

        // Get all unique forms from leads
        const formsResult = await query<FormFromLeads>(
            `SELECT DISTINCT form_id, form_name
             FROM leads
             WHERE org_id = $1 AND form_id IS NOT NULL
             ORDER BY form_name ASC`,
            [payload.orgId]
        );

        // Create a map of form_id to alias for easy lookup
        const aliasMap = new Map(aliases.map(a => [a.form_id, a]));

        // Combine forms with their aliases
        const forms = formsResult.map(f => ({
            form_id: f.form_id,
            original_name: f.form_name,
            display_name: aliasMap.get(f.form_id)?.display_name || null,
            alias_id: aliasMap.get(f.form_id)?.id || null,
        }));

        return NextResponse.json({ forms, aliases });
    } catch (error) {
        console.error('Get form aliases error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Fehler beim Laden' },
            { status: 500 }
        );
    }
}

// POST - Create or update a form alias
export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get('auth_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { formId, originalName, displayName } = await request.json();

        if (!formId || !displayName?.trim()) {
            return NextResponse.json(
                { error: 'Formular-ID und Anzeigename sind erforderlich' },
                { status: 400 }
            );
        }

        // Upsert the alias
        const result = await queryOne<FormAlias>(
            `INSERT INTO form_aliases (org_id, form_id, original_name, display_name)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (org_id, form_id)
             DO UPDATE SET display_name = $4, original_name = $3, updated_at = NOW()
             RETURNING id, form_id, original_name, display_name, created_at`,
            [payload.orgId, formId, originalName || null, displayName.trim()]
        );

        return NextResponse.json({ success: true, alias: result });
    } catch (error) {
        console.error('Save form alias error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Fehler beim Speichern' },
            { status: 500 }
        );
    }
}

// DELETE - Remove a form alias
export async function DELETE(request: NextRequest) {
    try {
        const token = request.cookies.get('auth_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const formId = searchParams.get('formId');

        if (!formId) {
            return NextResponse.json(
                { error: 'Formular-ID ist erforderlich' },
                { status: 400 }
            );
        }

        await query(
            `DELETE FROM form_aliases WHERE org_id = $1 AND form_id = $2`,
            [payload.orgId, formId]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete form alias error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Fehler beim Löschen' },
            { status: 500 }
        );
    }
}
