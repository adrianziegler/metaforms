import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { getFormAliasMap } from '@/lib/form-aliases';

interface AutoMessageTemplate {
    id: string;
    org_id: string;
    name: string;
    type: string;
    trigger: string;
    form_id: string | null;
    form_name: string | null;
    subject: string | null;
    sender_name: string | null;
    content: unknown;
    is_active: boolean;
    branding_preset_id: string | null;
    created_at: string;
    updated_at: string;
}

// GET - List all templates for org
export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('auth_token')?.value;
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        let templates: AutoMessageTemplate[] = [];
        try {
            templates = await query<AutoMessageTemplate>(
                `SELECT * FROM auto_message_templates WHERE org_id = $1 ORDER BY created_at DESC`,
                [payload.orgId]
            );
        } catch (dbError: unknown) {
            const msg = dbError instanceof Error ? dbError.message : '';
            if (msg.includes('does not exist')) {
                return NextResponse.json({ templates: [] });
            }
            throw dbError;
        }

        // Also get available forms from leads
        const formsResult = await query<{ form_id: string; form_name: string }>(
            `SELECT DISTINCT form_id, form_name FROM leads
             WHERE org_id = $1 AND form_id IS NOT NULL AND form_name IS NOT NULL
             ORDER BY form_name`,
            [payload.orgId]
        );

        // Apply form aliases
        const aliasMap = await getFormAliasMap(payload.orgId);
        const templatesWithAliases = templates.map(t => ({
            ...t,
            form_name: (t.form_id && aliasMap.has(t.form_id))
                ? aliasMap.get(t.form_id)
                : t.form_name,
        }));
        const formsWithAliases = formsResult.map(f => ({
            ...f,
            form_name: aliasMap.has(f.form_id)
                ? aliasMap.get(f.form_id)!
                : f.form_name,
        }));

        return NextResponse.json({ templates: templatesWithAliases, forms: formsWithAliases });
    } catch (error) {
        console.error('List templates error:', error);
        return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 });
    }
}

// POST - Create new template
export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get('auth_token')?.value;
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { name, type, trigger, formId, formName, subject, senderName, content, isActive, brandingPresetId } = body;

        if (!name || !type || !content) {
            return NextResponse.json({ error: 'Name, Typ und Inhalt sind erforderlich' }, { status: 400 });
        }

        if (!['email', 'whatsapp'].includes(type)) {
            return NextResponse.json({ error: 'Typ muss email oder whatsapp sein' }, { status: 400 });
        }

        const triggerValue = ['new_lead', 'lead_assigned'].includes(trigger) ? trigger : 'new_lead';

        let template: AutoMessageTemplate | null = null;
        try {
            template = await queryOne<AutoMessageTemplate>(
                `INSERT INTO auto_message_templates (org_id, name, type, trigger, form_id, form_name, subject, sender_name, content, is_active, branding_preset_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 RETURNING *`,
                [
                    payload.orgId,
                    name,
                    type,
                    triggerValue,
                    formId || null,
                    formName || null,
                    subject || null,
                    senderName || null,
                    JSON.stringify(content),
                    isActive !== false,
                    brandingPresetId || null,
                ]
            );
        } catch (dbError: unknown) {
            const msg = dbError instanceof Error ? dbError.message : '';
            if (msg.includes('does not exist')) {
                return NextResponse.json(
                    { error: 'Datenbank-Tabelle fehlt. Bitte Migration ausfuhren (/api/migrate).' },
                    { status: 500 }
                );
            }
            throw dbError;
        }

        return NextResponse.json({ template });
    } catch (error) {
        console.error('Create template error:', error);
        return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 });
    }
}

// PATCH - Update template
export async function PATCH(request: NextRequest) {
    try {
        const token = request.cookies.get('auth_token')?.value;
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { id, name, trigger, formId, formName, subject, senderName, content, isActive, brandingPresetId } = body;

        if (!id) {
            return NextResponse.json({ error: 'Template ID erforderlich' }, { status: 400 });
        }

        let existing: { id: string } | null = null;
        try {
            existing = await queryOne<{ id: string }>(
                `SELECT id FROM auto_message_templates WHERE id = $1 AND org_id = $2`,
                [id, payload.orgId]
            );
        } catch (dbError: unknown) {
            const msg = dbError instanceof Error ? dbError.message : '';
            if (msg.includes('does not exist')) {
                return NextResponse.json({ error: 'Datenbank-Tabelle fehlt. Bitte Migration ausfuhren (/api/migrate).' }, { status: 500 });
            }
            throw dbError;
        }
        if (!existing) {
            return NextResponse.json({ error: 'Template nicht gefunden' }, { status: 404 });
        }

        const updates: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
        if (trigger !== undefined) { updates.push(`trigger = $${idx++}`); values.push(trigger); }
        if (formId !== undefined) { updates.push(`form_id = $${idx++}`); values.push(formId || null); }
        if (formName !== undefined) { updates.push(`form_name = $${idx++}`); values.push(formName || null); }
        if (subject !== undefined) { updates.push(`subject = $${idx++}`); values.push(subject); }
        if (senderName !== undefined) { updates.push(`sender_name = $${idx++}`); values.push(senderName); }
        if (content !== undefined) { updates.push(`content = $${idx++}`); values.push(JSON.stringify(content)); }
        if (isActive !== undefined) { updates.push(`is_active = $${idx++}`); values.push(isActive); }
        if (brandingPresetId !== undefined) { updates.push(`branding_preset_id = $${idx++}`); values.push(brandingPresetId || null); }

        updates.push(`updated_at = NOW()`);
        values.push(id);
        values.push(payload.orgId);

        const template = await queryOne<AutoMessageTemplate>(
            `UPDATE auto_message_templates SET ${updates.join(', ')}
             WHERE id = $${idx++} AND org_id = $${idx}
             RETURNING *`,
            values
        );

        return NextResponse.json({ template });
    } catch (error) {
        console.error('Update template error:', error);
        return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 });
    }
}

// DELETE - Delete template
export async function DELETE(request: NextRequest) {
    try {
        const token = request.cookies.get('auth_token')?.value;
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Template ID erforderlich' }, { status: 400 });
        }

        try {
            await query(
                `DELETE FROM auto_message_templates WHERE id = $1 AND org_id = $2`,
                [id, payload.orgId]
            );
        } catch (dbError: unknown) {
            const msg = dbError instanceof Error ? dbError.message : '';
            if (msg.includes('does not exist')) {
                return NextResponse.json({ error: 'Datenbank-Tabelle fehlt. Bitte Migration ausfuhren (/api/migrate).' }, { status: 500 });
            }
            throw dbError;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete template error:', error);
        return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 });
    }
}
