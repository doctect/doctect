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
];
