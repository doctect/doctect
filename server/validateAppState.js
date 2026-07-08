export const MAX_STATE_BYTES = 5 * 1024 * 1024;

const fail = (error) => ({ ok: false, error });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const validateAppState = (state) => {
    if (!isObj(state)) return fail('state must be an object');

    let bytes;
    try { bytes = Buffer.byteLength(JSON.stringify(state), 'utf8'); }
    catch { return fail('state is not serializable'); }
    if (bytes > MAX_STATE_BYTES) return fail(`state exceeds ${MAX_STATE_BYTES} bytes`);

    if (!isObj(state.nodes)) return fail('nodes must be an object');
    if (!isStr(state.rootId) || !state.nodes[state.rootId]) return fail('rootId must reference an existing node');
    if (Object.keys(state.nodes).length > 20000) return fail('too many nodes (max 20000)');

    for (const [id, node] of Object.entries(state.nodes)) {
        if (!isObj(node)) return fail(`node ${id} must be an object`);
        if (!isStr(node.id) || node.id !== id) return fail(`node ${id} has mismatched id`);
        if (node.parentId !== null && !isStr(node.parentId)) return fail(`node ${id} parentId invalid`);
        if (!isStr(node.type)) return fail(`node ${id} missing type`);
        if (!isStr(node.title)) return fail(`node ${id} missing title`);
        if (!isObj(node.data)) return fail(`node ${id} data must be an object`);
        if (!Array.isArray(node.children) || node.children.some(c => !isStr(c))) return fail(`node ${id} children invalid`);
    }

    if (!isObj(state.variants) || Object.keys(state.variants).length === 0) return fail('variants must be a non-empty object');
    if (Object.keys(state.variants).length > 50) return fail('too many variants (max 50)');

    let totalElements = 0;
    for (const [vid, variant] of Object.entries(state.variants)) {
        if (!isObj(variant)) return fail(`variant ${vid} must be an object`);
        if (!isStr(variant.id) || !isStr(variant.name)) return fail(`variant ${vid} missing id/name`);
        if (!isObj(variant.templates)) return fail(`variant ${vid} templates must be an object`);
        for (const [tid, tpl] of Object.entries(variant.templates)) {
            if (!isObj(tpl)) return fail(`template ${vid}/${tid} must be an object`);
            if (!isStr(tpl.id) || !isStr(tpl.name)) return fail(`template ${vid}/${tid} missing id/name`);
            if (!isNum(tpl.width) || !isNum(tpl.height) || tpl.width <= 0 || tpl.height <= 0 || tpl.width > 20000 || tpl.height > 20000) {
                return fail(`template ${vid}/${tid} has invalid dimensions`);
            }
            if (!Array.isArray(tpl.elements)) return fail(`template ${vid}/${tid} elements must be an array`);
            // Layers (v8+): light, optional checks — legacy/un-migrated states must still validate
            if (tpl.layers !== undefined) {
                if (!Array.isArray(tpl.layers)) return fail(`template ${vid}/${tid} layers must be an array`);
                if (tpl.layers.length > 200) return fail(`template ${vid}/${tid} has too many layers (max 200)`);
            }
            for (const el of tpl.elements) {
                if (el && typeof el === 'object' && el.layerId !== undefined && !isStr(el.layerId)) {
                    return fail(`template ${vid}/${tid} has an element with a non-string layerId`);
                }
            }
            totalElements += tpl.elements.length;
        }
    }
    if (totalElements > 50000) return fail('too many elements (max 50000)');

    return { ok: true };
};
