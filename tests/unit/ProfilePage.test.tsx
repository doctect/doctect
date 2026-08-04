import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProfilePage } from '../../pages/ProfilePage';

const api = vi.hoisted(() => ({ me: vi.fn() }));

vi.mock('../../services/cloudApi', () => ({ cloudApi: api, API_BASE: '' }));
vi.mock('../../lib/auth-client', () => ({
    useSession: () => ({ data: null, isPending: false }),
    signIn: {}, signUp: {}, signOut: vi.fn(), authClient: {},
}));

// EXACTLY the JSON GET /api/users/:username returns (see server/routes/me.js and
// the shape locked by tests/unit/server/users.test.js). If the endpoint's DTO
// changes, update this payload to match — the img assertion below then guards
// against the server shape ever losing the thumbnail ids the cards render from.
const serverPayload = {
    user: { username: 'profiled', createdAt: '2026-01-01T00:00:00.000Z' },
    projects: [{
        id: 'p1', name: 'Profile Planner', description: 'a planner', tags: ['planner'],
        author: 'profiled', forkCount: 0, downloadCount: 0,
        updatedAt: '2026-08-01 00:00:00', thumbnailId: 'thumb-1',
        thumbnailIds: ['thumb-1', 'thumb-2'],
        ratingAvg: null, ratingCount: 0,
    }],
};

const renderProfile = () => render(
    <MemoryRouter initialEntries={['/u/profiled']}>
        <Routes>
            <Route path="/u/:username" element={<ProfilePage />} />
        </Routes>
    </MemoryRouter>
);

describe('ProfilePage', () => {
    beforeEach(() => {
        api.me.mockResolvedValue(null);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => serverPayload,
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('renders each project card with its thumbnail image', async () => {
        renderProfile();
        expect(await screen.findByText('profiled')).toBeInTheDocument();
        // The card must show a real thumbnail, not the gray placeholder.
        const img = await screen.findByRole('img', { name: 'Profile Planner' }) as HTMLImageElement;
        expect(img.src).toContain('/api/thumbnails/thumb-1');
    });
});
