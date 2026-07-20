import fs from 'node:fs';
import { gotoEditor, newBlankProject, openGenerator, pasteGeneratorScripts, runGenerator } from '../lib/app.js';

// These two scripts are embedded VERBATIM in
// docs-content/tutorials/generator/01-generator-basics.md ("A first script")
// — this capture running them through the real sandbox is what proves the
// tutorial's code actually works. Keep both in sync with the markdown.
const MINI_TEMPLATES = `const t = {};
t.page = { id: 'page', name: 'Page', width: A4_WIDTH, height: A4_HEIGHT, elements: [
  { type: 'text', x: 40, y: 40, w: 300, h: 40, text: '{{title}}', fontSize: 24 },
] };
return t;`;
const MINI_HIERARCHY = `const nodes = {};
nodes.root = { id: 'root', parentId: null, type: 'page', title: 'Mini Book', data: {}, children: [] };
for (let i = 1; i <= 3; i++) {
  const id = createId('p');
  nodes[id] = { id, parentId: 'root', type: 'page', title: 'Chapter ' + i, data: {}, children: [] };
  nodes.root.children.push(id);
}
return { nodes, rootId: 'root' };`;

// Tutorial generator/02 ("Templates in Code") is one continuous templates
// script split across five ```javascript blocks, plus a sixth block holding
// the hierarchy script. Rather than duplicating ~120 lines here and hoping
// they stay in sync, the blocks are extracted from the markdown itself at
// run time — so these captures always prove the tutorial's OWN code runs.
const RICH_MD = new URL('../../docs-content/tutorials/generator/02-templates-in-code.md', import.meta.url);
function richScripts() {
    const md = fs.readFileSync(RICH_MD, 'utf8');
    const blocks = [...md.matchAll(/```javascript\r?\n([\s\S]*?)```/g)].map(m => m[1]);
    if (blocks.length !== 6) throw new Error(`templates-in-code: expected 6 js blocks, found ${blocks.length}`);
    if (!blocks[4].includes('return t;')) throw new Error('templates-in-code: block 5 must end the templates script');
    if (!blocks[5].startsWith('const nodes')) throw new Error('templates-in-code: block 6 must be the hierarchy script');
    return { templates: blocks.slice(0, 5).join('\n'), hierarchy: blocks[5] };
}

export const shots = [
    { id: 'generator/modal-two-scripts', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, MINI_TEMPLATES, MINI_HIERARCHY);
        await t.snap();
    } },
    { id: 'generator/visual-preview', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, MINI_TEMPLATES, MINI_HIERARCHY);
        await runGenerator(t);
        await t.snap();
    } },
    { id: 'generator/templates-script-rich', kind: 'still', run: async (t) => {
        const { templates, hierarchy } = richScripts();
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, templates, hierarchy);
        await t.snap();
    } },
    { id: 'generator/preview-rich-templates', kind: 'still', run: async (t) => {
        const { templates, hierarchy } = richScripts();
        await gotoEditor(t); await newBlankProject(t); await openGenerator(t);
        await pasteGeneratorScripts(t, templates, hierarchy);
        await runGenerator(t);
        await t.snap();
    } },
];
