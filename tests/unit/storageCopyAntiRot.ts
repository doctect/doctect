export type LocalStorageContext =
  | 'legacy-read-only-migration-recovery'
  | 'non-document-preference'
  | 'sandbox-denial';

const mentionsLocalStorage = (statement: string): boolean => /\blocalStorage\b/i.test(statement);

export const classifyLocalStorageContext = (statement: string): LocalStorageContext | null => {
  if (!mentionsLocalStorage(statement)) return null;

  const legacyReadOnlyMigrationRecovery = /\blegacy\b/i.test(statement)
    && /\bread[- ]only\b/i.test(statement)
    && /\b(?:migrat(?:e[sd]?|ing|ion)|recover(?:y|ies|ed|ing))\b/i.test(statement);
  if (legacyReadOnlyMigrationRecovery) return 'legacy-read-only-migration-recovery';

  const nonDocumentPreference = /\bnon[- ]document\b/i.test(statement)
    && /\b(?:preferences?|profiles?|flags?)\b/i.test(statement);
  if (nonDocumentPreference) return 'non-document-preference';

  const sandboxDenial = /\bsandbox(?:ed)?\b/i.test(statement)
    && (/\b(?:den(?:y|ies|ied|ial)|block(?:s|ed|ing)?|unavailable|undefined)\b/i.test(statement)
      || /\b(?:not|never)\s+(?:available|exposed)\b/i.test(statement)
      || /\bno\s+(?:access|storage)\b/i.test(statement));
  if (sandboxDenial) return 'sandbox-denial';

  return null;
};

export const localStorageStatements = (body: string): string[] => body
  .split(/(?<=[.!?])\s+|\n+/)
  .map(statement => statement.trim())
  .filter(statement => mentionsLocalStorage(statement));
