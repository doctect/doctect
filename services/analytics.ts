const API_URL = import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? window.location.origin + "/api" : "http://localhost:3001/api");

export const trackEvent = async (type: string, data: any = {}) => {
    try {
        await fetch(`${API_URL}/track`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ type, payload: data }),
        });
    } catch (error) {
        console.error('Failed to track event:', error);
    }
};

export interface Stats {
    total: number;
    byType: { type: string; count: number }[];
    recent: { id: number; type: string; payload: string; timestamp: string }[];
}

export const getStats = async (): Promise<Stats> => {
    const response = await fetch(`${API_URL}/stats`, {
        credentials: 'include'
    });
    if (!response.ok) {
        throw new Error('Failed to fetch stats');
    }
    return response.json();
};
