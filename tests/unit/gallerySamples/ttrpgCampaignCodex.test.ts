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
    slug: '08-ttrpg-campaign-codex',
    expectedTemplateIds: [
        'cover', 'start', 'workspace', 'campaign', 'bank', 'party', 'character',
        'session', 'quest', 'npc', 'location', 'faction', 'encounter', 'lore',
    ],
    pageCount: [90, 125],
    palette: ['#783f38', '#667153', '#e8dcc7'],
    requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

const exportedPages = (sample: ReturnType<typeof loadGallerySample>) =>
    computePageOrder({ rootId: sample.rootId, nodes: sample.nodes } as any);

const role = (sample: ReturnType<typeof loadGallerySample>, templateId: string, name: string) =>
    sample.templates[templateId].elements.find((element: any) => element.id.includes(`_${name}_`));

describe('TTRPG Campaign Codex gallery sample', () => {
    it('generates a cross-referenced campaign codex', () => {
        const sample = expectValidGallerySample(contract.slug, contract);

        expect(exportedPages(sample)).toHaveLength(125);
        expect(sample.nodes.blank_party.children).toHaveLength(5);
        expect(sample.nodes.blank_session_bank.children).toHaveLength(16);
        expect(sample.nodes.blank_quest_bank.children).toHaveLength(12);
        expect(sample.nodes.blank_npc_bank.children).toHaveLength(20);
        expect(sample.nodes.blank_location_bank.children).toHaveLength(12);
        expect(sample.nodes.blank_faction_bank.children).toHaveLength(8);
        expect(sample.nodes.blank_encounter_bank.children).toHaveLength(12);
        expect(sample.nodes.blank_lore_bank.children).toHaveLength(8);
    });

    it('supports minimum campaign banks', () => {
        const sample = loadGallerySample(contract.slug, {
            partySize: 1,
            sessionCount: 1,
            questCount: 1,
            npcCount: 1,
            locationCount: 1,
            factionCount: 1,
            encounterCount: 1,
            loreCount: 1,
        });

        expect(validateGallerySample(sample, { ...contract, pageCount: [22, 42] })).toEqual([]);
        expect(exportedPages(sample)).toHaveLength(40);
        expect(sample.nodes.blank_workspace.children).toEqual([
            'blank_campaign',
            'blank_party',
            'blank_session_bank',
            'blank_quest_bank',
            'blank_npc_bank',
            'blank_location_bank',
            'blank_faction_bank',
            'blank_encounter_bank',
            'blank_lore_bank',
        ]);
    });

    it('keeps maximum banks complete, reachable, and in bounds', () => {
        const sample = loadGallerySample(contract.slug, {
            partySize: 8,
            sessionCount: 32,
            questCount: 24,
            npcCount: 32,
            locationCount: 24,
            factionCount: 16,
            encounterCount: 24,
            loreCount: 16,
        });

        expect(validateGallerySample(sample, { ...contract, pageCount: [208, 208] })).toEqual([]);
        expect(exportedPages(sample)).toHaveLength(208);
        expect(sample.nodes.blank_party.children.at(-1)).toBe('blank_character_08');
        expect(sample.nodes.blank_session_bank.children.at(-1)).toBe('blank_session_32');
        expect(sample.nodes.blank_npc_bank.children.at(-1)).toBe('blank_npc_32');
        expect(sample.nodes.blank_encounter_bank.children.at(-1)).toBe('blank_encounter_24');

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
        ['partySize', 0],
        ['partySize', 9],
        ['sessionCount', 0],
        ['sessionCount', 33],
        ['questCount', 25],
        ['npcCount', 33],
        ['locationCount', 25],
        ['factionCount', 17],
        ['encounterCount', 25],
        ['loreCount', 17],
        ['sessionCount', 2.5],
    ])('rejects unsupported %s configuration %s', (key, value) => {
        expect(() => loadGallerySample(contract.slug, { [key]: value })).toThrow(/Campaign Codex config/);
    });

    it('links one guided session to canonical adventure records through references', () => {
        const sample = loadGallerySample(contract.slug);
        const session = sample.nodes.example_session_01;
        const expectedTargets = [
            'example_quest_ashen_bell',
            'example_npc_iora_vale',
            'example_location_briar_watch',
            'example_faction_greenwardens',
            'example_encounter_bell_vault',
        ];
        const references = session.children.map((id: string) => sample.nodes[id]);

        expect(references.map((node: any) => node.referenceId)).toEqual(expectedTargets);
        references.forEach((reference: any) => {
            expect(reference.type).toBe(sample.nodes[reference.referenceId].type);
            expect(reference.parentId).toBe(session.id);
            expect(reference.data.menu_label).toBeTruthy();
        });
        expect(session.data).toMatchObject({
            consequence: expect.stringMatching(/Greenwardens/i),
            outcome: expect.stringMatching(/bell/i),
        });
    });

    it('exports canonical guided records once and omits reference wrappers', () => {
        const sample = loadGallerySample(contract.slug);
        const pages = exportedPages(sample);
        const targetIds = sample.nodes.example_session_01.children
            .map((id: string) => sample.nodes[id].referenceId);

        targetIds.forEach((targetId: string) => {
            expect(pages.filter(id => id === targetId), targetId).toHaveLength(1);
        });
        sample.nodes.example_session_01.children.forEach((referenceId: string) => {
            expect(pages, referenceId).not.toContain(referenceId);
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
        expect(visited.size).toBe(25);
    });

    it('keeps blank writable data clean', () => {
        const sample = loadGallerySample(contract.slug);
        const writable = /^(premise|tone|safety|arc|calendar|notes|group_goal|resources|player|ancestry_class|level|hooks|bonds|abilities|date|recap|opening|beats|decisions|consequence|outcome|next_steps|status|patron|objective|stakes|clues|obstacles|progress|role|demeanor|desire|leverage|voice|relationship|secrets|region|atmosphere|features|hazards|routes|discoveries|reputation|agenda|pressure|setup|environment|adversaries|aftermath|category|truth|known_by|evidence|implications)$/;

        Object.values(sample.nodes)
            .filter((node: any) => node.id.startsWith('blank_'))
            .forEach((node: any) => {
                Object.entries(node.data).forEach(([field, value]) => {
                    if (writable.test(field)) expect(value, `${node.id}.${field}`).toBe('');
                });
            });
    });

    it('fits maximum bank labels in navigation cards', () => {
        const sample = loadGallerySample(contract.slug, {
            partySize: 8,
            sessionCount: 32,
            questCount: 24,
            npcCount: 32,
            locationCount: 24,
            factionCount: 16,
            encounterCount: 24,
            loreCount: 16,
        });
        const pdf = new jsPDF({ unit: 'pt', format: [509, 679] });

        ['workspace', 'party', 'bank', 'session'].forEach(templateId => {
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

    it('provides PDF-visible writing regions and intentional non-doubled grids', () => {
        const sample = loadGallerySample(contract.slug);

        ['campaign', 'party', 'character', 'session', 'quest', 'npc', 'location', 'faction', 'encounter', 'lore']
            .forEach(templateId => {
                const writingRegions = sample.templates[templateId].elements.filter((element: any) =>
                    element.type === 'rect' && element.id.includes('_writing_'),
                );
                expect(writingRegions.length, templateId).toBeGreaterThan(0);
                writingRegions.forEach((region: any) => {
                    expect(region.fill, region.id).toBe('#fffaf0');
                    expect(region.opacity, region.id).toBeGreaterThan(0);
                    expect(region.w, region.id).toBeGreaterThanOrEqual(104);
                    expect(region.h, region.id).toBeGreaterThanOrEqual(32);
                    expect(region.stroke, region.id).toBe('');
                    expect(region.strokeWidth, region.id).toBe(0);
                });
            });

        Object.values(sample.templates).forEach((template: any) => {
            template.elements.filter((element: any) => element.type === 'grid').forEach((grid: any) => {
                expect(grid.gridConfig).toMatchObject({
                    gridBorderMode: 'all',
                    gridBorderStyle: 'solid',
                    gridBorderColor: '#783f38',
                    gridBorderWidth: 0.8,
                });
                expect(grid.stroke, grid.id).toBe('');
                expect(grid.strokeWidth, grid.id).toBe(0);
            });
        });
    });

    it('draws the faction reputation scale with single non-overlapping edges', () => {
        const sample = loadGallerySample(contract.slug);
        const elements = sample.templates.faction.elements;
        const cells = elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_reputation_cell_'),
        );
        const boundary = elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_reputation_boundary_'),
        );
        const dividers = elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_reputation_divider_'),
        );

        expect(cells).toHaveLength(7);
        cells.forEach((cell: any) => {
            expect(cell.fill, cell.id).not.toBe('');
            expect(cell.stroke, cell.id).toBe('');
            expect(cell.strokeWidth, cell.id).toBe(0);
        });
        expect(boundary).toHaveLength(1);
        expect(boundary[0]).toMatchObject({ fill: '', stroke: '#783f38', strokeWidth: 0.8 });
        expect(dividers).toHaveLength(6);
        expect(new Set(dividers.map((line: any) => [line.x, line.y, line.w, line.h].join(':'))).size).toBe(6);
        expect(dividers.every((line: any) => line.w === 0.8 && line.h === 38)).toBe(true);
    });

    it('uses newly authored heraldic, die, and route SVG geometry', () => {
        const sample = loadGallerySample(contract.slug);
        const artwork = sample.templates.cover.elements.find((element: any) => element.type === 'svg');

        expect(artwork.svgContent).toMatch(/id="heraldry"/);
        expect(artwork.svgContent).toMatch(/id="die"/);
        expect(artwork.svgContent).toMatch(/id="route"/);
        expect(artwork.svgContent).toContain('<path');
        expect(artwork.svgContent).toContain('<polygon');
        expect(artwork.svgContent).toContain('<circle');
    });
});
