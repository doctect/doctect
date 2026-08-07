// Pure helpers for the onboarding playground. No DOM access here — everything
// in this file is unit-tested; DOM glue lives in app.js.
export const WINDOWS = [
    { id: 'intro', label: 'intro' },
    { id: 'tours', label: 'tours' },
    { id: 'code', label: 'code' },
    { id: 'playground', label: 'playground' },
];

export const parseHash = (hash) => {
    const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    const win = WINDOWS.some(w => w.id === parts[0]) ? parts[0] : 'intro';
    return { win, parts: win === parts[0] ? parts.slice(1) : [] };
};

export const buildHash = (win, parts = []) => '#/' + [win, ...parts].join('/');

export const formatBytes = (n) => n < 1024 ? `${n} B`
    : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB`
    : `${(n / (1024 * 1024)).toFixed(1)} MB`;

export const filterTree = (node, query) => {
    const q = (query || '').toLowerCase();
    if (!q) return node;
    if (node.kind === 'file') {
        return node.path.toLowerCase().includes(q) ? node : null;
    }
    const children = (node.children || []).map(c => filterTree(c, q)).filter(Boolean);
    if (children.length === 0 && !node.path.toLowerCase().includes(q)) return null;
    return { ...node, children: children.length ? children : node.children };
};

export const findNode = (tree, path) => {
    if (tree.path === path) return tree;
    for (const c of tree.children || []) {
        if (path === c.path || path.startsWith(c.path + '/')) return findNode(c, path);
    }
    return null;
};

export const flattenDirs = (tree, out = []) => {
    if (tree.kind === 'dir') { out.push(tree.path); (tree.children || []).forEach(c => flattenDirs(c, out)); }
    return out;
};

export const nearestAnnotated = (path, annotations) => {
    let probe = path;
    while (probe) {
        const hit = annotations.find(a => a.path === probe);
        if (hit) return hit;
        probe = probe.includes('/') ? probe.slice(0, probe.lastIndexOf('/')) : '';
    }
    return null;
};

export const RANKS = [
    ['visitor', 0], ['intern', 0.2], ['contributor', 0.45], ['reviewer', 0.7], ['maintainer', 0.9],
];

export const rankFor = (points, max) => {
    const frac = max > 0 ? points / max : 0;
    let rank = RANKS[0][0];
    for (const [name, floor] of RANKS) if (frac >= floor) rank = name;
    return rank;
};

export const scoreProfile = (profile, playground) => {
    let points = 0, max = 0;
    playground.quizLevels.forEach((level, i) => {
        max += level.questions.length;
        points += profile.quiz[i]?.best || 0;
    });
    max += playground.bugHunt.length;
    points += playground.bugHunt.filter(b => profile.bugs[b.id] === 'found').length;
    max += playground.wdil.length;
    points += playground.wdil.filter(w => profile.wdil[w.id]?.done && !profile.wdil[w.id]?.failed).length;
    return { points, max };
};

export const levelUnlocked = (profile, levelIndex) =>
    levelIndex === 0 || (profile.quiz[levelIndex - 1]?.best || 0) >= 6;

export const defaultProfile = () => ({ v: 1, bootSeen: false, quiz: {}, bugs: {}, wdil: {} });

const STORE_KEY = 'doctect-onboarding';

export const loadProfile = () => {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && parsed.v === 1) return { ...defaultProfile(), ...parsed };
    } catch { /* fresh profile below */ }
    return defaultProfile();
};

export const saveProfile = (profile) => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(profile)); } catch { /* full/blocked: ignore */ }
};
