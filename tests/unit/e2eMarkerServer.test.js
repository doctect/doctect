// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { startMarkerServer } from '../e2e/markerServer.js';

describe('e2e marker server', () => {
    it('records HTTP hits server-side and closes its listener', async () => {
        const marker = await startMarkerServer();
        const attackUrl = marker.url('/attack.js');
        try {
            const response = await fetch(attackUrl);
            expect(response.status).toBe(204);
            expect(marker.hits).toEqual([{ method: 'GET', url: '/attack.js' }]);
        } finally {
            await marker.close();
        }

        await expect(fetch(attackUrl)).rejects.toThrow();
    });

    it('rejects immediately when a delayed hit arrives inside the observation window', async () => {
        const marker = await startMarkerServer();
        try {
            const startedAt = Date.now();
            const observation = marker.observeNoHitsFor(1200);
            const delayedRequest = new Promise((resolve, reject) => {
                setTimeout(() => fetch(marker.url('/delayed.js')).then(resolve, reject), 50);
            });

            await expect(observation).rejects.toThrow('Unexpected marker hit: GET /delayed.js');
            expect(Date.now() - startedAt).toBeLessThan(1200);
            await delayedRequest;
        } finally {
            await marker.close();
        }
    });

    it('resolves a no-hit observation only after the full bounded interval', async () => {
        const marker = await startMarkerServer();
        try {
            const startedAt = Date.now();
            await marker.observeNoHitsFor(1200);
            expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1200);
            expect(marker.hits).toEqual([]);
        } finally {
            await marker.close();
        }
    });
});
