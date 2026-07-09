import { describe, it, expect } from 'vitest';
import { validatePassword, MIN_PASSWORD_LENGTH } from '../../../shared/passwordPolicy.js';

describe('validatePassword', () => {
    it('exports MIN_PASSWORD_LENGTH = 12', () => {
        expect(MIN_PASSWORD_LENGTH).toBe(12);
    });

    it('rejects 11 chars even with all four classes', () => {
        const r = validatePassword('Aa1!Aa1!Aa1'); // 11 chars
        expect(r.ok).toBe(false);
        expect(r.message).toBe('Password must be at least 12 characters');
    });

    it('accepts exactly 12 chars with 3 classes (lower+upper+digit)', () => {
        expect(validatePassword('Aa1Aa1Aa1Aa1')).toEqual({ ok: true });
    });

    it('rejects 12+ chars with only 2 classes (lower+digit)', () => {
        const r = validatePassword('password1234');
        expect(r.ok).toBe(false);
        expect(r.message).toBe('Password must use at least 3 of: lowercase, uppercase, digits, symbols');
    });

    it('accepts lower+digit+symbol (no uppercase)', () => {
        expect(validatePassword('password-1234')).toEqual({ ok: true });
    });

    it('accepts all four classes', () => {
        expect(validatePassword('Password-1234!')).toEqual({ ok: true });
    });

    it('counts unicode letters as letters, never rejects for containing unicode', () => {
        // ñ = lowercase letter, Ü = uppercase letter, plus digit => 3 classes
        expect(validatePassword('ñÜ1ñÜ1ñÜ1ñÜ1')).toEqual({ ok: true });
    });

    it('does not count whitespace as a symbol', () => {
        // lower + digit + spaces only => still 2 classes
        const r = validatePassword('password 1234');
        expect(r.ok).toBe(false);
    });

    it('rejects non-string input with the length message', () => {
        expect(validatePassword(undefined).ok).toBe(false);
        expect(validatePassword(null).ok).toBe(false);
    });
});
