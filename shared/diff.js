// Structured three-way diff/merge for PDF Architect project states.
// Plain ESM JavaScript so both the Express server and the Vite client can import it.
// A "DiffState" is any object with { nodes, rootId, variants } (extra fields ignored).

import { generatorProvenanceEqual } from './generatorMetadata.js';

/**
 * @typedef {Object} ChangeSet
 * @property {string[]} variantsAdded
 * @property {string[]} variantsRemoved
 * @property {Record<string,string>} variantsRenamed   // variantId -> new name
 * @property {Record<string,string[]>} templatesAdded  // variantId -> templateIds
 * @property {Record<string,string[]>} templatesModified
 * @property {Record<string,string[]>} templatesRemoved
 * @property {boolean} nodesChanged
 * @property {null|'added'|'modified'|'removed'} generatorChange
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
const generatorValue = state => state.generator ?? null;
const generatorEqual = (left, right) => left === null || right === null
    ? left === right
    : generatorProvenanceEqual(left, right);

/** @returns {ChangeSet} */
export const computeChangeSet = (base, side) => {
    const cs = {
        variantsAdded: [], variantsRemoved: [], variantsRenamed: {},
        templatesAdded: {}, templatesModified: {}, templatesRemoved: {},
        nodesChanged: false,
        generatorChange: null
    };
    cs.nodesChanged = !eq(
        { nodes: base.nodes, rootId: base.rootId },
        { nodes: side.nodes, rootId: side.rootId }
    );
    const baseGenerator = generatorValue(base);
    const sideGenerator = generatorValue(side);
    if (!generatorEqual(baseGenerator, sideGenerator)) {
        cs.generatorChange = baseGenerator === null ? 'added'
            : sideGenerator === null ? 'removed'
                : 'modified';
    }
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

const touchedTemplates = (cs, vid) => new Set([
    ...(cs.templatesAdded[vid] || []),
    ...(cs.templatesModified[vid] || []),
    ...(cs.templatesRemoved[vid] || [])
]);

const variantTouched = (cs, vid) =>
    touchedTemplates(cs, vid).size > 0 || Object.prototype.hasOwnProperty.call(cs.variantsRenamed, vid);

/**
 * @typedef {Object} Conflict
 * @property {'nodes'|'variant'|'template'|'generator'} kind
 * @property {string} [id]
 * @property {string} [variantId]
 * @property {string} [templateId]
 * @property {string} description
 */

/** @returns {{source: ChangeSet, target: ChangeSet, conflicts: Conflict[]}} */
export const threeWayDiff = (base, source, target) => {
    const src = computeChangeSet(base, source);
    const tgt = computeChangeSet(base, target);
    const conflicts = [];

    if (src.nodesChanged && tgt.nodesChanged &&
        !eq({ nodes: source.nodes, rootId: source.rootId }, { nodes: target.nodes, rootId: target.rootId })) {
        conflicts.push({ kind: 'nodes', description: 'Both projects changed the page hierarchy differently' });
    }

    if (src.generatorChange !== null && tgt.generatorChange !== null
        && !generatorEqual(generatorValue(source), generatorValue(target))) {
        conflicts.push({
            kind: 'generator',
            id: 'generator',
            description: 'Generator source changed differently on both branches.',
        });
    }

    for (const vid of src.variantsAdded) {
        if (tgt.variantsAdded.includes(vid) && !eq(source.variants[vid], target.variants[vid])) {
            conflicts.push({ kind: 'variant', variantId: vid, description: `Variant "${vid}" was added on both sides with different content` });
        }
    }
    for (const vid of Object.keys(src.variantsRenamed)) {
        if (vid in tgt.variantsRenamed && src.variantsRenamed[vid] !== tgt.variantsRenamed[vid]) {
            conflicts.push({ kind: 'variant', variantId: vid, description: `Variant "${vid}" was renamed differently on both sides` });
        }
    }
    for (const vid of src.variantsRemoved) {
        if (variantTouched(tgt, vid)) {
            conflicts.push({ kind: 'variant', variantId: vid, description: `Variant "${vid}" was removed in the fork but modified upstream` });
        }
    }
    for (const vid of tgt.variantsRemoved) {
        if (variantTouched(src, vid)) {
            conflicts.push({ kind: 'variant', variantId: vid, description: `Variant "${vid}" was removed upstream but modified in the fork` });
        }
    }

    const vids = new Set([
        ...Object.keys(src.templatesAdded), ...Object.keys(src.templatesModified), ...Object.keys(src.templatesRemoved),
        ...Object.keys(tgt.templatesAdded), ...Object.keys(tgt.templatesModified), ...Object.keys(tgt.templatesRemoved)
    ]);
    for (const vid of vids) {
        const srcSet = touchedTemplates(src, vid);
        const tgtSet = touchedTemplates(tgt, vid);
        for (const tid of srcSet) {
            if (!tgtSet.has(tid)) continue;
            const sVal = source.variants[vid]?.templates?.[tid];
            const tVal = target.variants[vid]?.templates?.[tid];
            if (!eq(sVal, tVal)) {
                conflicts.push({ kind: 'template', variantId: vid, templateId: tid, description: `Template "${tid}" in variant "${vid}" was changed on both sides` });
            }
        }
    }

    return { source: src, target: tgt, conflicts };
};

/**
 * Applies source's changes (relative to base) on top of target.
 * PRECONDITION: threeWayDiff(base, source, target).conflicts is empty.
 * @returns merged full state (target clone + source changes)
 */
export const applyChangeSet = (base, source, target) => {
    const merged = clone(target);
    const cs = computeChangeSet(base, source);

    if (cs.nodesChanged) {
        merged.nodes = clone(source.nodes);
        merged.rootId = source.rootId;
    }
    if (cs.generatorChange === 'removed') delete merged.generator;
    if (cs.generatorChange === 'added' || cs.generatorChange === 'modified') {
        merged.generator = clone(source.generator);
    }
    for (const vid of cs.variantsAdded) merged.variants[vid] = clone(source.variants[vid]);
    for (const vid of cs.variantsRemoved) delete merged.variants[vid];
    for (const [vid, newName] of Object.entries(cs.variantsRenamed)) {
        if (merged.variants[vid]) merged.variants[vid].name = newName;
    }
    const applyTemplates = (map, fn) => {
        for (const [vid, tids] of Object.entries(map)) {
            if (!merged.variants[vid]) continue;
            for (const tid of tids) fn(vid, tid);
        }
    };
    applyTemplates(cs.templatesAdded, (vid, tid) => { merged.variants[vid].templates[tid] = clone(source.variants[vid].templates[tid]); });
    applyTemplates(cs.templatesModified, (vid, tid) => { merged.variants[vid].templates[tid] = clone(source.variants[vid].templates[tid]); });
    applyTemplates(cs.templatesRemoved, (vid, tid) => { delete merged.variants[vid].templates[tid]; });

    if (!merged.variants[merged.activeVariantId]) {
        merged.activeVariantId = Object.keys(merged.variants)[0];
    }
    return merged;
};
