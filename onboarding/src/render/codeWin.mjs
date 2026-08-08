// onboarding/src/render/codeWin.mjs
// The import is stripped in the shipped bundle (shared IIFE scope) but is
// REQUIRED for vitest, which imports this module as real ESM.
import { formatBytes, filterTree, findNode, flattenDirs, nearestAnnotated, escapeHtml } from '../app-logic.mjs';

const escC = escapeHtml;

export function treeHtml(node, selectedPath, openPaths) {
    if (node.kind === 'file') {
        const sel = node.path === selectedPath ? ' selected' : '';
        return `<li><a class="tree-file${sel}" href="#/code/${node.path}">${node.name}` +
               `<span class="dim"> ${formatBytes(node.size)}</span></a></li>`;
    }
    const open = openPaths.has(node.path) || node.path === '' ? ' open' : '';
    const inner = (node.children || []).map(c => treeHtml(c, selectedPath, openPaths)).join('');
    if (node.path === '') return `<ul class="tree-root">${inner}</ul>`;
    return `<li><details${open}><summary>${node.name}/</summary><ul>${inner}</ul></details></li>`;
}

function ancestorsOf(path) {
    const out = new Set();
    let p = path;
    while (p.includes('/')) { p = p.slice(0, p.lastIndexOf('/')); out.add(p); }
    if (path) out.add(path.split('/')[0]);
    return out;
}

function detailHtml(ctx, selectedPath) {
    const { tree } = ctx.data;
    const anns = ctx.content.codeMap.annotations;
    if (!selectedPath) {
        return '<h3 class="accent">the repository</h3>' +
            '<p>Pick a file or directory. Curated entries carry commentary; everything else shows ' +
            'generated facts plus its nearest annotated ancestor.</p>' +
            '<table class="vitals">' + ctx.data.vitals.areas.map(a =>
                `<tr><td><a href="#/code/${a.dir}">${a.dir}/</a></td>` +
                `<td class="dim">${a.files} files · ${a.lines.toLocaleString()} lines</td></tr>`).join('') +
            '</table>';
    }
    const node = findNode(tree, selectedPath);
    if (!node) return `<p class="red">gone from the tree: ${escC(selectedPath)} — regenerate the page?</p>`;
    const exact = anns.find(a => a.path === selectedPath);
    const nearest = exact || nearestAnnotated(selectedPath, anns);
    let html = `<h3 class="accent">${selectedPath}${node.kind === 'dir' ? '/' : ''}</h3>` +
        `<p class="dim">${node.kind === 'file'
            ? `${formatBytes(node.size)}${node.lines ? ` · ${node.lines} lines` : ''}`
            : `${(node.children || []).length} entries · ${formatBytes(node.size)}`}</p>`;
    if (exact) html += `<p>${escC(exact.note)}</p>` + (exact.detail ? `<p>${escC(exact.detail)}</p>` : '');
    else if (nearest) html += `<p class="dim">nearest commentary — <code>${nearest.path}</code>:</p><p>${escC(nearest.note)}</p>`;
    return html;
}

export function renderCode(el, ctx) {
    const selectedPath = ctx.route.parts.join('/');
    const openPaths = ancestorsOf(selectedPath);

    const nav = document.createElement('section');
    nav.className = 'pane code-tree';
    nav.innerHTML = `<div class="pane-title">files</div><div class="pane-body">` +
        `<input data-search type="search" placeholder="/ filter…">` +
        `<nav class="tree"></nav></div>`;
    const treeBox = nav.querySelector('.tree');
    const drawTree = (query) => {
        const filtered = query ? filterTree(ctx.data.tree, query) : ctx.data.tree;
        treeBox.innerHTML = filtered
            ? treeHtml(filtered, selectedPath, query ? new Set(flattenDirs(filtered)) : openPaths)
            : '<p class="dim">no matches</p>';
    };
    drawTree('');
    nav.querySelector('[data-search]').addEventListener('input', (e) => drawTree(e.target.value.trim()));

    const detail = document.createElement('section');
    detail.className = 'pane code-detail';
    detail.innerHTML = `<div class="pane-title">commentary</div>` +
        `<div class="pane-body">${detailHtml(ctx, selectedPath)}</div>`;

    el.append(nav, detail);
}
