import React, { useState, useEffect, useRef } from 'react';
import { authClient } from '../lib/auth-client';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

type Availability = 'unknown' | 'checking' | 'available' | 'taken';

interface UsernameFormProps {
    initialValue?: string;
    submitLabel?: string;
    onSuccess: (username: string) => void;
}

export function UsernameForm({ initialValue = '', submitLabel = 'Save', onSuccess }: UsernameFormProps) {
    const [value, setValue] = useState(initialValue);
    const [availability, setAvailability] = useState<Availability>('unknown');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const checkToken = useRef(0);

    const formatValid = USERNAME_RE.test(value);

    useEffect(() => {
        if (!formatValid || value === initialValue) {
            setAvailability('unknown');
            return;
        }
        const token = ++checkToken.current;
        setAvailability('checking');
        const t = setTimeout(async () => {
            try {
                const res = await authClient.isUsernameAvailable({ username: value });
                if (checkToken.current !== token) return;
                setAvailability(res.data?.available ? 'available' : 'taken');
            } catch {
                if (checkToken.current !== token) return;
                setAvailability('unknown');
            }
        }, 300);
        return () => clearTimeout(t);
    }, [value, initialValue, formatValid]);

    const canSubmit = formatValid && availability !== 'taken' && !busy;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        setError(null);
        await authClient.updateUser(
            { username: value },
            {
                onSuccess: () => { setBusy(false); onSuccess(value); },
                onError: (ctx) => {
                    setBusy(false);
                    setError(ctx.error.message || 'That username may already be taken, or something went wrong — try another.');
                },
            }
        );
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. planner_pro"
            />
            {!formatValid && value.length > 0 && (
                <p className="text-xs text-red-600">3–30 characters, letters/numbers/underscores only.</p>
            )}
            {formatValid && availability === 'checking' && <p className="text-xs text-slate-400">Checking availability…</p>}
            {formatValid && availability === 'available' && <p className="text-xs text-green-600">✓ Available</p>}
            {formatValid && availability === 'taken' && <p className="text-xs text-red-600">✗ Already taken</p>}
            <p className="text-xs text-gray-500">
                This is shown publicly on the gallery. It doesn't have to be your real name, and you can change it any time in Account settings.
            </p>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
                {busy ? 'Saving…' : submitLabel}
            </button>
        </form>
    );
}
