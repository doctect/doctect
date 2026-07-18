import { describe, expect, it } from 'vitest';
import { executeGallerySample, validateSharedGalleryInvariants } from '../../helpers/gallerySampleHarness';

const templatesSource = (element: string) => `
const templates = {
  hub: { id: 'hub', name: 'Hub', width: 509, height: 679, elements: [] },
  leaf: { id: 'leaf', name: 'Leaf', width: 509, height: 679, elements: [
    ${element}
  ] },
  chrome: { id: 'chrome', name: 'Chrome', width: 509, height: 679, elements: [
    { id: 'chrome_badge', type: 'text', x: 20, y: 20, w: 100, h: 20, text: '{{example_label}}' },
    { id: 'chrome_skip', type: 'text', x: 280, y: 20, w: 200, h: 20, text: '{{skip_label}}', linkTarget: 'specific_node', linkValue: 'blank_workspace' }
  ] },
};
return templates;`;

// root(hub) -> [groupA(hub) -> leaf1, leaf2] , [groupB(hub) -> leaf3]
// plus the example/blank chrome nodes required by the shared invariants; they are
// childless, so they never provide sibling/cousin candidates for the leaf nodes.
const hierarchySource = (leafData: string) => `
const nodes = {};
const add = (id, parentId, type, data = {}) => {
  nodes[id] = { id, parentId, type, title: id, data, children: [] };
  if (parentId) nodes[parentId].children.push(id);
};
add('root', null, 'hub');
add('groupA', 'root', 'hub');
add('groupB', 'root', 'hub');
add('example_workspace', 'root', 'chrome', { example_label: 'EXAMPLE', skip_label: 'Skip to blank workspace →' });
add('blank_workspace', 'root', 'chrome');
${leafData}
return { nodes, rootId: 'root' };`;

const NEXT_CHIP = `{ id: 'leaf_next', type: 'text', x: 400, y: 10, w: 80, h: 20, rotation: 0, fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: '{{nav_next_label}}', dataBinding: 'nav_next_label', fontSize: 10, fontFamily: 'helvetica', linkTarget: 'sibling', linkValue: '1' }`;
const CONTINUE_CHIP = `{ id: 'leaf_go', type: 'text', x: 400, y: 40, w: 80, h: 20, rotation: 0, fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: '{{continue_label}}', dataBinding: 'continue_label', fontSize: 10, fontFamily: 'helvetica', linkTarget: 'child_index', linkValue: '0' }`;
const STATIC_NEXT = `{ id: 'leaf_static', type: 'text', x: 400, y: 10, w: 80, h: 20, rotation: 0, fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: 'NEXT', fontSize: 10, fontFamily: 'helvetica', linkTarget: 'sibling', linkValue: '1' }`;

describe('gallery harness link escapes', () => {
  it('accepts a sibling link that resolves through engine cousin fallback', () => {
    // leaf2 is groupA's last child; groupB's first 'leaf' child is the cousin target.
    const sample = executeGallerySample(templatesSource(STATIC_NEXT), hierarchySource(`
add('leaf1', 'groupA', 'leaf', { nav_next_label: 'L2' });
add('leaf2', 'groupA', 'leaf', { nav_next_label: 'L3' });
add('leaf3', 'groupB', 'leaf', { nav_next_label: 'X' });`));
    const errors = validateSharedGalleryInvariants(sample)
      .filter(error => error.includes('leaf3'));
    // leaf3 has no next sibling AND no cousin AND no empty bound label -> must still error
    expect(errors).toHaveLength(1);
    const cleanErrors = validateSharedGalleryInvariants(sample)
      .filter(error => error.includes("'leaf2'"));
    // leaf2 resolves via cousin fallback -> no error
    expect(cleanErrors).toEqual([]);
  });

  it('accepts an unresolved sibling link when the bound label is empty', () => {
    const sample = executeGallerySample(templatesSource(NEXT_CHIP), hierarchySource(`
add('leaf1', 'groupA', 'leaf', { nav_next_label: 'L2 »' });
add('leaf2', 'groupA', 'leaf', { nav_next_label: '' });`));
    expect(validateSharedGalleryInvariants(sample)).toEqual([]);
  });

  it('still rejects an unresolved sibling link when the bound label is non-empty', () => {
    const sample = executeGallerySample(templatesSource(NEXT_CHIP), hierarchySource(`
add('leaf1', 'groupA', 'leaf', { nav_next_label: 'L2 »' });
add('leaf2', 'groupA', 'leaf', { nav_next_label: 'DEAD »' });`));
    const errors = validateSharedGalleryInvariants(sample);
    expect(errors.some(error => error.includes("sibling offset 1 does not resolve for node 'leaf2'"))).toBe(true);
  });

  it('accepts an unresolved child_index link when the bound label is empty', () => {
    const sample = executeGallerySample(templatesSource(CONTINUE_CHIP), hierarchySource(`
add('leaf1', 'groupA', 'leaf', { continue_label: '' });
add('leaf2', 'groupA', 'leaf', { continue_label: '' });`));
    expect(validateSharedGalleryInvariants(sample)).toEqual([]);
  });

  it('still rejects an unresolved child_index link when the label is non-empty', () => {
    const sample = executeGallerySample(templatesSource(CONTINUE_CHIP), hierarchySource(`
add('leaf1', 'groupA', 'leaf', { continue_label: 'GO »' });`));
    const errors = validateSharedGalleryInvariants(sample);
    expect(errors.some(error => error.includes("child index 0 does not resolve for node 'leaf1'"))).toBe(true);
  });
});
