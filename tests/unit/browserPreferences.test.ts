import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markMigrationReceiptSeen,
  readBrowserPreference,
  wasMigrationReceiptSeen,
  writeBrowserPreference,
  type BrowserPreferenceKey,
} from '../../services/browserPreferences';

const browserWindow = window;
const localStorageDescriptor = Object.getOwnPropertyDescriptor(browserWindow, 'localStorage')!;

const fixedPreferenceKeys = [
  'doctect_last_fontSize',
  'doctect_last_fontFamily',
  'doctect_last_fontWeight',
  'doctect_last_fontStyle',
  'doctect_last_textDecoration',
  'doctect_last_textColor',
  'doctect_last_align',
  'gallery-explainer-dismissed',
  'doctect-onboarding',
] as const satisfies readonly BrowserPreferenceKey[];

const rejectedRuntimeKeys = [
  ['hype', 'projects'].join('_'),
  ['hype', 'active', 'project'].join('_'),
  ['hype', 'custom', 'presets'].join('_'),
  ['hype', 'import', 'pending'].join('_'),
  'arbitrary-preference',
];

const replaceLocalStorage = (storage: Partial<Storage>): void => {
  Object.defineProperty(browserWindow, 'localStorage', {
    configurable: true,
    value: storage,
  });
};

beforeEach(() => {
  browserWindow.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(browserWindow, 'localStorage', localStorageDescriptor);
  browserWindow.localStorage.clear();
});

describe('browser preference storage', () => {
  it.each(fixedPreferenceKeys)('round-trips approved key %s', key => {
    expect(writeBrowserPreference(key, `value:${key}`)).toBe(true);
    expect(readBrowserPreference(key)).toBe(`value:${key}`);
  });

  it.each(rejectedRuntimeKeys)('rejects runtime key %s before obtaining localStorage', key => {
    const storageGetter = vi.fn(() => {
      throw new Error('localStorage must not be reached');
    });
    Object.defineProperty(browserWindow, 'localStorage', {
      configurable: true,
      get: storageGetter,
    });
    const read = readBrowserPreference as (runtimeKey: string) => string | null;
    const write = writeBrowserPreference as (runtimeKey: string, value: string) => boolean;

    expect(read(key)).toBeNull();
    expect(write(key, 'value')).toBe(false);
    expect(storageGetter).not.toHaveBeenCalled();
  });

  it('uses the dedicated receipt prefix and exact seen marker', () => {
    const getItem = vi.fn(() => '1');
    const setItem = vi.fn();
    replaceLocalStorage({ getItem, setItem });

    expect(wasMigrationReceiptSeen('receipt-42')).toBe(true);
    expect(markMigrationReceiptSeen('receipt-42')).toBe(true);
    expect(getItem).toHaveBeenCalledWith(
      'doctect_workspace_migration_receipt_seen:receipt-42',
    );
    expect(setItem).toHaveBeenCalledWith(
      'doctect_workspace_migration_receipt_seen:receipt-42',
      '1',
    );
  });

  it('keeps receipt keys behind the dedicated helpers', () => {
    const getItem = vi.fn();
    const setItem = vi.fn();
    replaceLocalStorage({ getItem, setItem });
    const receiptKey = 'doctect_workspace_migration_receipt_seen:receipt-42';
    const read = readBrowserPreference as (runtimeKey: string) => string | null;
    const write = writeBrowserPreference as (runtimeKey: string, value: string) => boolean;

    expect(read(receiptKey)).toBeNull();
    expect(write(receiptKey, '1')).toBe(false);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('treats any receipt value other than 1 as unseen', () => {
    replaceLocalStorage({ getItem: () => 'true' });

    expect(wasMigrationReceiptSeen('receipt-42')).toBe(false);
  });

  it('returns safe results when window is unavailable', () => {
    vi.stubGlobal('window', undefined);

    expect(readBrowserPreference('doctect_last_fontSize')).toBeNull();
    expect(writeBrowserPreference('doctect_last_fontSize', '16')).toBe(false);
    expect(wasMigrationReceiptSeen('receipt-42')).toBe(false);
    expect(markMigrationReceiptSeen('receipt-42')).toBe(false);
  });

  it('returns safe results when localStorage is unavailable', () => {
    replaceLocalStorage(undefined as unknown as Storage);

    expect(readBrowserPreference('doctect_last_fontSize')).toBeNull();
    expect(writeBrowserPreference('doctect_last_fontSize', '16')).toBe(false);
  });

  it('returns safe results when obtaining localStorage throws', () => {
    Object.defineProperty(browserWindow, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    expect(readBrowserPreference('doctect_last_fontSize')).toBeNull();
    expect(writeBrowserPreference('doctect_last_fontSize', '16')).toBe(false);
    expect(wasMigrationReceiptSeen('receipt-42')).toBe(false);
    expect(markMigrationReceiptSeen('receipt-42')).toBe(false);
  });

  it('returns safe results when storage methods throw', () => {
    replaceLocalStorage({
      getItem() {
        throw new Error('blocked read');
      },
      setItem() {
        throw new Error('blocked write');
      },
    });

    expect(readBrowserPreference('doctect_last_fontSize')).toBeNull();
    expect(writeBrowserPreference('doctect_last_fontSize', '16')).toBe(false);
    expect(wasMigrationReceiptSeen('receipt-42')).toBe(false);
    expect(markMigrationReceiptSeen('receipt-42')).toBe(false);
  });
});
