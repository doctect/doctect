// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    assertOwnerConfiguration,
    canModerateRole,
    effectiveRole,
    getOwnerEmails,
    isConfiguredOwner,
    normalizeEmail,
    parseOwnerEmails,
} from '../../../server/ownerAuthority.js';

describe('owner authority policy', () => {
    it('normalizes and deduplicates configured owner emails', () => {
        expect(normalizeEmail(' Owner@Example.COM ')).toBe('owner@example.com');
        expect(normalizeEmail(null)).toBe('');
        expect([...parseOwnerEmails(' Owner@Example.COM, second@test.dev,owner@example.com, ,')])
            .toEqual(['owner@example.com', 'second@test.dev']);
        expect([...getOwnerEmails({ OWNER_EMAILS: 'First@Test.dev, SECOND@test.dev' })])
            .toEqual(['first@test.dev', 'second@test.dev']);
    });

    it('collapses unknown stored roles to user authority', () => {
        expect(effectiveRole(null)).toBe('user');
        expect(effectiveRole('unexpected')).toBe('user');
        expect(effectiveRole('user')).toBe('user');
        expect(effectiveRole('admin')).toBe('admin');
        expect(effectiveRole('owner')).toBe('owner');
    });

    it('requires both an owner role and a configured normalized email', () => {
        const env = { OWNER_EMAILS: ' OWNER@example.com ' };
        expect(isConfiguredOwner({ role: 'owner', email: 'Owner@Example.com' }, env)).toBe(true);
        expect(isConfiguredOwner({ role: 'admin', email: 'owner@example.com' }, env)).toBe(false);
        expect(isConfiguredOwner({ role: 'owner', email: 'other@example.com' }, env)).toBe(false);
    });

    it('enforces the owner and admin moderation hierarchy', () => {
        expect(canModerateRole('admin', 'user')).toBe(true);
        expect(canModerateRole('admin', 'admin')).toBe(false);
        expect(canModerateRole('admin', 'owner')).toBe(false);
        expect(canModerateRole('owner', 'user')).toBe(true);
        expect(canModerateRole('owner', 'admin')).toBe(true);
        expect(canModerateRole('owner', 'owner')).toBe(false);
        expect(canModerateRole('unexpected', 'user')).toBe(false);
    });

    it('requires at least one configured owner only in production', () => {
        expect(() => assertOwnerConfiguration({ NODE_ENV: 'production', OWNER_EMAILS: ' , ' }))
            .toThrow('OWNER_EMAILS must contain at least one email in production');
        expect(() => assertOwnerConfiguration({ NODE_ENV: 'production', OWNER_EMAILS: 'owner@test.dev' }))
            .not.toThrow();
        expect(() => assertOwnerConfiguration({ NODE_ENV: 'test', OWNER_EMAILS: '' })).not.toThrow();
    });
});
