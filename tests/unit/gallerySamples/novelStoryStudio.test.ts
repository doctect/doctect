import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { getElementBounds } from '../../../components/canvas/elementBounds';
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
        'location', 'chapter_map', 'chapter', 'scene', 'continuity', 'revision',
    ],
    pageCount: [120, 155],
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

        expect(exportedPageCount(sample)).toBe(151);
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

        expect(validateGallerySample(sample, { ...contract, pageCount: [18, 35] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(35);
        expect(sample.nodes.blank_workspace.children).toHaveLength(10);
        expect(sample.nodes.blank_chapter_map_01.children).toEqual(['blank_chapter_01_01']);
        expect(sample.nodes.blank_chapter_01_01.children).toEqual(['blank_scene_01_01_01']);
    });

    it('keeps maximum banks, maps, and navigation complete and in bounds', () => {
        const sample = loadGallerySample(contract.slug, {
            actCount: 5,
            chaptersPerAct: 12,
            scenesPerChapter: 6,
            characterCount: 30,
            locationCount: 20,
        });

        expect(validateGallerySample(sample, { ...contract, pageCount: [509, 509] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(509);
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
                const navigator = role(sample, node.type, 'navigator');
                expect(navigator, `${nodeId} navigator`).toBeTruthy();
                expect(navigator.gridConfig.sourceType, `${nodeId} source`).toBe('current');
                expect(navigator.gridConfig.dataSliceCount, `${nodeId} truncation`).toBeUndefined();
                const bounds = getElementBounds(navigator, sample.nodes, node.id);
                expect(navigator.x + bounds.w, `${nodeId} width`).toBeLessThanOrEqual(509);
                expect(navigator.y + bounds.h, `${nodeId} height`).toBeLessThanOrEqual(615);
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

    it('assembles one mystery chapter from three scenes and referenced story-bible records', () => {
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

        const expectedTargets: Record<string, string[]> = {
            example_scene_01: ['example_character_detective', 'example_location_platform'],
            example_scene_02: ['example_character_detective', 'example_character_witness', 'example_location_platform'],
            example_scene_03: ['example_character_detective', 'example_character_witness', 'example_location_platform'],
        };
        Object.entries(expectedTargets).forEach(([sceneId, targets]) => {
            const references = sample.nodes[sceneId].children.map((id: string) => sample.nodes[id]);
            expect(references.map((node: any) => node.referenceId)).toEqual(targets);
            references.forEach((reference: any) => {
                expect(reference.type).toBe(sample.nodes[reference.referenceId].type);
                expect(reference.parentId).toBe(sceneId);
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
        expect(visited.size).toBe(26);
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

    it('fits maximum bank and scene labels in their navigation cards', () => {
        const sample = loadGallerySample(contract.slug, {
            actCount: 5,
            chaptersPerAct: 12,
            scenesPerChapter: 6,
            characterCount: 30,
            locationCount: 20,
        });
        const pdf = new jsPDF({ unit: 'pt', format: [509, 679] });

        ['workspace', 'bank', 'chapter_map', 'chapter', 'scene'].forEach(templateId => {
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
