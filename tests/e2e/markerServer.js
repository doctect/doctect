import http from 'node:http';

export const MIN_NO_HIT_OBSERVATION_MS = 1200;

export const startMarkerServer = async () => {
    const hits = [];
    const sockets = new Set();
    const noHitObservers = new Set();
    const server = http.createServer((request, response) => {
        const hit = { method: request.method, url: request.url };
        hits.push(hit);
        for (const observer of [...noHitObservers]) observer.onHit(hit);
        response.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
        });
        response.end();
    });
    server.on('connection', socket => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Marker server did not bind a TCP port.');
    const origin = `http://127.0.0.1:${address.port}`;
    let closed = false;

    return {
        hits,
        url: path => new URL(path, origin).href,
        observeNoHitsFor: (durationMs = MIN_NO_HIT_OBSERVATION_MS) => {
            if (!Number.isFinite(durationMs) || durationMs < MIN_NO_HIT_OBSERVATION_MS) {
                return Promise.reject(new Error(
                    `No-hit observation must run for at least ${MIN_NO_HIT_OBSERVATION_MS} ms.`,
                ));
            }
            if (hits.length > 0) {
                const hit = hits[0];
                return Promise.reject(new Error(`Unexpected marker hit: ${hit.method} ${hit.url}`));
            }

            return new Promise((resolve, reject) => {
                let timer;
                const observer = {
                    onHit: hit => {
                        clearTimeout(timer);
                        noHitObservers.delete(observer);
                        reject(new Error(`Unexpected marker hit: ${hit.method} ${hit.url}`));
                    },
                    cancel: error => {
                        clearTimeout(timer);
                        noHitObservers.delete(observer);
                        reject(error);
                    },
                };
                noHitObservers.add(observer);
                timer = setTimeout(() => {
                    noHitObservers.delete(observer);
                    resolve();
                }, durationMs);
            });
        },
        close: async () => {
            if (closed) return;
            closed = true;
            for (const observer of [...noHitObservers]) {
                observer.cancel(new Error('Marker server closed before no-hit observation completed.'));
            }
            const closing = new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
            for (const socket of sockets) socket.destroy();
            await closing;
        },
    };
};
