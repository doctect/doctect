import { describe, expect, it } from 'vitest';
import { getElementBounds } from '../../../components/canvas/elementBounds';
import { computePageOrder } from '../../../services/pdfService';
import {
    expectValidGallerySample,
    loadGallerySample,
    validateGallerySample,
    type GallerySampleContract,
} from '../../helpers/gallerySampleHarness';

const contract: GallerySampleContract = {
    slug: '04-wellness-fitness-journal',
    expectedTemplateIds: [
        'cover',
        'start',
        'workspace',
        'baseline',
        'month_habits',
        'week',
        'workout',
        'recovery',
        'month_reflection',
    ],
    pageCount: [180, 220],
    palette: ['#a96551', '#7f9473', '#f1e7df'],
    requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

const exportedPageCount = (sample: ReturnType<typeof loadGallerySample>) =>
    computePageOrder({ rootId: sample.rootId, nodes: sample.nodes } as any).length;

const role = (sample: ReturnType<typeof loadGallerySample>, templateId: string, name: string) =>
    sample.templates[templateId].elements.find((element: any) => element.id.includes(`_${name}_`));

describe('Wellness & Fitness Journal gallery sample', () => {
    it('generates a complete year without daily-page bloat', () => {
        const sample = expectValidGallerySample(contract.slug, contract);
        const blankNodes = Object.values(sample.nodes).filter((node: any) => !node.data.example_label) as any[];

        expect(blankNodes.filter(node => node.type === 'month_habits')).toHaveLength(12);
        expect(blankNodes.filter(node => node.type === 'week')).toHaveLength(52);
        expect(blankNodes.filter(node => node.type === 'workout')).toHaveLength(104);
        expect(blankNodes.filter(node => node.type === 'recovery')).toHaveLength(12);
        expect(blankNodes.filter(node => node.type === 'month_reflection')).toHaveLength(12);
        expect(exportedPageCount(sample)).toBe(204);
        expect(Object.keys(sample.nodes).length).toBeLessThan(221);
    });

    it('supports a short journal without workout pages', () => {
        const sample = loadGallerySample(contract.slug, {
            monthCount: 1,
            weekCount: 4,
            workoutsPerWeek: 0,
        });
        const blankWorkouts = Object.values(sample.nodes).filter((node: any) =>
            node.type === 'workout' && !node.data.example_label,
        );

        expect(validateGallerySample(sample, { ...contract, pageCount: [15, 30] })).toEqual([]);
        expect(blankWorkouts).toHaveLength(0);
        expect(exportedPageCount(sample)).toBe(19);
    });

    it('keeps maximum configuration and dense navigation in bounds', () => {
        const sample = loadGallerySample(contract.slug, {
            monthCount: 12,
            weekCount: 52,
            workoutsPerWeek: 4,
        });
        const navigator = role(sample, 'workspace', 'navigator');
        const footerRule = role(sample, 'workspace', 'footer_rule');
        const bounds = getElementBounds(navigator, sample.nodes, 'blank_workspace');

        expect(validateGallerySample(sample, { ...contract, pageCount: [300, 315] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(308);
        expect(navigator.gridConfig).toMatchObject({
            cols: 3,
            gridBorderMode: 'all',
            gridBorderStyle: 'solid',
        });
        expect(navigator.stroke).toBe('');
        expect(navigator.strokeWidth).toBe(0);
        expect(navigator.y + bounds.h + 16).toBeLessThanOrEqual(footerRule.y);
    });

    it.each([
        ['monthCount', 0],
        ['monthCount', 13],
        ['weekCount', 3],
        ['weekCount', 53],
        ['workoutsPerWeek', -1],
        ['workoutsPerWeek', 5],
        ['workoutsPerWeek', 1.5],
    ])('rejects unsupported %s configuration %s', (key, value) => {
        expect(() => loadGallerySample(contract.slug, { [key]: value })).toThrow(/Wellbeing Rhythm config/);
    });

    it('keeps all 52 weeks and their workouts in an accessible ordered sequence', () => {
        const sample = loadGallerySample(contract.slug);
        const visitedWeeks: any[] = [];
        const visitedWorkouts: any[] = [];

        for (let month = 1; month <= 12; month += 1) {
            const monthId = `blank_month_${String(month).padStart(2, '0')}`;
            let current = sample.nodes[sample.nodes[monthId].children[0]];

            while (current.type === 'week' || current.type === 'workout') {
                if (current.type === 'week') visitedWeeks.push(current);
                else visitedWorkouts.push(current);
                expect(current.children).toHaveLength(1);
                current = sample.nodes[current.children[0]];
            }

            expect(current.type).toBe('recovery');
            expect(sample.nodes[current.children[0]].type).toBe('month_reflection');
        }

        expect(visitedWeeks.map(node => node.data.week_number)).toEqual(
            Array.from({ length: 52 }, (_, index) => index + 1),
        );
        expect(visitedWorkouts).toHaveLength(104);
        expect(visitedWorkouts.every(node => node.children.length === 1)).toBe(true);
        expect(role(sample, 'week', 'continue')).toMatchObject({ linkTarget: 'child_index', linkValue: '0' });
        expect(role(sample, 'workout', 'continue')).toMatchObject({ linkTarget: 'child_index', linkValue: '0' });
        expect(role(sample, 'recovery', 'continue')).toMatchObject({ linkTarget: 'child_index', linkValue: '0' });
        expect(role(sample, 'month_reflection', 'workspace')).toMatchObject({
            linkTarget: 'specific_node',
            linkValue: 'blank_workspace',
        });
    });

    it('shows one balanced guided week without medical claims', () => {
        const sample = loadGallerySample(contract.slug);
        const guidedWeek = sample.nodes.example_week;
        const guidedWorkouts = guidedWeek.children
            .map((id: string) => sample.nodes[id])
            .filter((node: any) => node.type === 'workout');
        const exampleSource = JSON.stringify(
            Object.values(sample.nodes)
                .filter((node: any) => node.data.example_label === 'EXAMPLE')
                .map((node: any) => node.data),
        );

        expect(guidedWeek.data).toMatchObject({
            sleep_rhythm: 'Wind-down by 10:30',
            hydration: 'Bottle at desk; refill twice',
            walking: 'Three easy walks',
            energy: 'Steady, 3 / 5',
            recovery_note: 'Friday stayed gentle after a busy Thursday.',
        });
        expect(guidedWorkouts).toHaveLength(1);
        expect(sample.nodes[guidedWorkouts[0].children[0]].type).toBe('workout');
        expect(exampleSource).not.toMatch(/diagnos|treat|cure|prescri|medical advice/i);
    });

    it('keeps blank writable data empty', () => {
        const sample = loadGallerySample(contract.slug);
        const writablePatterns = [
            /^(intention|current_rhythm|support|movement_focus|energy_note|recovery_note)$/,
            /^(day|movement|energy|note)_\d+$/,
            /^habit_\d+_day_\d+$/,
            /^(movement|sets|reps|load|rpe|notes)_\d+$/,
            /^(restored|felt_heavy|adjustment|energy_pattern|recovery_pattern)$/,
            /^(win|lesson|carry_forward)$/,
        ];

        Object.values(sample.nodes)
            .filter((node: any) => node.id.startsWith('blank_'))
            .forEach((node: any) => {
                Object.entries(node.data).forEach(([field, value]) => {
                    if (writablePatterns.some(pattern => pattern.test(field))) {
                        expect(value, `${node.id}.${field}`).toBe('');
                    }
                });
            });
    });

    it('draws habit and workout table edges once with explicit single borders', () => {
        const sample = loadGallerySample(contract.slug);

        ['month_habits', 'week', 'workout'].forEach(templateId => {
            const elements = sample.templates[templateId].elements;
            const cells = elements.filter((element: any) =>
                element.type === 'rect' && element.id.includes('_table_cell_'),
            );
            const boundaries = elements.filter((element: any) =>
                element.type === 'rect' && element.id.includes('_table_boundary_'),
            );
            const lines = elements.filter((element: any) =>
                element.type === 'rect' && element.id.includes('_table_line_'),
            );
            const segments = lines.map((line: any) => `${line.x}:${line.y}:${line.w}:${line.h}`);

            expect(cells.length, `${templateId} cells`).toBeGreaterThan(0);
            expect(boundaries.length, `${templateId} boundaries`).toBeGreaterThan(0);
            expect(lines.length, `${templateId} lines`).toBeGreaterThan(0);
            cells.forEach((cell: any) => {
                expect(cell.stroke, cell.id).toBe('');
                expect(cell.strokeWidth, cell.id).toBe(0);
            });
            boundaries.forEach((boundary: any) => {
                expect(boundary).toMatchObject({ stroke: '#9b978f', strokeWidth: 0.8 });
            });
            expect(new Set(segments).size, `${templateId} duplicate shared edges`).toBe(segments.length);
            lines.forEach((line: any) => {
                expect(line.stroke, line.id).toBe('');
                expect(line.strokeWidth, line.id).toBe(0);
                expect(Math.min(line.w, line.h), line.id).toBeGreaterThanOrEqual(0.8);
                expect(Math.min(line.w, line.h), line.id).toBeLessThanOrEqual(1);
            });
        });

        const dayHeaders = sample.templates.month_habits.elements.filter((element: any) =>
            element.type === 'text' && element.id.includes('_day_header_'),
        );
        expect(dayHeaders).toHaveLength(31);
        expect(dayHeaders.every((header: any) => header.fontSize >= 8)).toBe(true);

        const workoutBindings = new Set(sample.templates.workout.elements
            .map((element: any) => element.dataBinding)
            .filter(Boolean));
        ['movement_1', 'sets_1', 'reps_1', 'load_1', 'rpe_1', 'notes_1'].forEach(field => {
            expect(workoutBindings.has(field), field).toBe(true);
        });
    });
});
