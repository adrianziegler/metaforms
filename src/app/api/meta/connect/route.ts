import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { subscribePageToLeadgen } from '@/lib/meta-api';

interface TempOAuthData {
    user_access_token: string;
    pages_json: string;
}

interface PageData {
    id: string;
    name: string;
    access_token: string;
}

// POST - Finalize Meta connection with selected page and pixel
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

        const { sessionId, pageId, pixelId } = await request.json();

        if (!sessionId || !pageId) {
            return NextResponse.json({ error: 'Session ID and Page ID required' }, { status: 400 });
        }

        // Get temporary OAuth data
        const tempData = await queryOne<TempOAuthData>(
            `SELECT user_access_token, pages_json
             FROM meta_oauth_temp
             WHERE id = $1 AND org_id = $2 AND expires_at > NOW()`,
            [sessionId, payload.orgId]
        );

        if (!tempData) {
            return NextResponse.json({ error: 'Session expired or not found' }, { status: 404 });
        }

        const pages: PageData[] = typeof tempData.pages_json === 'string'
            ? JSON.parse(tempData.pages_json)
            : tempData.pages_json;

        const selectedPage = pages.find(p => p.id === pageId);
        if (!selectedPage) {
            return NextResponse.json({ error: 'Page not found in session' }, { status: 404 });
        }

        // Calculate expiration (long-lived tokens last ~60 days)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 60);

        // Save or update connection
        const existing = await queryOne<{ id: string }>(
            'SELECT id FROM meta_connections WHERE org_id = $1',
            [payload.orgId]
        );

        if (existing) {
            await query(
                `UPDATE meta_connections
                 SET access_token = $1, user_id = $2, page_id = $3, page_name = $4,
                     pixel_id = $5, connected_at = NOW(), expires_at = $6
                 WHERE org_id = $7`,
                [selectedPage.access_token, 'admin', selectedPage.id, selectedPage.name, pixelId || null, expiresAt, payload.orgId]
            );
        } else {
            await query(
                `INSERT INTO meta_connections (org_id, access_token, user_id, page_id, page_name, pixel_id, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [payload.orgId, selectedPage.access_token, 'admin', selectedPage.id, selectedPage.name, pixelId || null, expiresAt]
            );
        }

        // Subscribe page to leadgen webhooks
        try {
            await subscribePageToLeadgen(selectedPage.id, selectedPage.access_token);
            console.log('[META-CONNECT] Page subscribed to leadgen:', selectedPage.id);
        } catch (subscribeError) {
            console.error('[META-CONNECT] Failed to subscribe to leadgen:', subscribeError);
            // Don't fail the whole connection, but log the error
        }

        // Clean up temporary OAuth data
        await query(
            'DELETE FROM meta_oauth_temp WHERE org_id = $1',
            [payload.orgId]
        );

        return NextResponse.json({
            success: true,
            page_name: selectedPage.name,
            pixel_id: pixelId || null,
        });
    } catch (error) {
        console.error('Connect error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error' },
            { status: 500 }
        );
    }
}
