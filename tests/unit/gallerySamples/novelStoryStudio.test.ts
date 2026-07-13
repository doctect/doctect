import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { getElementBounds, traverseGridData } from '../../../components/canvas/elementBounds';
import { computePageOrder } from '../../../services/pdfService';
import {
    expectValidGallerySample,
    loadGallerySample,
    validateGallerySample,
    type GallerySampleContract,
} from '../../helpers/gallerySampleHarness';

const contract: GallerySampleContract = {
    slug: '07-novel-story-studio',
    expectedTemplateIds: [
        'cover', 'start', 'workspace', 'premise', 'structure', 'bank', 'character',
        'location', 'chapter_map', 'chapter', 'scene', 'scene_links', 'continuity', 'revision',
    ],
    pageCount: [220, 235],
    palette: ['#4a405c', '#b18b54', '#eee4d4'],
    requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

const exportedPageCount = (sample: ReturnType<typeof loadGallerySample>) =>
    computePageOrder({ rootId: sample.rootId, nodes: sample.nodes } as any).length;

const role = (sample: ReturnType<typeof loadGallerySample>, templateId: string, name: string) =>
    sample.templates[templateId].elements.find((element: any) => element.id.includes(`_${name}_`));

describe('Novel Story Studio gallery sample', () => {
    it('generates linked story-bible and manuscript planning pages', () => {
        const sample = expectValidGallerySample(contract.slug, contract);

        expect(exportedPageCount(sample)).toBe(226);
        expect(Object.values(sample.nodes).filter((node: any) =>
            node.id.startsWith('blank_chapter_') && node.type === 'chapter',
        )).toHaveLength(24);
        expect(Object.values(sample.nodes).filter((node: any) =>
            node.id.startsWith('blank_scene_') && node.type === 'scene',
        )).toHaveLength(72);
    });

    it('supports a one-act miniature story', () => {
        const sample = loadGallerySample(contract.slug, {
            actCount: 1,
            chaptersPerAct: 1,
            scenesPerChapter: 1,
            characterCount: 1,
            locationCount: 1,
        });

        expect(validateGallerySample(sample, { ...contract, pageCount: [39, 39] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(39);
        expect(sample.nodes.blank_workspace.children).toHaveLength(10);
        expect(sample.nodes.blank_chapter_map_01.children).toEqual(['blank_chapter_01_01']);
        expect(sample.nodes.blank_chapter_01_01.children).toEqual(['blank_scene_01_01_01']);
    });

    it('exports one Cast & Places companion per scene', () => {
        const defaults = loadGallerySample(contract.slug);
        const minimum = loadGallerySample(contract.slug, {
            actCount: 1,
            chaptersPerAct: 1,
            scenesPerChapter: 1,
            characterCount: 1,
            locationCount: 1,
        });
        const maximum = loadGallerySample(contract.slug, {
            actCount: 5,
            chaptersPerAct: 12,
            scenesPerChapter: 6,
            characterCount: 30,
            locationCount: 20,
        });

        expect(exportedPageCount(defaults)).toBe(226);
        expect(exportedPageCount(minimum)).toBe(39);
        expect(exportedPageCount(maximum)).toBe(872);
        expect(validateGallerySample(defaults, contract)).toEqual([]);
        expect(validateGallerySample(minimum, { ...contract, pageCount: [39, 39] })).toEqual([]);
        expect(validateGallerySample(maximum, { ...contract, pageCount: [872, 872] })).toEqual([]);
    });

    it('gives every scene one companion with ordered bank references', () => {
        const sample = loadGallerySample(contract.slug);
        const scenes = Object.values(sample.nodes).filter((node: any) => node.type === 'scene');

        scenes.forEach((scene: any) => {
            expect(scene.children, scene.id).toHaveLength(1);
            const links = sample.nodes[scene.children[0]];
            expect(links.type, scene.id).toBe('scene_links');
            expect(links.parentId, links.id).toBe(scene.id);
            expect(links.children, links.id).toHaveLength(2);
            expect(sample.nodes[links.children[0]].referenceId, links.id).toMatch(/character_bank$/);
            expect(sample.nodes[links.children[1]].referenceId, links.id).toMatch(/location_bank$/);
        });
    });

    it('traverses every canonical character and location from companion grids', () => {
        const defaults = loadGallerySample(contract.slug);
        const maximum = loadGallerySample(contract.slug, {
            actCount: 5,
            chaptersPerAct: 12,
            scenesPerChapter: 6,
            characterCount: 30,
            locationCount: 20,
        });
        expect(defaults.templates.scene_links).toBeDefined();
        const characterGrid = role(defaults, 'scene_links', 'character_grid');
        const locationGrid = role(defaults, 'scene_links', 'location_grid');

        expect(characterGrid.gridConfig).toMatchObject({
            cols: 3,
            sourceType: 'current',
            displayField: 'link_label',
            offsetMode: 'static',
            offsetStart: 0,
            traversalPath: [
                { sliceStart: 0, sliceCount: 1 },
                { sliceStart: 0 },
            ],
        });
        expect(locationGrid.gridConfig).toMatchObject({
            cols: 3,
            sourceType: 'current',
            displayField: 'link_label',
            offsetMode: 'static',
            offsetStart: 1,
            traversalPath: [
                { sliceStart: 1, sliceCount: 1 },
                { sliceStart: 0 },
            ],
        });

        const traversalCases: Array<[ReturnType<typeof loadGallerySample>, number, number]> = [
            [defaults, 12, 8],
            [maximum, 30, 20],
        ];
        traversalCases.forEach(([sample, characterCount, locationCount]) => {
            const links = sample.nodes[sample.nodes.blank_scene_01_01_01.children[0]];
            const characterIds = traverseGridData(
                [links.id],
                characterGrid.gridConfig.traversalPath,
                0,
                sample.nodes,
            );
            const locationIds = traverseGridData(
                [links.id],
                locationGrid.gridConfig.traversalPath,
                0,
                sample.nodes,
            );
            const characterBank = sample.nodes.blank_character_bank;
            const locationBank = sample.nodes.blank_location_bank;

            expect(characterIds).toHaveLength(characterCount);
            expect(characterIds[0]).toBe(characterBank.children[0]);
            expect(characterIds.at(-1)).toBe(characterBank.children.at(-1));
            expect(locationIds).toHaveLength(locationCount as number);
            expect(locationIds[0]).toBe(locationBank.children[0]);
            expect(locationIds.at(-1)).toBe(locationBank.children.at(-1));
        });
    });

    it('keeps maximum banks, maps, and navigation complete and in bounds', () => {
        const sample = loadGallerySample(contract.slug, {
            actCount: 5,
            chaptersPerAct: 12,
            scenesPerChapter: 6,
            characterCount: 30,
            locationCount: 20,
        });

        expect(validateGallerySample(sample, { ...contract, pageCount: [872, 872] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(872);
        expect(sample.nodes.blank_character_bank.children).toHaveLength(30);
        expect(sample.nodes.blank_location_bank.children).toHaveLength(20);
        expect(sample.nodes.blank_chapter_map_05.children).toHaveLength(12);
        expect(sample.nodes.blank_chapter_05_12.children).toHaveLength(6);
        expect(sample.nodes.blank_chapter_05_12.children.at(-1)).toBe('blank_scene_05_12_06');

        const reachable = new Set<string>();
        const pending = ['blank_workspace'];
        while (pending.length > 0) {
            const nodeId = pending.shift()!;
            if (reachable.has(nodeId)) continue;
            reachable.add(nodeId);
            const node = sample.nodes[nodeId];
            if (node.children.length > 0) {
                if (node.type === 'scene') {
                    expect(role(sample, node.type, 'cast_places')).toMatchObject({
                        linkTarget: 'child_index',
                        linkValue: '0',
                    });
                    pending.push(...node.children);
                    continue;
                }
                const grids = node.type === 'scene_links'
                    ? [role(sample, node.type, 'character_grid'), role(sample, node.type, 'location_grid')]
                    : [role(sample, node.type, 'navigator')];
                grids.forEach(grid => {
                    expect(grid, `${nodeId} grid`).toBeTruthy();
                    expect(grid.gridConfig.sourceType, `${nodeId} source`).toBe('current');
                    expect(grid.gridConfig.dataSliceCount, `${nodeId} truncation`).toBeUndefined();
                    const bounds = getElementBounds(grid, sample.nodes, node.id);
                    expect(grid.x + bounds.w, `${nodeId} width`).toBeLessThanOrEqual(509);
                    expect(grid.y + bounds.h, `${nodeId} height`).toBeLessThanOrEqual(615);
                });
                pending.push(...node.children);
            }
        }

        const blankPageIds = Object.keys(sample.nodes).filter(nodeId => nodeId.startsWith('blank_'));
        expect([...reachable].sort()).toEqual(blankPageIds.sort());
    });

    it.each([
        ['actCount', 0],
        ['actCount', 6],
        ['chaptersPerAct', 0],
        ['chaptersPerAct', 13],
        ['scenesPerChapter', 0],
        ['scenesPerChapter', 7],
        ['characterCount', 0],
        ['characterCount', 31],
        ['locationCount', 0],
        ['locationCount', 21],
        ['chaptersPerAct', 2.5],
    ])('rejects unsupported %s configuration %s', (key, value) => {
        expect(() => loadGallerySample(contract.slug, { [key]: value })).toThrow(/Story Atelier config/);
    });

    it('assembles one mystery chapter from three scenes and pre-linked story-bible banks', () => {
        const sample = loadGallerySample(contract.slug);
        const chapter = sample.nodes.example_chapter_01;
        const sceneIds = ['example_scene_01', 'example_scene_02', 'example_scene_03'];

        expect(chapter.children).toEqual(sceneIds);
        expect(sceneIds.map(id => sample.nodes[id].data)).toEqual([
            expect.objectContaining({
                goal: expect.stringMatching(/arrival ledger/i),
                conflict: expect.stringMatching(/clock/i),
                outcome: expect.stringMatching(/missing seven minutes/i),
                pov: 'Mara Venn / detective',
                setting: 'Northbridge railway platform',
            }),
            expect.objectContaining({
                goal: expect.stringMatching(/witness/i),
                conflict: expect.stringMatching(/contradicts/i),
                outcome: expect.stringMatching(/porter/i),
                pov: 'Mara Venn / detective',
                setting: 'Platform waiting room',
            }),
            expect.objectContaining({
                goal: expect.stringMatching(/reconstruct/i),
                conflict: expect.stringMatching(/last train/i),
                outcome: expect.stringMatching(/signal thread/i),
                pov: 'Mara Venn / detective',
                setting: 'Northbridge railway platform',
            }),
        ]);

        sceneIds.forEach(sceneId => {
            const links = sample.nodes[sample.nodes[sceneId].children[0]];
            const references = links.children.map((id: string) => sample.nodes[id]);
            expect(references.map((node: any) => node.referenceId)).toEqual([
                'example_character_bank',
                'example_location_bank',
            ]);
            references.forEach((reference: any) => {
                expect(reference.type).toBe('bank');
                expect(reference.parentId).toBe(links.id);
            });
        });
    });

    it('keeps all guided pages visibly bound to EXAMPLE and Skip chrome', () => {
        const sample = loadGallerySample(contract.slug);
        const pending = ['example_workspace'];
        const visited = new Set<string>();

        while (pending.length > 0) {
            const id = pending.shift()!;
            if (visited.has(id)) continue;
            visited.add(id);
            const node = sample.nodes[id];
            expect(node.data.example_label, id).toBe('EXAMPLE');
            expect(node.data.skip_label, id).toBe('Skip to blank workspace →');
            const template = sample.templates[node.type];
            expect(template.elements.some((element: any) =>
                element.type === 'text' && element.dataBinding === 'example_label',
            ), `${id} badge`).toBe(true);
            expect(template.elements.some((element: any) =>
                element.type === 'text'
                && element.dataBinding === 'skip_label'
                && element.linkTarget === 'specific_node'
                && element.linkValue === 'blank_workspace',
            ), `${id} skip`).toBe(true);
            pending.push(...node.children);
        }
        expect(visited.size).toBe(27);
    });

    it('keeps blank writable data clean', () => {
        const sample = loadGallerySample(contract.slug);
        const writable = /^(logline|promise|stakes|question|opening|turn|crisis|climax|resolution|role|want|need|secret|voice|appearance|history|sensory|function|change|goal|conflict|outcome|pov|setting|story_time|continuity|beat_\d+|check_\d+|notes|pass_goal|findings|actions)$/;

        Object.values(sample.nodes)
            .filter((node: any) => node.id.startsWith('blank_'))
            .forEach((node: any) => {
                Object.entries(node.data).forEach(([field, value]) => {
                    if (writable.test(field)) expect(value, `${node.id}.${field}`).toBe('');
                });
            });
    });

    it('fits maximum hierarchy labels in their navigation cards', () => {
        const sample = loadGallerySample(contract.slug, {
            actCount: 5,
            chaptersPerAct: 12,
            scenesPerChapter: 6,
            characterCount: 30,
            locationCount: 20,
        });
        const pdf = new jsPDF({ unit: 'pt', format: [509, 679] });

        ['workspace', 'bank', 'chapter_map', 'chapter'].forEach(templateId => {
            const navigator = role(sample, templateId, 'navigator');
            pdf.setFont(navigator.fontFamily, navigator.fontWeight || 'normal');
            pdf.setFontSize(navigator.fontSize);
            Object.values(sample.nodes)
                .filter((node: any) => node.type === templateId)
                .flatMap((node: any) => node.children.map((childId: string) => sample.nodes[childId]))
                .forEach((child: any) => {
                    expect(child.data.menu_label, child.id).toBeTruthy();
                    expect(pdf.getTextWidth(child.data.menu_label), child.id).toBeLessThanOrEqual(navigator.w - 12);
                });
        });
    });

    it('fits numbered canonical labels inside companion cells', () => {
        const defaults = loadGallerySample(contract.slug);
        const maximum = loadGallerySample(contract.slug, {
            actCount: 5,
            chaptersPerAct: 12,
            scenesPerChapter: 6,
            characterCount: 30,
            locationCount: 20,
        });
        const pdf = new jsPDF({ unit: 'pt', format: [509, 679] });

        [defaults, maximum].forEach(sample => {
            expect(sample.templates.scene_links).toBeDefined();
            [
                ['character', role(sample, 'scene_links', 'character_grid')],
                ['location', role(sample, 'scene_links', 'location_grid')],
            ].forEach(([templateId, companionGrid]) => {
                pdf.setFont(companionGrid.fontFamily, companionGrid.fontWeight || 'normal');
                pdf.setFontSize(companionGrid.fontSize);
                Object.values(sample.nodes)
                    .filter((node: any) => node.type === templateId && !node.referenceId)
                    .forEach((node: any) => {
                        expect(node.data.link_label, node.id).toBeTruthy();
                        expect(pdf.getTextWidth(node.data.link_label), node.id)
                            .toBeLessThanOrEqual(companionGrid.w - 8);
                    });
            });
        });
    });

    it('exports companions once while retaining one copy of every canonical record', () => {
        const sample = loadGallerySample(contract.slug);
        const pageOrder = computePageOrder({ rootId: sample.rootId, nodes: sample.nodes } as any);
        const scenes = Object.values(sample.nodes).filter((node: any) => node.type === 'scene');
        const sceneLinks = Object.values(sample.nodes).filter((node: any) => node.type === 'scene_links');
        const bankReferences = sceneLinks.flatMap((node: any) => node.children);
        const canonicalRecords = Object.values(sample.nodes)
            .filter((node: any) => ['character', 'location'].includes(node.type) && !node.referenceId);

        expect(sceneLinks).toHaveLength(scenes.length);
        sceneLinks.forEach((node: any) => {
            expect(pageOrder.filter(id => id === node.id), node.id).toHaveLength(1);
        });
        bankReferences.forEach((id: string) => {
            expect(pageOrder, id).not.toContain(id);
        });
        canonicalRecords.forEach((node: any) => {
            expect(pageOrder.filter(id => id === node.id), node.id).toHaveLength(1);
        });
    });

    it('keeps maximum companion grids at their designed bounds', () => {
        const sample = loadGallerySample(contract.slug, {
            actCount: 5,
            chaptersPerAct: 12,
            scenesPerChapter: 6,
            characterCount: 30,
            locationCount: 20,
        });
        const linksId = sample.nodes.blank_scene_01_01_01.children[0];
        expect(sample.templates.scene_links).toBeDefined();
        const characterGrid = role(sample, 'scene_links', 'character_grid');
        const locationGrid = role(sample, 'scene_links', 'location_grid');

        expect(characterGrid.y + getElementBounds(characterGrid, sample.nodes, linksId).h).toBe(382);
        expect(locationGrid.y + getElementBounds(locationGrid, sample.nodes, linksId).h).toBe(562);
    });

    it('provides PDF-visible scene writing regions and intentional non-doubled grids', () => {
        const sample = loadGallerySample(contract.slug);

        ['premise', 'structure', 'character', 'location', 'chapter', 'scene', 'continuity', 'revision']
            .forEach(templateId => {
                const writingRegions = sample.templates[templateId].elements.filter((element: any) =>
                    element.type === 'rect' && element.id.includes('_writing_'),
                );
                expect(writingRegions.length, templateId).toBeGreaterThan(0);
                writingRegions.forEach((region: any) => {
                    expect(region.fill, region.id).toBe('#fffaf3');
                    expect(region.opacity, region.id).toBeGreaterThan(0);
                    expect(region.w, region.id).toBeGreaterThanOrEqual(120);
                    expect(region.h, region.id).toBeGreaterThanOrEqual(34);
                    expect(region.stroke, region.id).toBe('');
                    expect(region.strokeWidth, region.id).toBe(0);
                });
            });

        Object.values(sample.templates).forEach((template: any) => {
            template.elements.filter((element: any) => element.type === 'grid').forEach((grid: any) => {
                expect(grid.gridConfig).toMatchObject({
                    gridBorderMode: 'all',
                    gridBorderStyle: 'solid',
                    gridBorderColor: '#4a405c',
                    gridBorderWidth: 0.8,
                });
                expect(grid.stroke, grid.id).toBe('');
                expect(grid.strokeWidth, grid.id).toBe(0);
            });
        });
    });

    it('uses newly authored thread and manuscript-page SVG motifs', () => {
        const sample = loadGallerySample(contract.slug);
        const artwork = sample.templates.cover.elements.find((element: any) => element.type === 'svg');

        expect(artwork.svgContent).toMatch(/id="thread"/);
        expect(artwork.svgContent).toMatch(/id="pages"/);
        expect(artwork.svgContent).toMatch(/id="stitches"/);
        expect(artwork.svgContent).toContain('<path');
        expect(artwork.svgContent).toContain('<rect');
    });
});
