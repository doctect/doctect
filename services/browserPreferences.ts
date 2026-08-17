const fixedBrowserPreferenceKeys = [
  'doctect_last_fontSize',
  'doctect_last_fontFamily',
  'doctect_last_fontWeight',
  'doctect_last_fontStyle',
  'doctect_last_textDecoration',
  'doctect_last_textColor',
  'doctect_last_align',
  'gallery-explainer-dismissed',
  'doctect-onboarding',
] as const;

const migrationReceiptPrefix = 'doctect_workspace_migration_receipt_seen:';

type FixedBrowserPreferenceKey = typeof fixedBrowserPreferenceKeys[number];
type MigrationReceiptPreferenceKey = `${typeof migrationReceiptPrefix}${string}`;

export type BrowserPreferenceKey = FixedBrowserPreferenceKey;

type RuntimeBrowserPreferenceKey = BrowserPreferenceKey | MigrationReceiptPreferenceKey;

const fixedBrowserPreferenceKeySet = new Set<string>(fixedBrowserPreferenceKeys);

const isBrowserPreferenceKey = (key: unknown): key is BrowserPreferenceKey => (
  typeof key === 'string'
  && fixedBrowserPreferenceKeySet.has(key)
);

const isRuntimeBrowserPreferenceKey = (key: unknown): key is RuntimeBrowserPreferenceKey => (
  isBrowserPreferenceKey(key)
  || (typeof key === 'string' && key.startsWith(migrationReceiptPrefix))
);

const storageFor = (key: unknown): Storage | null => {
  if (!isRuntimeBrowserPreferenceKey(key)) return null;
  try {
    return typeof window === 'undefined' ? null : window.localStorage ?? null;
  } catch {
    return null;
  }
};

const readRuntimeBrowserPreference = (key: RuntimeBrowserPreferenceKey): string | null => {
  const storage = storageFor(key);
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const writeRuntimeBrowserPreference = (
  key: RuntimeBrowserPreferenceKey,
  value: string,
): boolean => {
  const storage = storageFor(key);
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const readBrowserPreference = (key: BrowserPreferenceKey): string | null => (
  isBrowserPreferenceKey(key) ? readRuntimeBrowserPreference(key) : null
);

export const writeBrowserPreference = (
  key: BrowserPreferenceKey,
  value: string,
): boolean => (
  isBrowserPreferenceKey(key) && writeRuntimeBrowserPreference(key, value)
);

const migrationReceiptKey = (receiptId: string): MigrationReceiptPreferenceKey =>
  `${migrationReceiptPrefix}${receiptId}`;

export const wasMigrationReceiptSeen = (receiptId: string): boolean => (
  typeof receiptId === 'string'
  && readRuntimeBrowserPreference(migrationReceiptKey(receiptId)) === '1'
);

export const markMigrationReceiptSeen = (receiptId: string): boolean => (
  typeof receiptId === 'string'
  && writeRuntimeBrowserPreference(migrationReceiptKey(receiptId), '1')
);
