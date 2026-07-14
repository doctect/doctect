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
});
