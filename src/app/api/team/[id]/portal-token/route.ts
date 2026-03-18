import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import crypto from 'crypto';

// Helper to get app URL from settings, env, or request
async function getAppUrl(request: NextRequest): Promise<string> {
    // 1. Try system_settings
    try {
        const setting = await queryOne<{ value: string }>(
            "SELECT value FROM system_settings WHERE key = 'app_url'"
        );
        if (setting?.value) return setting.value;
    } catch {
        // table might not exist yet
    }

    // 2. Try env variable
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL;
    }

    // 3. Use request origin as fallback
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host') || 'localhost:3000';
    return `${protocol}://${host}`;
}

// GET - Get existing portal token for team member
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

        // Verify team member belongs to organization
        const member = await queryOne<{ id: string; org_id: string }>(
            'SELECT id, org_id FROM team_members WHERE id = $1',
            [memberId]
        );

        if (!member || member.org_id !== payload.orgId) {
            return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
        }

        // Get existing token
        const existingToken = await queryOne<{ token: string }>(
            'SELECT token FROM team_member_tokens WHERE team_member_id = $1 AND is_active = true',
            [memberId]
        );

        if (!existingToken) {
            return NextResponse.json({ error: 'No portal token exists' }, { status: 404 });
        }

        const appUrl = await getAppUrl(request);
        const portalUrl = `${appUrl}/portal/${existingToken.token}`;

        return NextResponse.json({ portalUrl });
    } catch (error) {
        console.error('Get portal token error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error' },
            { status: 500 }
        );
    }
}

// POST - Generate new portal token for team member
export async function POST(
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

        // Verify team member belongs to organization
        const member = await queryOne<{ id: string; org_id: string }>(
            'SELECT id, org_id FROM team_members WHERE id = $1',
            [memberId]
        );

        if (!member || member.org_id !== payload.orgId) {
            return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
        }

        // Check for existing active token
        const existingToken = await queryOne<{ token: string }>(
            'SELECT token FROM team_member_tokens WHERE team_member_id = $1 AND is_active = true',
            [memberId]
        );

        if (existingToken) {
            const appUrl = await getAppUrl(request);
            const portalUrl = `${appUrl}/portal/${existingToken.token}`;
            return NextResponse.json({ portalUrl, existing: true });
        }

        // Generate new token using ON CONFLICT to handle race conditions
        const newToken = crypto.randomBytes(32).toString('hex');

        const inserted = await queryOne<{ token: string }>(
            `INSERT INTO team_member_tokens (team_member_id, org_id, token, is_active)
             VALUES ($1, $2, $3, true)
             ON CONFLICT (team_member_id) WHERE is_active = true
             DO UPDATE SET team_member_id = team_member_tokens.team_member_id
             RETURNING token`,
            [memberId, payload.orgId, newToken]
        );

        const finalToken = inserted?.token || newToken;
        const appUrl = await getAppUrl(request);
        const portalUrl = `${appUrl}/portal/${finalToken}`;

        return NextResponse.json({ portalUrl, created: true });
    } catch (error) {
        console.error('Generate portal token error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error' },
            { status: 500 }
        );
    }
}

// DELETE - Revoke portal token for team member
export async function DELETE(
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

        // Verify team member belongs to organization
        const member = await queryOne<{ id: string; org_id: string }>(
            'SELECT id, org_id FROM team_members WHERE id = $1',
            [memberId]
        );

        if (!member || member.org_id !== payload.orgId) {
            return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
        }

        // Deactivate all tokens for this member
        await query(
            'UPDATE team_member_tokens SET is_active = false WHERE team_member_id = $1',
            [memberId]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Revoke portal token error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error' },
            { status: 500 }
        );
    }
}
