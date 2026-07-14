import http from 'node:http';

export const startMarkerServer = async () => {
    const hits = [];
    const sockets = new Set();
    const server = http.createServer((request, response) => {
        hits.push({ method: request.method, url: request.url });
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
        close: async () => {
            if (closed) return;
            closed = true;
            const closing = new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
            for (const socket of sockets) socket.destroy();
            await closing;
        },
    };
};
