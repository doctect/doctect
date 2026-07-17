import { useEffect, useRef, useState } from 'react';
import { cloudApi } from '../services/cloudApi';
import type { MeUser } from '../services/cloudApi';

export function useCurrentUser(): {
    user: MeUser | null;
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
} {
    const [user, setUser] = useState<MeUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const generation = useRef(0);

    const refresh = async () => {
        const current = ++generation.current;
        setLoading(true);
        setError(null);
        try {
            const nextUser = await cloudApi.me();
            if (current === generation.current) setUser(nextUser);
        } catch (requestError) {
            if (current === generation.current) {
                setUser(null);
                setError(requestError instanceof Error ? requestError : new Error('Unable to load account'));
            }
        } finally {
            if (current === generation.current) setLoading(false);
        }
    };

    useEffect(() => {
        void refresh();
        return () => { generation.current += 1; };
    }, []);

    return { user, loading, error, refresh };
}
