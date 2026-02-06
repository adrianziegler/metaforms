import { query, queryOne } from './db';

interface FormAlias {
    form_id: string;
    display_name: string;
}

/**
 * Get the display name for a form.
 * Returns the custom alias if set, otherwise returns the original form name.
 */
export async function getFormDisplayName(
    orgId: string,
    formId: string | null,
    originalName: string | null
): Promise<string | null> {
    if (!formId) return originalName;

    try {
        const alias = await queryOne<FormAlias>(
            `SELECT form_id, display_name FROM form_aliases WHERE org_id = $1 AND form_id = $2`,
            [orgId, formId]
        );

        if (alias?.display_name) {
            return alias.display_name;
        }
    } catch {
        // Table may not exist yet, return original name
    }

    return originalName;
}

/**
 * Get all form aliases for an organization as a Map for efficient lookup.
 */
export async function getFormAliasMap(orgId: string): Promise<Map<string, string>> {
    const aliasMap = new Map<string, string>();

    try {
        const aliases = await query<FormAlias>(
            `SELECT form_id, display_name FROM form_aliases WHERE org_id = $1`,
            [orgId]
        );

        for (const row of aliases) {
            aliasMap.set(row.form_id, row.display_name);
        }
    } catch {
        // Table may not exist yet
    }

    return aliasMap;
}

/**
 * Apply form aliases to an array of items that have form_id and form_name properties.
 * Modifies the items in place, replacing form_name with the alias if available.
 */
export async function applyFormAliases<T extends { form_id?: string | null; form_name?: string | null }>(
    orgId: string,
    items: T[]
): Promise<T[]> {
    const aliasMap = await getFormAliasMap(orgId);

    for (const item of items) {
        if (item.form_id && aliasMap.has(item.form_id)) {
            item.form_name = aliasMap.get(item.form_id) || item.form_name;
        }
    }

    return items;
}
