import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    collectGallerySampleSlugs,
    executeGallerySample,
    expectValidGallerySample,
    loadGallerySample,
    validateGallerySample,
    validateSharedGalleryInvariants,
    type GallerySampleContract,
    type LoadedGallerySample,
} from '../helpers/gallerySampleHarness';

const templatesSource = `
return {
  cover: { id: 'cover', name: 'Cover', width: RM_PP_WIDTH, height: RM_PP_HEIGHT, elements: [
    { id: 'cover_open', type: 'text', x: 20, y: 20, w: 200, h: 30, text: 'Open', linkTarget: 'specific_node', linkValue: 'start_here' }
  ]},
  page: { id: 'page', name: 'Page', width: RM_PP_WIDTH, height: RM_PP_HEIGHT, elements: [
    { id: 'page_badge', type: 'text', x: 20, y: 20, w: 100, h: 20, text: '{{example_label}}' },
    { id: 'page_skip', type: 'text', x: 280, y: 20, w: 200, h: 20, text: '{{skip_label}}', linkTarget: 'specific_node', linkValue: 'blank_workspace' },
    { id: 'page_grid', type: 'grid', x: 20, y: 60, w: 100, h: 30, gridConfig: { cols: 2, gapX: 8, gapY: 8, sourceType: 'current', displayField: 'title', gridBorderMode: 'all', gridBorderColor: '#888888', gridBorderWidth: 1, gridBorderStyle: 'solid' } }
  ]}
};`;

const hierarchySource = `
const DEFAULT_CONFIG = { childCount: 2 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };
const nodes = {
  root: { id: 'root', parentId: null, type: 'cover', title: 'Root', data: {}, children: ['start_here'] },
  start_here: { id: 'start_here', parentId: 'root', type: 'page', title: 'Start Here', data: {}, children: ['example_workspace', 'blank_workspace'] },
  example_workspace: { id: 'example_workspace', parentId: 'start_here', type: 'page', title: 'Example', data: { example_label: 'EXAMPLE', skip_label: 'Skip to blank workspace →' }, children: [] },
  blank_workspace: { id: 'blank_workspace', parentId: 'start_here', type: 'page', title: 'Blank workspace', data: {}, children: [] }
};
return { nodes, rootId: 'root' };`;

const contract: GallerySampleContract = {
    slug: 'fixture',
    expectedTemplateIds: ['cover', 'page'],
    pageCount: [4, 4],
    palette: ['#888888'],
    requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

const execute = (template = templatesSource, hierarchy = hierarchySource) =>
    executeGallerySample(template, hierarchy, { childCount: 3 });

const galleryRoot = join(process.cwd(), 'gallery-samples');
const temporarySampleDirs: string[] = [];

const createTemporarySample = (complete = true) => {
    const directory = mkdtempSync(join(galleryRoot, 'harness-test-'));
    temporarySampleDirs.push(directory);
    writeFileSync(join(directory, 'templates.js'), templatesSource);
    writeFileSync(join(directory, 'hierarchy.js'), hierarchySource);
    if (complete) writeFileSync(join(directory, 'README.md'), '# Test sample\n');
    return { directory, slug: basename(directory) };
};

afterEach(() => {
    temporarySampleDirs.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }));
});

