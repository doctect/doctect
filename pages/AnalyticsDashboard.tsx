import React, { useEffect, useState } from 'react';
import { getStats, Stats } from '../services/analytics';

export const AnalyticsDashboard = () => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const data = await getStats();
            setStats(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8">Loading stats...</div>;
    if (!stats) return <div className="p-8">Error loading stats.</div>;

    return (
        <div className="h-screen overflow-y-auto bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-3xl font-bold mb-8 text-gray-900">Analytics Dashboard</h1>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                        <h3 className="text-sm font-medium text-gray-500 uppercase">Total Events</h3>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                        <h2 className="text-xl font-semibold mb-4">Event Breakdown</h2>
                        <div className="space-y-4">
                            {stats.byType.map((item) => (
                                <div key={item.type} className="flex items-center justify-between">
                                    <span className="text-gray-700">{item.type}</span>
                                    <span className="font-mono font-medium">{item.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 h-fit">
                        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
                        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                            {stats.recent.map((event) => (
                                <div key={event.id} className="border-b last:border-0 pb-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="font-medium text-blue-600">{event.type}</span>
                                        <span className="text-gray-400">{new Date(event.timestamp).toLocaleString()}</span>
                                    </div>
                                    <pre className="text-xs text-slate-500 mt-1 overflow-x-auto">
                                        {event.payload}
                                    </pre>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
