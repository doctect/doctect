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
    slug: '06-travel-field-journal',
    expectedTemplateIds: [
        'cover', 'start', 'workspace', 'trip', 'reservations', 'reservation',
        'itinerary', 'day', 'packing', 'expenses', 'highlights',
    ],
    pageCount: [45, 70],
    palette: ['#356f66', '#b46148', '#eadbc2'],
    requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

const exportedPageCount = (sample: ReturnType<typeof loadGallerySample>) =>
    computePageOrder({ rootId: sample.rootId, nodes: sample.nodes } as any).length;

const role = (sample: ReturnType<typeof loadGallerySample>, templateId: string, name: string) =>
    sample.templates[templateId].elements.find((element: any) => element.id.includes(`_${name}_`));

describe('Travel Field Journal gallery sample', () => {
    it('generates linked planning and field-note sections', () => {
        const sample = expectValidGallerySample(contract.slug, contract);

        expect(exportedPageCount(sample)).toBe(55);
        expect(Object.values(sample.nodes).filter((node: any) =>
            node.id.startsWith('blank_trip_') && node.type === 'trip',
        )).toHaveLength(3);
    });

    it('supports one one-day trip without reservations', () => {
        const sample = loadGallerySample(contract.slug, {
            tripCount: 1,
            daysPerTrip: 1,
            reservationsPerTrip: 0,
        });

        expect(validateGallerySample(sample, { ...contract, pageCount: [15, 30] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(23);
        expect(sample.nodes.blank_trip_01_reservations.children).toEqual([]);
        expect(sample.nodes.blank_trip_01.children).toContain('blank_trip_01_reservations');
        expect(sample.nodes.blank_trip_01_reservations.data.empty_state).toMatch(/no reservations yet/i);
    });

    it('keeps maximum trip, day, reservation, and card layouts in bounds', () => {
        const sample = loadGallerySample(contract.slug, {
            tripCount: 6,
            daysPerTrip: 21,
            reservationsPerTrip: 8,
        });

        expect(validateGallerySample(sample, { ...contract, pageCount: [220, 235] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(226);
        expect(sample.nodes.blank_workspace.children).toHaveLength(6);

        const terminalTrip = sample.nodes.blank_trip_06;
        const terminalReservations = sample.nodes.blank_trip_06_reservations;
        const terminalItinerary = sample.nodes.blank_trip_06_itinerary;
        expect(terminalReservations.children).toHaveLength(8);
        expect(terminalReservations.children.at(-1)).toBe('blank_trip_06_reservation_08');
        expect(terminalItinerary.children).toHaveLength(21);
        expect(terminalItinerary.children.at(-1)).toBe('blank_trip_06_day_21');
        expect(terminalTrip.children).toEqual([
            'blank_trip_06_reservations',
            'blank_trip_06_itinerary',
            'blank_trip_06_packing',
            'blank_trip_06_expenses',
            'blank_trip_06_highlights',
        ]);

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
                pending.push(...node.children);
            }
        }
        const blankPageIds = Object.keys(sample.nodes).filter(nodeId => nodeId.startsWith('blank_'));
        expect([...reachable].sort()).toEqual(blankPageIds.sort());
        expect(reachable.has('blank_trip_06_reservation_08')).toBe(true);
        expect(reachable.has('blank_trip_06_day_21')).toBe(true);

        Object.values(sample.nodes)
            .filter((node: any) => ['workspace', 'trip', 'reservations', 'itinerary'].includes(node.type))
            .forEach((node: any) => {
                const navigator = role(sample, node.type, 'navigator');
                if (!navigator) return;
                const bounds = getElementBounds(navigator, sample.nodes, node.id);
                expect(navigator.x + bounds.w, `${node.id} width`).toBeLessThanOrEqual(509);
                expect(navigator.y + bounds.h, `${node.id} height`).toBeLessThanOrEqual(615);
            });
    });

    it.each([
        ['tripCount', 0],
        ['tripCount', 7],
        ['daysPerTrip', 0],
        ['daysPerTrip', 22],
        ['reservationsPerTrip', -1],
        ['reservationsPerTrip', 9],
        ['daysPerTrip', 2.5],
    ])('rejects unsupported %s configuration %s', (key, value) => {
        expect(() => loadGallerySample(contract.slug, { [key]: value })).toThrow(/Field Notes config/);
    });

    it('guides a clearly fictional Lisbon stay through lodging, transit, and three days', () => {
        const sample = loadGallerySample(contract.slug);
        const lodging = sample.nodes.example_reservation_lodging;
        const transit = sample.nodes.example_reservation_transit;
        const itinerary = sample.nodes.example_itinerary;
        const days = itinerary.children.map((id: string) => sample.nodes[id]);
        const guidedData = JSON.stringify(Object.values(sample.nodes)
            .filter((node: any) => node.data.example_label === 'EXAMPLE')
            .map((node: any) => node.data));

        expect(lodging.data).toMatchObject({
            kind: 'LODGING',
            provider: 'Miradouro House (fictional)',
            booking_reference: 'Not included - fictional example',
        });
        expect(transit.data).toMatchObject({
            kind: 'TRANSIT',
            provider: 'Tejo Loop Transit (fictional)',
            booking_reference: 'Not required - fictional example',
        });
        expect(days).toHaveLength(3);
        expect(days.map((day: any) => day.data.date_label)).toEqual([
            'DAY 01 / BAIXA + ALFAMA',
            'DAY 02 / BELÉM + AJUDA',
            'DAY 03 / ESTRELA + RIVER',
        ]);
        expect(days.every((day: any) => day.data.timeline && day.data.field_notes)).toBe(true);
        expect(guidedData).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|passport\s*[:#]|ticket\s*(number|#)\s*[:=]/i);
        expect(guidedData).not.toMatch(/Lisbon Metro|Carris/i);
    });

    it('keeps every trip dashboard destination complete and semantically stable', () => {
        const sample = loadGallerySample(contract.slug, {
            tripCount: 6,
            daysPerTrip: 21,
            reservationsPerTrip: 0,
        });
        const dashboardGrid = role(sample, 'trip', 'navigator');

        expect(dashboardGrid.gridConfig.displayField).toBe('menu_label');
        expect(sample.templates.trip.elements.some((element: any) => element.linkTarget === 'child_index')).toBe(false);

        for (let trip = 1; trip <= 6; trip += 1) {
            const prefix = `blank_trip_${String(trip).padStart(2, '0')}`;
            expect(sample.nodes[prefix].children).toEqual([
                `${prefix}_reservations`,
                `${prefix}_itinerary`,
                `${prefix}_packing`,
                `${prefix}_expenses`,
                `${prefix}_highlights`,
            ]);
            sample.nodes[prefix].children.forEach((destinationId: string) => {
                expect(sample.nodes[destinationId], destinationId).toBeTruthy();
                expect(sample.nodes[destinationId].data.menu_label, destinationId).toBeTruthy();
            });
        }
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
            pending.push(...node.children);
        }
        expect(visited.size).toBe(13);
    });

    it('keeps blank writable data clean', () => {
        const sample = loadGallerySample(contract.slug);
        const writable = /^(destination|dates|base|travel_note|kind|provider|address|arrival|departure|booking_reference|contact|notes|date_label|timeline|field_notes|weather|moment|pack_\d+|day_\d+|item_\d+|amount_\d+|category_\d+|expense_note|highlight_\d+|bring_home|next_time)$/;

        Object.values(sample.nodes)
            .filter((node: any) => node.id.startsWith('blank_'))
            .forEach((node: any) => {
                Object.entries(node.data).forEach(([field, value]) => {
                    if (writable.test(field)) expect(value, `${node.id}.${field}`).toBe('');
                });
            });
    });

    it('fits long safe labels in itinerary and dashboard cards', () => {
        const sample = loadGallerySample(contract.slug, {
            tripCount: 6,
            daysPerTrip: 21,
            reservationsPerTrip: 8,
        });
        const pdf = new jsPDF({ unit: 'pt', format: [509, 679] });

        ['workspace', 'trip', 'reservations', 'itinerary'].forEach(templateId => {
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

        ['day', 'packing', 'expenses', 'highlights'].forEach(templateId => {
            const writingRegions = sample.templates[templateId].elements.filter((element: any) =>
                element.type === 'rect' && element.id.includes('_writing_'),
            );
            expect(writingRegions.length, templateId).toBeGreaterThan(0);
            writingRegions.forEach((region: any) => {
                expect(region.fill, region.id).toBe('#fffaf1');
                expect(region.opacity, region.id).toBeGreaterThan(0);
                expect(region.w, region.id).toBeGreaterThanOrEqual(120);
                expect(region.h, region.id).toBeGreaterThanOrEqual(40);
            });
        });

        ['itinerary', 'expenses'].forEach(templateId => {
            const grids = sample.templates[templateId].elements.filter((element: any) => element.type === 'grid');
            expect(grids.length, templateId).toBeGreaterThan(0);
            grids.forEach((grid: any) => {
                expect(grid.gridConfig).toMatchObject({
                    gridBorderMode: 'all',
                    gridBorderStyle: 'solid',
                    gridBorderColor: '#356f66',
                    gridBorderWidth: 0.8,
                });
                expect(grid.stroke, grid.id).toBe('');
                expect(grid.strokeWidth, grid.id).toBe(0);
            });
        });
    });

    it('draws every expense table edge exactly once around fill-only cells', () => {
        const sample = loadGallerySample(contract.slug);
        const elements = sample.templates.expenses.elements;
        const cells = elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_table_cell_'),
        );
        const boundaries = elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_table_boundary_'),
        );
        const vertical = elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_table_line_ledger_vertical_'),
        );
        const horizontal = elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_table_line_ledger_horizontal_'),
        );
        const segmentKey = (line: any) => [line.x, line.y, line.w, line.h].join(':');

        expect(cells).toHaveLength(36);
        cells.forEach((cell: any) => {
            expect(cell.fill, cell.id).not.toBe('');
            expect(cell.stroke, cell.id).toBe('');
            expect(cell.strokeWidth, cell.id).toBe(0);
        });

        expect(boundaries).toHaveLength(1);
        expect(boundaries[0]).toMatchObject({
            x: 34,
            y: 220,
            w: 447,
            h: 288,
            fill: '',
            stroke: '#9e988b',
            strokeWidth: 0.8,
        });
        expect(vertical).toHaveLength(3);
        expect(horizontal).toHaveLength(8);
        expect(vertical.map((line: any) => line.x)).toEqual([107.6, 290.6, 390.6]);
        expect(vertical.every((line: any) => line.y === 220 && line.w === 0.8 && line.h === 288)).toBe(true);
        expect(horizontal.map((line: any) => line.y)).toEqual([
            251.6, 283.6, 315.6, 347.6, 379.6, 411.6, 443.6, 475.6,
        ]);
        expect(horizontal.every((line: any) => line.x === 34 && line.w === 447 && line.h === 0.8)).toBe(true);

        const segments = [...vertical, ...horizontal].map(segmentKey);
        expect(new Set(segments).size).toBe(segments.length);
    });

    it('uses newly authored route, compass, and topographic SVG motifs', () => {
        const sample = loadGallerySample(contract.slug);
        const artwork = sample.templates.cover.elements.find((element: any) => element.type === 'svg');

        expect(artwork.svgContent).toMatch(/id="route"/);
        expect(artwork.svgContent).toMatch(/id="compass"/);
        expect(artwork.svgContent).toMatch(/id="contours"/);
        expect(artwork.svgContent).toContain('<path');
        expect(artwork.svgContent).toContain('<circle');
    });
});
