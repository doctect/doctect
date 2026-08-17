import fs from 'node:fs';
import path from 'node:path';

export type LocalStorageContext =
  | 'legacy-read-only-migration-recovery'
  | 'non-document-preference'
  | 'sandbox-denial';

const markdownPathsUnder = (rootDir: string, relativeDirectory: string): string[] => {
  const paths: string[] = [];
  for (const entry of fs.readdirSync(path.join(rootDir, relativeDirectory), { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      if (entry.name.endsWith('.md')) {
        throw new Error(`Markdown symlink is not allowed: ${relativePath}`);
      }
    } else if (entry.isDirectory()) {
      if (relativePath !== 'docs/superpowers') {
        paths.push(...markdownPathsUnder(rootDir, relativePath));
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      paths.push(relativePath);
    }
  }
  return paths.sort();
};

export const discoverMaintainedMarkdownPaths = (rootDir: string): string[] => {
  const topLevelPaths = ['README.md', 'PRODUCT.md'];
  for (const relativePath of topLevelPaths) {
    if (fs.lstatSync(path.join(rootDir, relativePath)).isSymbolicLink()) {
      throw new Error(`Markdown symlink is not allowed: ${relativePath}`);
    }
  }
  return [
    ...topLevelPaths,
    ...markdownPathsUnder(rootDir, 'docs'),
    ...markdownPathsUnder(rootDir, 'docs-content'),
  ].sort();
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const legacyDocumentKeySource = [
  ['hype', 'projects'].join('_'),
  ['hype', 'active', 'project'].join('_'),
  ['hype', 'custom', 'presets'].join('_'),
  ['hype', 'import', 'pending'].join('_'),
]
  .map(key => `\\b${escapeRegExp(key)}\\b`)
  .join('|');
const storageMentionSource = [
  String.raw`\blocal\s*storage\b`,
  String.raw`\bbrowser(?:['’]s)?\s+storage\b`,
  String.raw`\bweb\s+storage\b`,
  legacyDocumentKeySource,
].join('|');
const storageMention = new RegExp(`(?:${storageMentionSource})`, 'i');
const legacyDocumentKeyMention = new RegExp(`(?:${legacyDocumentKeySource})`, 'i');

const activeDocumentEntitySource = String.raw`\b(?:projects?|documents?|presets?)\b`;
const activeStorageActionSource = String.raw`\b(?:lives?|persist(?:s|ed|ing)?|stor(?:e[sd]?|ing)|sav(?:e[sd]?|ing)|writ(?:e[sd]?|ing|ten)|holds?|keeps?|kept|contains?|uses?|remov(?:e[sd]?|ing)|delet(?:e[sd]?|ing))\b`;
const activeStorageAuthoritySource = String.raw`\b(?:authority|source of truth|system of record|home|backing store)\b`;
const groupedStorageMentionSource = `(?:${storageMentionSource})`;
const activeStorageRelation = [
  `${groupedStorageMentionSource}[^.!?]{0,120}${activeStorageActionSource}[^.!?]{0,80}${activeDocumentEntitySource}`,
  `${groupedStorageMentionSource}[^.!?]{0,80}${activeDocumentEntitySource}[^.!?]{0,80}${activeStorageActionSource}`,
  `${activeStorageActionSource}[^.!?]{0,80}${activeDocumentEntitySource}[^.!?]{0,120}${groupedStorageMentionSource}`,
  `${activeDocumentEntitySource}[^.!?]{0,80}${activeStorageActionSource}[^.!?]{0,120}${groupedStorageMentionSource}`,
].map(source => new RegExp(source, 'i'));
const activeStorageAuthority = new RegExp(
  `(?=.*(?:${storageMentionSource}))(?=.*${activeDocumentEntitySource})(?=.*${activeStorageAuthoritySource})`,
  'i',
);
const storageNamedDocument = new RegExp(
  `${groupedStorageMentionSource}[^.!?]{0,20}\\b(?:projects?|presets?)\\b`,
  'i',
);
const anaphoricActiveStorage = [
  `(?:${activeStorageActionSource}[^.!?]{0,80}${activeDocumentEntitySource}`
    + `|${activeDocumentEntitySource}[^.!?]{0,80}${activeStorageActionSource})[^.!?]{0,40}\\bthere\\b`,
  `\\b(?:it|this storage|that storage)\\b[^.!?]{0,80}(?:${activeStorageActionSource}[^.!?]{0,80}${activeDocumentEntitySource}`
    + `|${activeDocumentEntitySource}[^.!?]{0,40}${activeStorageAuthoritySource})`,
  `${activeDocumentEntitySource}[^.!?]{0,80}${activeStorageActionSource}[^.!?]{0,40}\\bit\\b`,
].map(source => new RegExp(source, 'i'));

const claimsActiveDocumentStorage = (statement: string): boolean => {
  const plain = statement
    .replace(/[`*]/g, '')
    .replace(/\bnon[- ]documents?\b/gi, '')
    .replace(
      /\b(?:never|not)\s+(?:stor(?:e[sd]?|ing)|sav(?:e[sd]?|ing)|writ(?:e[sd]?|ing|ten)|persist(?:s|ed|ing)?|kept|removed?|deleted?)\b/gi,
      '',
    );
  const clauses = plain.split(/\s*(?:;|,\s+(?:and|but|while|whereas)\s+)\s*/i);
  return clauses.some(clause => storageMention.test(clause)
      && (activeStorageRelation.some(pattern => pattern.test(clause))
        || activeStorageAuthority.test(clause)
        || storageNamedDocument.test(clause)
        || /\beditor\b[^.!?]{0,80}\bruns?\s+against\b[^.!?]{0,80}\bdocuments?\b/i.test(clause)))
    || (storageMention.test(plain)
      && clauses.some(clause => anaphoricActiveStorage.some(pattern => pattern.test(clause))));
};

const mentionsLocalStorage = (statement: string): boolean => storageMention.test(statement);

export const classifyLocalStorageContext = (statement: string): LocalStorageContext | null => {
  if (!mentionsLocalStorage(statement)) return null;
  if (claimsActiveDocumentStorage(statement)) return null;

  const legacyReadOnlyMigrationRecovery = (/\blegacy\b/i.test(statement)
      || legacyDocumentKeyMention.test(statement))
    && (/\bread[- ]only\b/i.test(statement)
      || /\bnever\s+(?:written|writes?|stored|saved|persisted)\b/i.test(statement))
    && /\b(?:migrat(?:e[sd]?|ing|ion)|recover(?:y|ies|ed|ing))\b/i.test(statement);
  if (legacyReadOnlyMigrationRecovery) return 'legacy-read-only-migration-recovery';

  const nonDocumentPreference = (/\bnon[- ]document\b/i.test(statement)
      && /\b(?:preferences?|profiles?|flags?)\b/i.test(statement))
    || /\bonboarding[- ]profile\s+preferences?\b/i.test(statement)
    || /\bonboarding\s+profile\s+preferences?\b/i.test(statement);
  if (nonDocumentPreference) return 'non-document-preference';

  const sandboxDenial = /\bsandbox(?:ed)?\b/i.test(statement)
    && (/\b(?:den(?:y|ies|ied|ial)|block(?:s|ed|ing)?|unavailable|undefined)\b/i.test(statement)
      || /\bblank(?:s|ed|ing)?(?:\s+out)?\b/i.test(statement)
      || /\b(?:not|never)\s+(?:available|exposed)\b/i.test(statement)
      || /\bno\s+(?:access|storage)\b/i.test(statement));
  if (sandboxDenial) return 'sandbox-denial';

  return null;
};

export const localStorageStatements = (body: string): string[] => body
  .split(/(?<=[.!?])\s+|\n+/)
  .map(statement => statement.trim())
  .filter(statement => mentionsLocalStorage(statement));
