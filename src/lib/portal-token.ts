import crypto from 'crypto';
import { queryOne } from './db';

// Postgres error codes
const NO_MATCHING_CONFLICT_TARGET = '42P10'; // ON CONFLICT without matching unique index
const UNIQUE_VIOLATION = '23505';

function errorCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e
    ? String((e as { code: unknown }).code)
    : undefined;
}

async function selectActiveToken(teamMemberId: string): Promise<string | null> {
  const row = await queryOne<{ token: string }>(
    'SELECT token FROM team_member_tokens WHERE team_member_id = $1 AND is_active = true',
    [teamMemberId]
  );
  return row?.token || null;
}

/**
 * Get the active portal token for a team member, creating one if needed.
 *
 * The INSERT uses ON CONFLICT against the partial unique index
 * idx_team_member_tokens_active_unique to survive concurrent calls. Databases
 * that have not run the migration yet do not have that index, so we fall back
 * to a plain INSERT instead of failing - a missing index must never cost a
 * team member their portal link.
 *
 * Returns null only if the token could not be read or written at all.
 */
export async function getOrCreatePortalToken(
  teamMemberId: string,
  orgId: string
): Promise<string | null> {
  try {
    const existing = await selectActiveToken(teamMemberId);
    if (existing) return existing;

    const token = crypto.randomBytes(32).toString('hex');

    try {
      const result = await queryOne<{ token: string }>(
        `INSERT INTO team_member_tokens (team_member_id, org_id, token, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (team_member_id) WHERE is_active = true
         DO UPDATE SET team_member_id = team_member_tokens.team_member_id
         RETURNING token`,
        [teamMemberId, orgId, token]
      );
      if (result?.token) return result.token;
    } catch (e) {
      if (errorCode(e) !== NO_MATCHING_CONFLICT_TARGET) throw e;

      // Index missing (migration not run yet) - insert without conflict target
      console.warn(
        'team_member_tokens: idx_team_member_tokens_active_unique missing, ' +
        'inserting without ON CONFLICT. Run /api/migrate to restore it.'
      );
      const result = await queryOne<{ token: string }>(
        `INSERT INTO team_member_tokens (team_member_id, org_id, token, is_active)
         VALUES ($1, $2, $3, true)
         RETURNING token`,
        [teamMemberId, orgId, token]
      );
      if (result?.token) return result.token;
    }

    return token;
  } catch (e) {
    // A concurrent request may have inserted in the meantime
    if (errorCode(e) === UNIQUE_VIOLATION) {
      try {
        const concurrent = await selectActiveToken(teamMemberId);
        if (concurrent) return concurrent;
      } catch { /* fall through to the error below */ }
    }
    console.error('Failed to get/create portal token:', e);
    return null;
  }
}
