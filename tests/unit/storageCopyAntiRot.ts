import fs from 'node:fs';
import path from 'node:path';

export type LocalStorageContext =
  | 'legacy-read-only-migration-recovery'
  | 'non-document-preference'
  | 'sandbox-denial';

const markdownPathsUnder = (rootDir: string, relativeDirectory: string): string[] => {
  if (fs.lstatSync(path.join(rootDir, relativeDirectory)).isSymbolicLink()) {
    throw new Error(`Markdown symlink is not allowed: ${relativeDirectory}`);
  }
  const paths: string[] = [];
  for (const entry of fs.readdirSync(path.join(rootDir, relativeDirectory), { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Markdown symlink is not allowed: ${relativePath}`);
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
  if (fs.lstatSync(rootDir).isSymbolicLink()) {
    throw new Error('Symlink is not allowed for maintained root: .');
  }
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

const activeDocumentEntitySource = String.raw`\b(?:projects?|documents?|presets?|workspaces?|designs?|(?:editor|app(?:lication)?)[- ]state)\b`;
const activeStorageActionSource = String.raw`\b(?:stor(?:e[sd]?|ing)|sav(?:e[sd]?|ing)|persist(?:s|ed|ing)?|writ(?:e[sd]?|ing|ten)|wrote|read(?:s|ing)?|liv(?:e[sd]?|ing)|resid(?:e[sd]?|ing)|keep(?:s|ing)?|kept|hold(?:s|ing)?|held|contain(?:s|ed|ing)?|back(?:s|ed|ing)?|us(?:e[sd]?|ing)|remov(?:e[sd]?|ing)|delet(?:e[sd]?|ing))\b`;
const activeStorageAuthoritySource = String.raw`\b(?:authority|source(?:\s+|-)of(?:\s+|-)truth|system(?:\s+|-)of(?:\s+|-)record|home|backing store)\b`;
const activeStorageAuthorityVerbSource = String.raw`\b(?:remain(?:s|ed|ing)?|is|are|was|were|be(?:en|ing)?|act(?:s|ed|ing)?(?:\s+as)?)\b`;
const storageAnaphorSource = String.raw`\b(?:it|they|them|there|(?:this|that)\s+storage|(?:these|those)\s+keys)\b`;
const groupedStorageMentionSource = `(?:${storageMentionSource})`;
const activeDocumentEntity = new RegExp(activeDocumentEntitySource, 'i');
const activeStorageAction = new RegExp(activeStorageActionSource, 'i');
const activeStorageAuthority = new RegExp(activeStorageAuthoritySource, 'i');
const activeStorageAuthorityVerb = new RegExp(activeStorageAuthorityVerbSource, 'i');
const storageAnaphor = new RegExp(storageAnaphorSource, 'i');
const storageNamedDocument = new RegExp(
  `${groupedStorageMentionSource}[^.!?]{0,20}\\b(?:projects?|presets?)\\b`,
  'i',
);
const editorRunsAgainstDocuments = new RegExp(
  `\\beditor\\b[^.!?;]{0,80}\\bruns?\\s+against\\b[^.!?;]{0,80}${activeDocumentEntitySource}`,
  'i',
);

const sentencesOf = (body: string): string[] => body
  .split(/(?<=[.!?])\s+|\n+/)
  .map(sentence => sentence.trim())
  .filter(Boolean);
const clausesOf = (sentence: string): string[] => sentence
  .split(/\s*(?:;|,\s+(?:and|but|while|whereas|yet)\s+|\s+(?:but|while|whereas|yet)\s+)\s*/i)
  .map(clause => clause.trim())
  .filter(Boolean);
const plainStorageClause = (clause: string): string => clause
  .replace(/[`*]/g, '')
  .replace(/\bnon[- ]documents?\b/gi, '')
  .replace(/\bread[- ]only\b/gi, '')
  .replace(
    new RegExp(`\\b(?:never|not|no\\s+longer)\\s+(?:${activeStorageActionSource})`, 'gi'),
    '',
  );

const claimsStorageRelation = (clause: string, reference: RegExp): boolean =>
  reference.test(clause)
  && activeDocumentEntity.test(clause)
  && activeStorageAction.test(clause);
const claimsStorageAuthority = (clause: string, reference: RegExp): boolean =>
  reference.test(clause)
  && activeDocumentEntity.test(clause)
  && activeStorageAuthorityVerb.test(clause)
  && activeStorageAuthority.test(clause);

const claimsDirectActiveStorage = (clause: string): boolean =>
  claimsStorageRelation(clause, storageMention)
  || claimsStorageAuthority(clause, storageMention)
  || storageNamedDocument.test(clause)
  || editorRunsAgainstDocuments.test(clause);

const claimsAnaphoricActiveStorage = (clause: string): boolean =>
  claimsStorageRelation(clause, storageAnaphor)
  || claimsStorageAuthority(clause, storageAnaphor);

// Scope pronouns to an explicit storage clause or its immediately adjacent sentence.
const claimsActiveDocumentStorage = (statement: string): boolean => {
  let previousSentenceNamesStorage = false;
  for (const sentence of sentencesOf(statement)) {
    const clauses = clausesOf(sentence).map(plainStorageClause);
    const sentenceNamesStorage = clauses.some(clause => storageMention.test(clause));
    let hasStorageAntecedent = previousSentenceNamesStorage;
    for (const clause of clauses) {
      const namesStorage = storageMention.test(clause);
      const usesStorageAnaphor = storageAnaphor.test(clause);
      if (namesStorage && claimsDirectActiveStorage(clause)) return true;
      if (!namesStorage && hasStorageAntecedent && usesStorageAnaphor
        && claimsAnaphoricActiveStorage(clause)) return true;
      hasStorageAntecedent = namesStorage || (hasStorageAntecedent && usesStorageAnaphor);
    }
    previousSentenceNamesStorage = sentenceNamesStorage;
  }
  return false;
};

const mentionsLocalStorage = (statement: string): boolean => storageMention.test(statement);

export const classifyLocalStorageContext = (statement: string): LocalStorageContext | null => {
  if (!mentionsLocalStorage(statement)) return null;
  if (claimsActiveDocumentStorage(statement)) return null;

  const legacyReadOnlyMigrationRecovery = (/\b(?:legacy|old)\b/i.test(statement)
      || legacyDocumentKeyMention.test(statement))
    && (/\bread[- ]only\b/i.test(statement)
      || /\bnever\s+(?:written|writes?|stored|saved|persisted)\b/i.test(statement)
      || /\bconsult(?:s|ed|ing)?\s+only\b/i.test(statement))
    && /\b(?:migrat(?:e[sd]?|ing|ion)|recover(?:y|ies|ed|ing))\b/i.test(statement);
  if (legacyReadOnlyMigrationRecovery) return 'legacy-read-only-migration-recovery';

  const nonDocumentPreference = (/\bnon[- ]document\b/i.test(statement)
      && /\b(?:preferences?|profiles?|flags?)\b/i.test(statement))
    || /\bonboarding[- ]profile\s+preferences?\b/i.test(statement)
    || /\bonboarding\s+profile\s+preferences?\b/i.test(statement)
    || /\bretains?\s+onboarding\s+flags?\s+only\b/i.test(statement);
  if (nonDocumentPreference) return 'non-document-preference';

  const sandboxDenial = /\b(?:sandbox(?:ed)?|isolated\s+(?:web\s+)?worker)\b/i.test(statement)
    && (/\b(?:den(?:y|ies|ied|ial)|block(?:s|ed|ing)?|disable(?:s|d|ing)?|unavailable|undefined)\b/i.test(statement)
      || /\bblank(?:s|ed|ing)?(?:\s+out)?\b/i.test(statement)
      || /\b(?:not|never)\s+(?:available|exposed)\b/i.test(statement)
      || /\bno\s+(?:access|storage)\b/i.test(statement));
  if (sandboxDenial) return 'sandbox-denial';

  return null;
};

export const localStorageStatements = (body: string): string[] => {
  const sentences = sentencesOf(body);
  return sentences.flatMap((sentence, index) => {
    if (!mentionsLocalStorage(sentence)) return [];
    const nextSentence = sentences[index + 1];
    if (nextSentence && !mentionsLocalStorage(nextSentence)
      && clausesOf(plainStorageClause(nextSentence)).some(claimsAnaphoricActiveStorage)) {
      return [`${sentence} ${nextSentence}`];
    }
    return [sentence];
  });
};
