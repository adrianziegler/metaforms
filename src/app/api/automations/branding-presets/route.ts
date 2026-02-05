import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface BrandingPreset {
    id: string;
    org_id: string;
    name: string;
    logo_url: string | null;
    company_name: string | null;
    primary_color: string;
    footer_text: string | null;
    is_default: boolean;
    created_at: string;
}

// GET - List all branding presets for the organization
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

        let presets: BrandingPreset[] = [];
        try {
            presets = await query<BrandingPreset>(
                'SELECT * FROM branding_presets WHERE org_id = $1 ORDER BY is_default DESC, created_at DESC',
                [payload.orgId]
            );
        } catch (dbError: unknown) {
            const msg = dbError instanceof Error ? dbError.message : '';
            if (msg.includes('does not exist')) {
                return NextResponse.json({ presets: [] });
            }
            throw dbError;
        }

        return NextResponse.json({ presets });
    } catch (error) {
        console.error('Get branding presets error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error' },
            { status: 500 }
        );
    }
}

// POST - Create a new branding preset
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

        const { name, logoUrl, companyName, primaryColor, footerText, isDefault } = await request.json();

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Name ist erforderlich' }, { status: 400 });
        }

        // If this is set as default, unset other defaults first
        if (isDefault) {
            await query(
                'UPDATE branding_presets SET is_default = false WHERE org_id = $1',
                [payload.orgId]
            );
        }

        const preset = await queryOne<BrandingPreset>(
            'INSERT INTO branding_presets (org_id, name, logo_url, company_name, primary_color, footer_text, is_default) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [
                payload.orgId,
                name.trim(),
                logoUrl || null,
                companyName || null,
                primaryColor || '#0052FF',
                footerText || null,
                isDefault || false,
            ]
        );

        return NextResponse.json({ preset });
    } catch (error) {
        console.error('Create branding preset error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error' },
            { status: 500 }
        );
    }
}

// PATCH - Update a branding preset
export async function PATCH(request: NextRequest) {
    try {
        const token = request.cookies.get('auth_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, name, logoUrl, companyName, primaryColor, footerText, isDefault } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'ID ist erforderlich' }, { status: 400 });
        }

        // If setting as default, unset others first
        if (isDefault) {
            await query('UPDATE branding_presets SET is_default = false WHERE org_id = $1', [payload.orgId]);
        }

        const preset = await queryOne<BrandingPreset>(
            'UPDATE branding_presets SET name = COALESCE($1, name), logo_url = $2, company_name = $3, primary_color = COALESCE($4, primary_color), footer_text = $5, is_default = COALESCE($6, is_default), updated_at = NOW() WHERE id = $7 AND org_id = $8 RETURNING *',
            [name, logoUrl, companyName, primaryColor, footerText, isDefault, id, payload.orgId]
        );

        if (!preset) {
            return NextResponse.json({ error: 'Preset nicht gefunden' }, { status: 404 });
        }

        return NextResponse.json({ preset });
    } catch (error) {
        console.error('Update branding preset error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error' },
            { status: 500 }
        );
    }
}

// DELETE - Delete a branding preset
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

        const { id } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'ID ist erforderlich' }, { status: 400 });
        }

        // First, unlink any templates using this preset
        await query('UPDATE auto_message_templates SET branding_preset_id = NULL WHERE branding_preset_id = $1', [id]);

        const result = await queryOne<{ id: string }>(
            'DELETE FROM branding_presets WHERE id = $1 AND org_id = $2 RETURNING id',
            [id, payload.orgId]
        );

        if (!result) {
            return NextResponse.json({ error: 'Preset nicht gefunden' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete branding preset error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error' },
            { status: 500 }
        );
    }
}
