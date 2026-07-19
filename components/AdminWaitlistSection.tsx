import React, { useEffect, useState } from 'react';
import { cloudApi } from '../services/cloudApi';

export function AdminWaitlistSection() {
    const [count, setCount] = useState<number | null>(null);
    const [entries, setEntries] = useState<{ email: string; createdAt: string }[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        cloudApi.getAdminWaitlist()
            .then(({ count, entries }) => {
                if (!cancelled) { setCount(count); setEntries(entries); }
            })
            .catch(err => { if (!cancelled) setError(err.message || 'Failed to load waitlist'); });
        return () => { cancelled = true; };
    }, []);

    return (
        <section className="mt-8">
            {error ? (
                <p className="text-sm text-red-600">{error}</p>
            ) : count === null ? (
                <p className="text-sm text-slate-500">Loading waitlist…</p>
            ) : (
                <>
                    <h2 className="text-lg font-semibold mb-2">Waitlist ({count})</h2>
                    {count === 0 ? (
                        <p className="text-sm text-slate-500">No one is waiting.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr>
                                    <th className="text-left py-1 font-medium text-slate-600">Email</th>
                                    <th className="text-left py-1 font-medium text-slate-600">Joined</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map(entry => (
                                    <tr key={entry.email} className="border-t">
                                        <td className="py-1">{entry.email}</td>
                                        <td className="py-1">{new Date(entry.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            )}
        </section>
    );
}
