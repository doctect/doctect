import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { stableStringify } from '../shared/diff.js';

// Encodes an AppState for storage: gzip-compressed JSON plus its stored size and a
// content hash. The hash uses stableStringify so two states that differ only in
// object key order (e.g. re-serialized by different clients) dedupe as identical.
export const encodeState = (state) => {
    const gzip = gzipSync(Buffer.from(JSON.stringify(state), 'utf8'));
    const hash = createHash('sha256').update(stableStringify(state)).digest('hex');
    return { gzip, bytes: gzip.length, hash };
};

// Decodes a commits row back into an AppState object. New rows store gzip in
// state_gzip (state_json = ''); rows written before migration 007 have only
// state_json — both must keep working forever, so never drop the fallback.
export const decodeStateRow = (row) => {
    if (row.state_gzip != null) {
        const buf = Buffer.isBuffer(row.state_gzip) ? row.state_gzip : Buffer.from(row.state_gzip);
        return JSON.parse(gunzipSync(buf).toString('utf8'));
    }
    return JSON.parse(row.state_json);
};
