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

// GET - List all branding presets for org
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
                `SELECT * FROM branding_presets WHERE org_id = $1 ORDER BY is_default DESC, created_at DESC`,
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
            { error: 'Fehler beim Laden' },
            { status: 500 }
        );
    }
}

// POST - Create new branding preset
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

        // If setting as default, unset other defaults
        if (isDefault) {
            await query(
                'UPDATE branding_presets SET is_default = false WHERE org_id = $1',
                [payload.orgId]
            );
        }

        const preset = await queryOne<BrandingPreset>(
            `INSERT INTO branding_presets (org_id, name, logo_url, company_name, primary_color, footer_text, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
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
            { error: 'Fehler beim Erstellen' },
            { status: 500 }
        );
    }
}

// PATCH - Update branding preset
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

        // Verify ownership
        const existing = await queryOne<{ id: string }>(
            'SELECT id FROM branding_presets WHERE id = $1 AND org_id = $2',
            [id, payload.orgId]
        );

        if (!existing) {
            return NextResponse.json({ error: 'Preset nicht gefunden' }, { status: 404 });
        }

        // If setting as default, unset other defaults
        if (isDefault) {
            await query(
                'UPDATE branding_presets SET is_default = false WHERE org_id = $1 AND id != $2',
                [payload.orgId, id]
            );
        }

        const preset = await queryOne<BrandingPreset>(
            `UPDATE branding_presets
             SET name = COALESCE($1, name),
                 logo_url = $2,
                 company_name = $3,
                 primary_color = COALESCE($4, primary_color),
                 footer_text = $5,
                 is_default = COALESCE($6, is_default),
                 updated_at = NOW()
             WHERE id = $7 AND org_id = $8
             RETURNING *`,
            [
                name?.trim() || null,
                logoUrl,
                companyName,
                primaryColor,
                footerText,
                isDefault,
                id,
                payload.orgId,
            ]
        );

        return NextResponse.json({ preset });
    } catch (error) {
        console.error('Update branding preset error:', error);
        return NextResponse.json(
            { error: 'Fehler beim Aktualisieren' },
            { status: 500 }
        );
    }
}

// DELETE - Delete branding preset
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
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID ist erforderlich' }, { status: 400 });
        }

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
            { error: 'Fehler beim Löschen' },
            { status: 500 }
        );
    }
}
