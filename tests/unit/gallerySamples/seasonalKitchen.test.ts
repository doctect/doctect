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
    slug: '05-seasonal-kitchen',
    expectedTemplateIds: [
        'cover', 'start', 'workspace', 'season_index', 'category',
        'recipe', 'meal_plan', 'pantry', 'shopping',
    ],
    pageCount: [78, 105],
    palette: ['#687b55', '#bc6549', '#f3ead9'],
    requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

const exportedPageCount = (sample: ReturnType<typeof loadGallerySample>) =>
    computePageOrder({ rootId: sample.rootId, nodes: sample.nodes } as any).length;

const role = (sample: ReturnType<typeof loadGallerySample>, templateId: string, name: string) =>
    sample.templates[templateId].elements.find((element: any) => element.id.includes(`_${name}_`));

describe('Seasonal Kitchen gallery sample', () => {
    it('generates complete default recipe and planning banks', () => {
        const sample = expectValidGallerySample(contract.slug, contract);
        const blankNodes = Object.values(sample.nodes).filter((node: any) =>
            node.id.startsWith('blank_') && node.referenceId === undefined,
        ) as any[];

        expect(blankNodes.filter(node => node.type === 'category')).toHaveLength(6);
        expect(blankNodes.filter(node => node.type === 'recipe')).toHaveLength(48);
        expect(blankNodes.filter(node => node.type === 'meal_plan')).toHaveLength(12);
        expect(blankNodes.filter(node => node.type === 'shopping')).toHaveLength(12);
        expect(blankNodes.filter(node => node.type === 'pantry')).toHaveLength(1);
        expect(exportedPageCount(sample)).toBe(93);
    });

    it('supports one category, recipe, and planning week', () => {
        const sample = loadGallerySample(contract.slug, {
            categoryCount: 1,
            recipesPerCategory: 1,
            mealPlanWeeks: 1,
        });

        expect(validateGallerySample(sample, { ...contract, pageCount: [14, 30] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(19);
    });

    it('supports maximum banks while keeping every dense index in bounds', () => {
        const sample = loadGallerySample(contract.slug, {
            categoryCount: 8,
            recipesPerCategory: 16,
            mealPlanWeeks: 52,
        });
        const denseNodeIds = Object.values(sample.nodes)
            .filter((node: any) => ['season_index', 'category'].includes(node.type))
            .map((node: any) => node.id);

        expect(validateGallerySample(sample, { ...contract, pageCount: [250, 270] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(258);
        expect(sample.nodes.blank_workspace.children).toHaveLength(6);
        expect(Object.values(sample.nodes).filter((node: any) =>
            node.id.startsWith('blank_plan_index_'),
        )).toHaveLength(4);

        denseNodeIds.forEach(nodeId => {
            const node = sample.nodes[nodeId];
            const navigator = role(sample, node.type, 'navigator');
            const footerRule = role(sample, node.type, 'footer_rule');
            const bounds = getElementBounds(navigator, sample.nodes, nodeId);
            expect(navigator.x + bounds.w, `${nodeId} width`).toBeLessThanOrEqual(509);
            expect(navigator.y + bounds.h + 16, `${nodeId} height`).toBeLessThanOrEqual(footerRule.y);
        });
    });

    it.each([
        ['categoryCount', 0],
        ['categoryCount', 9],
        ['recipesPerCategory', 0],
        ['recipesPerCategory', 17],
        ['mealPlanWeeks', 0],
        ['mealPlanWeeks', 53],
        ['mealPlanWeeks', 2.5],
    ])('rejects unsupported %s configuration %s', (key, value) => {
        expect(() => loadGallerySample(contract.slug, { [key]: value })).toThrow(/Seasonal Kitchen config/);
    });

    it('guides an autumn week through three complete fictional recipes into one combined list', () => {
        const sample = loadGallerySample(contract.slug);
        const recipes = ['example_recipe_squash', 'example_recipe_orzo', 'example_recipe_crumble']
            .map(id => sample.nodes[id]);
        const plan = sample.nodes.example_meal_plan;
        const shopping = sample.nodes.example_shopping;

        expect(recipes).toHaveLength(3);
        recipes.forEach(recipe => {
            expect(recipe.data.fictional_notice).toMatch(/fictional/i);
            ['yield', 'prep', 'cook', 'difficulty', 'ingredients', 'method', 'notes', 'repeat_rating']
                .forEach(field => expect(recipe.data[field], `${recipe.id}.${field}`).toBeTruthy());
        });
        expect(plan.data.recipe_ids).toEqual(recipes.map(recipe => recipe.id));
        expect(plan.children[0]).toBe('example_shopping');
        expect(plan.children.slice(1).map((id: string) => sample.nodes[id].referenceId))
            .toEqual(recipes.map(recipe => recipe.id));
        expect(shopping.data).toMatchObject({
            plan_id: 'example_meal_plan',
            produce_1: '1 small amber squash',
            pantry_1: 'Pearl barley, 250 g',
            chilled_1: 'Feta, 120 g',
            bakery_1: 'Country loaf',
        });
        expect(shopping.data.household_1).toBeTruthy();
    });

    it('keeps every guided page visibly bound to EXAMPLE and Skip chrome', () => {
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
        expect(visited.size).toBeGreaterThanOrEqual(12);
    });

    it('keeps blank recipe, plan, pantry, and shopping values writable and empty', () => {
        const sample = loadGallerySample(contract.slug);
        const writable = /^(yield|prep|cook|difficulty|ingredients|method|notes|repeat_rating|breakfast_\d+|lunch_\d+|dinner_\d+|prep_note|produce_\d+|pantry_\d+|chilled_\d+|bakery_\d+|household_\d+|staple_\d+|freezer_\d+|use_first_\d+)$/;

        Object.values(sample.nodes)
            .filter((node: any) => node.id.startsWith('blank_') && node.referenceId === undefined)
            .forEach((node: any) => {
                Object.entries(node.data).forEach(([field, value]) => {
                    if (writable.test(field)) expect(value, `${node.id}.${field}`).toBe('');
                });
            });
    });

    it('links every recipe, plan, and shopping list without fragile long-bank offsets', () => {
        const sample = loadGallerySample(contract.slug, {
            categoryCount: 8,
            recipesPerCategory: 16,
            mealPlanWeeks: 52,
        });
        const recipes = Object.values(sample.nodes).filter((node: any) =>
            node.id.startsWith('blank_recipe_') && node.type === 'recipe' && node.referenceId === undefined,
        ) as any[];
        const plans = Object.values(sample.nodes).filter((node: any) =>
            node.id.startsWith('blank_meal_plan_'),
        ) as any[];

        recipes.forEach(recipe => {
            const referrers = Object.values(sample.nodes).filter((node: any) => node.referenceId === recipe.id) as any[];
            expect(referrers.length, recipe.id).toBeGreaterThan(0);
            expect(referrers.every(referrer => sample.nodes[referrer.parentId].type === 'meal_plan')).toBe(true);
        });
        plans.forEach(plan => {
            expect(sample.nodes[plan.children[0]].type, plan.id).toBe('shopping');
            expect(sample.nodes[plan.children[0]].data.plan_id, plan.id).toBe(plan.id);
            expect(plan.children.slice(1).every((id: string) => sample.nodes[id].referenceId), plan.id).toBe(true);
        });
        expect(role(sample, 'recipe', 'meal_plan')).toMatchObject({ linkTarget: 'referrer' });
        expect(role(sample, 'meal_plan', 'shopping')).toMatchObject({ linkTarget: 'child_index', linkValue: '0' });
        expect(role(sample, 'meal_plan', 'recipe')).toMatchObject({ linkTarget: 'child_index', linkValue: '1' });
        expect(role(sample, 'shopping', 'plan')).toMatchObject({ linkTarget: 'parent' });
    });

    it('draws intentional grid and meal-table edges exactly once', () => {
        const sample = loadGallerySample(contract.slug);

        Object.values(sample.templates).forEach((template: any) => {
            template.elements.filter((element: any) => element.type === 'grid').forEach((grid: any) => {
                expect(grid.gridConfig.gridBorderMode, grid.id).toBe('all');
                expect(grid.gridConfig.gridBorderStyle, grid.id).toBe('solid');
                expect(grid.gridConfig.gridBorderWidth, grid.id).toBeGreaterThan(0);
                expect(grid.stroke, grid.id).toBe('');
                expect(grid.strokeWidth, grid.id).toBe(0);
            });
        });

        ['meal_plan', 'pantry', 'shopping'].forEach(templateId => {
            const elements = sample.templates[templateId].elements;
            const cells = elements.filter((element: any) => element.type === 'rect' && element.id.includes('_table_cell_'));
            const boundaries = elements.filter((element: any) => element.type === 'rect' && element.id.includes('_table_boundary_'));
            const lines = elements.filter((element: any) => element.type === 'rect' && element.id.includes('_table_line_'));
            const segments = lines.map((line: any) => `${line.x}:${line.y}:${line.w}:${line.h}`);

            expect(cells.length, `${templateId} cells`).toBeGreaterThan(0);
            expect(boundaries.length, `${templateId} boundaries`).toBeGreaterThan(0);
            expect(lines.length, `${templateId} lines`).toBeGreaterThan(0);
            cells.forEach((cell: any) => expect(cell).toMatchObject({ stroke: '', strokeWidth: 0 }));
            boundaries.forEach((boundary: any) => expect(boundary).toMatchObject({ stroke: '#9a927f', strokeWidth: 0.8 }));
            expect(new Set(segments).size, `${templateId} duplicate edges`).toBe(segments.length);
        });
    });

    it('uses original plate-and-leaf artwork', () => {
        const sample = loadGallerySample(contract.slug);
        const artwork = sample.templates.cover.elements.find((element: any) => element.type === 'svg');

        expect(artwork.svgContent).toContain('<circle');
        expect(artwork.svgContent).toContain('<path');
        expect(artwork.svgContent).toMatch(/leaf|Leaf/);
    });
});
