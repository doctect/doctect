import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import type { MeUser } from '../../services/cloudApi';

const api = vi.hoisted(() => ({ me: vi.fn() }));

vi.mock('../../services/cloudApi', () => ({ cloudApi: api }));

const user = (role: MeUser['role']): MeUser => ({
    id: `${role}-1`, email: `${role}@test.dev`, username: role, role,
});

const deferred = <T,>() => {
    let resolve: (value: T) => void = () => {};
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
};

describe('useCurrentUser', () => {
    beforeEach(() => vi.clearAllMocks());

    it('exposes fresh authority errors without treating them as signed out', async () => {
        api.me.mockRejectedValueOnce(new Error('Authority unavailable'));
        const { result } = renderHook(() => useCurrentUser());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.user).toBeNull();
        expect(result.current.error).toEqual(new Error('Authority unavailable'));
    });

    it('keeps the latest overlapping refresh result', async () => {
        const first = deferred<MeUser | null>();
        const second = deferred<MeUser | null>();
        api.me.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const { result } = renderHook(() => useCurrentUser());

        let refreshPromise: Promise<void> = Promise.resolve();
        act(() => { refreshPromise = result.current.refresh(); });
        await act(async () => {
            second.resolve(user('admin'));
            await refreshPromise;
        });
        expect(result.current.user).toEqual(user('admin'));

        await act(async () => {
            first.resolve(user('owner'));
            await first.promise;
        });
        expect(result.current.user).toEqual(user('admin'));
        expect(result.current.loading).toBe(false);
    });

    it('recovers from an error through refresh', async () => {
        api.me.mockRejectedValueOnce(new Error('Temporary failure'));
        const { result } = renderHook(() => useCurrentUser());
        await waitFor(() => expect(result.current.error?.message).toBe('Temporary failure'));

        api.me.mockResolvedValueOnce(user('owner'));
        await act(async () => { await result.current.refresh(); });

        expect(result.current.user).toEqual(user('owner'));
        expect(result.current.error).toBeNull();
        expect(result.current.loading).toBe(false);
    });

    it('cancels pending authority updates on unmount', async () => {
        const request = deferred<MeUser | null>();
        api.me.mockReturnValueOnce(request.promise);
        const { result, unmount } = renderHook(() => useCurrentUser());
        expect(result.current.loading).toBe(true);

        unmount();
        await act(async () => {
            request.resolve(user('admin'));
            await request.promise;
        });

        expect(result.current.user).toBeNull();
        expect(result.current.loading).toBe(true);
        expect(result.current.error).toBeNull();
    });
});
