// Structured three-way diff/merge for PDF Architect project states.
// Plain ESM JavaScript so both the Express server and the Vite client can import it.
// A "DiffState" is any object with { nodes, rootId, variants } (extra fields ignored).

/**
 * @typedef {Object} ChangeSet
 * @property {string[]} variantsAdded
 * @property {string[]} variantsRemoved
 * @property {Record<string,string>} variantsRenamed   // variantId -> new name
 * @property {Record<string,string[]>} templatesAdded  // variantId -> templateIds
 * @property {Record<string,string[]>} templatesModified
 * @property {Record<string,string[]>} templatesRemoved
 * @property {boolean} nodesChanged
 */

export const stableStringify = (value) => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort()
        .map(k => JSON.stringify(k) + ':' + stableStringify(value[k]))
        .join(',') + '}';
};

const eq = (a, b) => stableStringify(a) === stableStringify(b);
const clone = (v) => JSON.parse(JSON.stringify(v));
const pushMap = (map, key, val) => { (map[key] = map[key] || []).push(val); };

/** @returns {ChangeSet} */
export const computeChangeSet = (base, side) => {
    const cs = {
        variantsAdded: [], variantsRemoved: [], variantsRenamed: {},
        templatesAdded: {}, templatesModified: {}, templatesRemoved: {},
        nodesChanged: false
    };
    cs.nodesChanged = !eq(
        { nodes: base.nodes, rootId: base.rootId },
        { nodes: side.nodes, rootId: side.rootId }
    );
    const baseV = base.variants || {};
    const sideV = side.variants || {};
    for (const vid of Object.keys(sideV)) if (!baseV[vid]) cs.variantsAdded.push(vid);
    for (const vid of Object.keys(baseV)) if (!sideV[vid]) cs.variantsRemoved.push(vid);
    for (const vid of Object.keys(sideV)) {
        if (!baseV[vid]) continue; // wholly-added variants aren't itemized
        if (baseV[vid].name !== sideV[vid].name) cs.variantsRenamed[vid] = sideV[vid].name;
        const bt = baseV[vid].templates || {};
        const st = sideV[vid].templates || {};
        for (const tid of Object.keys(st)) {
            if (!bt[tid]) pushMap(cs.templatesAdded, vid, tid);
            else if (!eq(bt[tid], st[tid])) pushMap(cs.templatesModified, vid, tid);
        }
        for (const tid of Object.keys(bt)) {
            if (!st[tid]) pushMap(cs.templatesRemoved, vid, tid);
        }
    }
    return cs;
};
