import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const payload = token ? verifyToken(token) : null;

        if (!payload?.isSuperAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { status, adminEmail } = body;

        // Update status if provided
        if (status) {
            const validStatuses = ['active', 'inactive', 'pending_approval', 'trial'];
            if (!validStatuses.includes(status)) {
                return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
            }

            await query(
                'UPDATE organizations SET subscription_status = $1, updated_at = NOW() WHERE id = $2',
                [status, id]
            );
        }

        // Update admin email if provided
        if (adminEmail) {
            // Find the admin user (first user created for this org)
            const adminUser = await queryOne<{ id: string }>(
                'SELECT id FROM users WHERE org_id = $1 ORDER BY created_at ASC LIMIT 1',
                [id]
            );

            if (adminUser) {
                // Check if email is already used by another user
                const existingUser = await queryOne<{ id: string }>(
                    'SELECT id FROM users WHERE email = $1 AND id != $2',
                    [adminEmail, adminUser.id]
                );

                if (existingUser) {
                    return NextResponse.json({ error: 'E-Mail bereits vergeben' }, { status: 400 });
                }

                await query(
                    'UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2',
                    [adminEmail, adminUser.id]
                );
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Admin Org Update Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