describe('gallery sample harness', () => {
    it('executes generator sources through template normalization', () => {
        const sample = execute();

        expect(sample.slug).toBe('fixture');
        expect(Object.keys(sample.templates)).toEqual(['cover', 'page']);
        expect(sample.templates.cover.layers).toHaveLength(1);
        expect(sample.nodes.root.children).toEqual(['start_here']);
        expect(sample.rootId).toBe('root');
        expect(validateGallerySample(sample, contract)).toEqual([]);
    });

    it('propagates config to the hierarchy generator', () => {
        const configurableHierarchy = hierarchySource.replace("title: 'Root'", "title: CONFIG.rootTitle || 'Root'");

        expect(executeGallerySample(templatesSource, configurableHierarchy, { rootTitle: 'Configured root' }).nodes.root.title)
            .toBe('Configured root');
    });

    it('discovers only complete immediate sample directories in lexical order', () => {
        const first = createTemporarySample();
        const second = createTemporarySample();
        const incomplete = createTemporarySample(false);
        const expected = [first.slug, second.slug].sort();

        expect(collectGallerySampleSlugs().filter(slug => slug.startsWith('harness-test-'))).toEqual(expected);
        expect(collectGallerySampleSlugs()).not.toContain(incomplete.slug);
    });

    it('loads and validates a controlled on-disk sample', () => {
        const { slug } = createTemporarySample();

        expect(expectValidGallerySample(slug, { ...contract, slug })).toMatchObject({ slug, rootId: 'root' });
    });

    it('reports broken parent, child, reference, and template type relationships', () => {
        const hierarchy = hierarchySource
            .replace("parentId: 'root', type: 'page'", "parentId: 'missing_parent', type: 'missing_type'")
            .replace("children: ['example_workspace', 'blank_workspace']", "children: ['example_workspace', 'missing_child']")
            .replace("data: {}, children: [] }\n};", "data: {}, children: [], referenceId: 'missing_reference' }\n};");

        expect(validateSharedGalleryInvariants(execute(templatesSource, hierarchy))).toEqual(expect.arrayContaining([
            expect.stringContaining("node 'start_here' parent 'missing_parent' does not exist"),
            expect.stringContaining("node 'start_here' child 'missing_child' does not exist"),
            expect.stringContaining("node 'blank_workspace' reference 'missing_reference' does not exist"),
            expect.stringContaining("node 'start_here' uses unknown template 'missing_type'"),
        ]));
    });

    it('reports duplicate element IDs', () => {
        const templates = templatesSource.replace("id: 'page_badge'", "id: 'cover_open'");

        expect(validateSharedGalleryInvariants(execute(templates))).toContain(
            "element id 'cover_open' is duplicated in templates 'cover' and 'page'",
        );
    });

    it('requires non-empty template and element IDs', () => {
        const sample = execute();
        sample.templates.cover.id = '';
        sample.templates.cover.elements[0].id = '';

        expect(validateSharedGalleryInvariants(sample)).toEqual(expect.arrayContaining([
            expect.stringContaining("template 'cover' id must be a non-empty string"),
            expect.stringContaining("template 'cover' element at index 0 id must be a non-empty string"),
        ]));
    });

    it('rejects IDs generated randomly by normalization', () => {
        const randomIdSource = templatesSource.replace("id: 'page_badge', ", '');

        expect(validateSharedGalleryInvariants(execute(randomIdSource))).toEqual(expect.arrayContaining([
            expect.stringContaining("template 'page' element at index 0 id is not deterministic"),
        ]));
    });

    it('checks computed element bounds for every rendered node', () => {
        const templates = templatesSource.replace("id: 'page_grid', type: 'grid', x: 20", "id: 'page_grid', type: 'grid', x: 400");

        expect(validateSharedGalleryInvariants(execute(templates))).toEqual(expect.arrayContaining([
            expect.stringContaining("template 'page' element 'page_grid' overflows width for node 'start_here'"),
            expect.stringContaining("template 'page' element 'page_grid' overflows width for node 'example_workspace'"),
        ]));
    });

    it('requires positive finite computed element bounds', () => {
        const templates = templatesSource.replace("id: 'cover_open', type: 'text', x: 20, y: 20, w: 200", "id: 'cover_open', type: 'text', x: 20, y: 20, w: 0");

        expect(validateSharedGalleryInvariants(execute(templates))).toContain(
            "template 'cover' element 'cover_open' has non-positive bounds for node 'root'",
        );
    });

    it('rejects grid border defaults and invalid explicit border values', () => {
        const templates = templatesSource
            .replace("gridBorderMode: 'all', ", '')
            .replace("gridBorderStyle: 'solid'", "gridBorderStyle: 'wavy'");

        expect(validateSharedGalleryInvariants(execute(templates))).toEqual(expect.arrayContaining([
            expect.stringContaining("page_grid gridBorderMode must be explicit"),
            expect.stringContaining("page_grid gridBorderStyle 'wavy' is invalid"),
        ]));
    });

    it('requires example data and matching template chrome throughout the example subtree', () => {
        const templates = templatesSource
            .replace("text: '{{example_label}}'", "text: 'Example'")
            .replace("linkTarget: 'specific_node', linkValue: 'blank_workspace'", "linkTarget: 'parent'");
        const hierarchy = hierarchySource.replace("example_label: 'EXAMPLE'", "example_label: 'Example'");

        expect(validateSharedGalleryInvariants(execute(templates, hierarchy))).toEqual(expect.arrayContaining([
            expect.stringContaining("node 'example_workspace' data.example_label must be 'EXAMPLE'"),
            expect.stringContaining("node 'example_workspace' template 'page' does not bind example_label"),
            expect.stringContaining("node 'example_workspace' template 'page' skip element must link to 'blank_workspace'"),
        ]));
    });

    it.each([
        {
            name: 'non-text example label',
            templates: templatesSource.replace("id: 'page_badge', type: 'text'", "id: 'page_badge', type: 'rect'"),
            error: "template 'page' does not have a visible text binding for example_label",
        },
        {
            name: 'zero-size example label',
            templates: templatesSource.replace("id: 'page_badge', type: 'text', x: 20, y: 20, w: 100", "id: 'page_badge', type: 'text', x: 20, y: 20, w: 0"),
            error: "template 'page' does not have a visible text binding for example_label",
        },
        {
            name: 'transparent skip label',
            templates: templatesSource.replace("id: 'page_skip', type: 'text'", "id: 'page_skip', type: 'text', opacity: 0"),
            error: "template 'page' does not have a visible text binding for skip_label",
        },
    ])('rejects $name chrome', ({ templates, error }) => {
        expect(validateSharedGalleryInvariants(execute(templates))).toEqual(expect.arrayContaining([
            expect.stringContaining(error),
        ]));
    });

    it.each([
        {
            name: 'example label on a hidden layer',
            configure: (sample: LoadedGallerySample) => {
                const badge = sample.templates.page.elements.find((element: any) => element.id === 'page_badge');
                sample.templates.page.layers.find((layer: any) => layer.id === badge.layerId).visible = false;
            },
            error: 'visible text binding for example_label',
        },
        {
            name: 'example label with a negative effective font size',
            configure: (sample: LoadedGallerySample) => {
                sample.templates.page.elements.find((element: any) => element.id === 'page_badge').fontSize = -1;
            },
            error: 'visible text binding for example_label',
        },
        {
            name: 'transparent skip text color',
            configure: (sample: LoadedGallerySample) => {
                sample.templates.page.elements.find((element: any) => element.id === 'page_skip').textColor = 'transparent';
            },
            error: 'visible text binding for skip_label',
        },
        {
            name: 'alpha-zero skip text color',
            configure: (sample: LoadedGallerySample) => {
                sample.templates.page.elements.find((element: any) => element.id === 'page_skip').textColor = '#12345600';
            },
            error: 'visible text binding for skip_label',
        },
        {
            name: 'skip text matching its solid background',
            configure: (sample: LoadedGallerySample) => {
                const skip = sample.templates.page.elements.find((element: any) => element.id === 'page_skip');
                skip.textColor = '#f5f0e5';
                skip.fill = '#F5F0E5';
            },
            error: 'visible text binding for skip_label',
        },
    ])('rejects $name', ({ configure, error }) => {
        const sample = execute();
        configure(sample);

        expect(validateSharedGalleryInvariants(sample)).toEqual(expect.arrayContaining([
            expect.stringContaining(error),
        ]));
    });

    it.each([
        { name: 'omitted', fontSize: undefined },
        { name: 'zero', fontSize: 0 },
    ])('accepts renderer-visible $name font size fallback', ({ fontSize }) => {
        const sample = execute();
        sample.templates.page.elements.find((element: any) => element.id === 'page_badge').fontSize = fontSize;
        sample.templates.page.elements.find((element: any) => element.id === 'page_skip').fontSize = fontSize;

        expect(validateSharedGalleryInvariants(sample)).toEqual([]);
    });

    it('requires rootId root and reports disconnected stable nodes', () => {
        const wrongRoot = execute();
        wrongRoot.rootId = 'start_here';
        const disconnected = execute();
        disconnected.nodes.root.children = [];

        expect(validateSharedGalleryInvariants(wrongRoot)).toContain("rootId must be 'root', received 'start_here'");
        expect(validateSharedGalleryInvariants(disconnected)).toEqual(expect.arrayContaining([
            "node 'start_here' is not reachable from root",
            "node 'example_workspace' is not reachable from root",
            "node 'blank_workspace' is not reachable from root",
        ]));
    });

    it('reports cycles reachable from root', () => {
        const sample = execute();
        sample.nodes.example_workspace.children = ['blank_workspace'];
        sample.nodes.blank_workspace.children = ['example_workspace'];

        expect(validateSharedGalleryInvariants(sample)).toEqual(expect.arrayContaining([
            expect.stringContaining('hierarchy cycle detected:'),
        ]));
    });

    it('aggregates malformed top-level fields without throwing', () => {
        const malformed = {
            slug: 'fixture',
            templateSource: undefined,
            hierarchySource: '',
            templates: undefined,
            nodes: null,
            rootId: undefined,
        } as unknown as LoadedGallerySample;

        expect(() => validateGallerySample(malformed, contract)).not.toThrow();
        expect(validateGallerySample(malformed, contract)).toEqual(expect.arrayContaining([
            'templates must be an object',
            'nodes must be an object',
            'rootId must be a non-empty string',
            'templateSource must be a string',
        ]));
    });

    it('rejects sibling links that are dead for any node rendered by a template', () => {
        const templates = templatesSource.replace(
            "linkTarget: 'specific_node', linkValue: 'blank_workspace'",
            "linkTarget: 'sibling', linkValue: '1'",
        );

        expect(validateSharedGalleryInvariants(execute(templates))).toEqual(expect.arrayContaining([
            expect.stringContaining("element 'page_skip' sibling offset 1 does not resolve for node 'start_here'"),
            expect.stringContaining("element 'page_skip' sibling offset 1 does not resolve for node 'blank_workspace'"),
        ]));
    });

    it('rejects invalid child indexes for every node rendered by a template', () => {
        const templates = templatesSource.replace(
            "linkTarget: 'specific_node', linkValue: 'blank_workspace'",
            "linkTarget: 'child_index', linkValue: '9'",
        );

        expect(validateSharedGalleryInvariants(execute(templates))).toEqual(expect.arrayContaining([
            expect.stringContaining("element 'page_skip' child index 9 does not resolve for node 'start_here'"),
            expect.stringContaining("element 'page_skip' child index 9 does not resolve for node 'example_workspace'"),
        ]));
    });

    it('reports all contract-specific mismatches', () => {
        const badSample = execute();
        delete badSample.nodes.blank_workspace;
        const badContract: GallerySampleContract = {
            ...contract,
            slug: 'other',
            expectedTemplateIds: ['cover', 'missing'],
            pageCount: [5, 6],
            palette: ['#ffffff'],
        };

        expect(validateGallerySample(badSample, badContract)).toEqual(expect.arrayContaining([
            expect.stringContaining("sample slug 'fixture' does not match contract slug 'other'"),
            expect.stringContaining("expected template 'missing' is missing"),
            expect.stringContaining('page count 3 is outside 5-6'),
            expect.stringContaining("palette color '#ffffff' does not occur in template source"),
            expect.stringContaining("required stable node 'blank_workspace' is missing"),
        ]));
    });

    it('counts exported pages without reference wrappers', () => {
        const sample = execute();
        const exampleData = { example_label: 'EXAMPLE', skip_label: 'Skip to blank workspace →' };
        sample.nodes.example_workspace.children = ['answer'];
        sample.nodes.answer = {
            id: 'answer', parentId: 'example_workspace', type: 'page', title: 'Answer',
            data: exampleData, children: ['answer_wrapper'],
        };
        sample.nodes.answer_wrapper = {
            id: 'answer_wrapper', parentId: 'answer', referenceId: 'blank_workspace', type: 'page', title: 'Answer wrapper',
            data: exampleData, children: ['nested_answer_wrapper'],
        };
        sample.nodes.nested_answer_wrapper = {
            id: 'nested_answer_wrapper', parentId: 'answer_wrapper', referenceId: 'blank_workspace', type: 'page', title: 'Nested answer wrapper',
            data: exampleData, children: [],
        };
        const fivePageContract: GallerySampleContract = { ...contract, pageCount: [5, 5] };

        expect(validateGallerySample(sample, fivePageContract)).not.toEqual(expect.arrayContaining([
            expect.stringContaining('page count'),
        ]));

        sample.nodes.real_answer_page = {
            id: 'real_answer_page', parentId: 'answer', type: 'page', title: 'Real answer page',
            data: exampleData, children: [],
        };
        sample.nodes.answer.children.unshift('real_answer_page');

        expect(validateGallerySample(sample, fivePageContract)).toContain('page count 6 is outside 5-5');
    });

    it.each(['../archives', 'nested/sample', 'nested\\sample'])('rejects unsafe sample slug %s', (slug) => {
        expect(() => loadGallerySample(slug)).toThrow(/invalid gallery sample slug/i);
    });
});
