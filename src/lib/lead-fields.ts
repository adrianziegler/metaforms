/**
 * Meta lead form field mapping.
 *
 * Meta delivers the field names exactly as the form author typed them, lowercased
 * and with spaces turned into underscores - a German form yields keys like
 * "vollständiger_name", "e-mail-adresse" or "telefonnummer". Matching those with a
 * hand-written list of literal spellings breaks as soon as a form uses a slightly
 * different label, so every lookup here goes through normalizeFieldKey() which
 * strips separators and folds umlauts.
 */

const UMLAUTS: Record<string, string> = {
  'ä': 'a', 'ö': 'o', 'ü': 'u', 'ß': 'ss', 'é': 'e', 'è': 'e', 'ê': 'e', 'á': 'a', 'à': 'a',
};

/** "Vollständiger Name", "vollständiger_name" and "vollstaendiger-name" all become "vollstandigername". */
export function normalizeFieldKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[äöüßéèêáà]/g, (c) => UMLAUTS[c] || c)
    .replace(/[^a-z0-9]/g, '');
}

const FULL_NAME_KEYS = [
  'full_name', 'name', 'vollständiger name', 'vollstaendiger name', 'kompletter name',
  'vor und nachname', 'vor- und nachname', 'ihr name', 'dein name',
];
const FIRST_NAME_KEYS = ['first_name', 'vorname', 'given_name'];
const LAST_NAME_KEYS = ['last_name', 'nachname', 'familienname', 'surname', 'family_name'];
const EMAIL_KEYS = ['email', 'e-mail', 'e-mail-adresse', 'email adresse', 'mail', 'emailadresse'];
const PHONE_KEYS = [
  'phone_number', 'phone', 'telefonnummer', 'telefon', 'handy', 'handynummer',
  'mobil', 'mobilnummer', 'tel', 'rufnummer',
];

/** Field names that carry no answer of their own and must never be shown as an extra form field. */
const STANDARD_KEYS = new Set(
  [...FULL_NAME_KEYS, ...FIRST_NAME_KEYS, ...LAST_NAME_KEYS, ...EMAIL_KEYS, ...PHONE_KEYS]
    .map(normalizeFieldKey)
);

export function isStandardLeadField(key: string): boolean {
  return STANDARD_KEYS.has(normalizeFieldKey(key));
}

function lookup(fieldMap: Record<string, string>, candidates: string[]): string | null {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(fieldMap)) {
    const norm = normalizeFieldKey(key);
    if (!normalized.has(norm) && value != null && String(value).trim() !== '') {
      normalized.set(norm, String(value).trim());
    }
  }

  for (const candidate of candidates) {
    const hit = normalized.get(normalizeFieldKey(candidate));
    if (hit) return hit;
  }
  return null;
}

/** Last resort for the name: any field whose key mentions "name" but isn't a company or form name. */
function fuzzyFullName(fieldMap: Record<string, string>): string | null {
  const excluded = ['firma', 'company', 'unternehmen', 'form', 'benutzer', 'user', 'produkt'];
  for (const [key, value] of Object.entries(fieldMap)) {
    const norm = normalizeFieldKey(key);
    if (!norm.includes('name')) continue;
    if (excluded.some((e) => norm.includes(e))) continue;
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return null;
}

export interface StandardLeadFields {
  fullName: string | null;
  email: string | null;
  phone: string | null;
}

export function extractLeadFields(fieldMap: Record<string, string>): StandardLeadFields {
  const first = lookup(fieldMap, FIRST_NAME_KEYS);
  const last = lookup(fieldMap, LAST_NAME_KEYS);
  const combined = [first, last].filter(Boolean).join(' ').trim();

  const fullName =
    lookup(fieldMap, FULL_NAME_KEYS) ||
    (combined !== '' ? combined : null) ||
    fuzzyFullName(fieldMap);

  return {
    fullName,
    email: lookup(fieldMap, EMAIL_KEYS),
    phone: lookup(fieldMap, PHONE_KEYS),
  };
}
