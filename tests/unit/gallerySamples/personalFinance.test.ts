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
    slug: '03-personal-finance-planner',
    expectedTemplateIds: [
        'cover',
        'start',
        'workspace',
        'annual',
        'month',
        'transactions',
        'category_review',
        'sinking_funds',
        'goal',
        'year_review',
    ],
    pageCount: [58, 78],
    palette: ['#29483d', '#b68a4c', '#f4eddf'],
    requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

const exportedPageCount = (sample: ReturnType<typeof loadGallerySample>) =>
    computePageOrder({ rootId: sample.rootId, nodes: sample.nodes } as any).length;

const findRole = (sample: ReturnType<typeof loadGallerySample>, templateId: string, role: string) =>
    sample.templates[templateId].elements.find((element: any) => element.id.includes(`_${role}_`));

describe('Personal Finance Planner gallery sample', () => {
    it('generates all twelve blank months and a guided January', () => {
        const sample = expectValidGallerySample(contract.slug, contract);
        const blankMonths = Object.values(sample.nodes).filter((node: any) =>
            node.type === 'month' && !node.data.example_label,
        ) as any[];
        const guidedMonths = Object.values(sample.nodes).filter((node: any) =>
            node.type === 'month' && node.data.example_label === 'EXAMPLE',
        ) as any[];

        expect(blankMonths).toHaveLength(12);
        expect(blankMonths.map(node => node.data.month)).toEqual([
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December',
        ]);
        expect(guidedMonths).toHaveLength(1);
        expect(guidedMonths[0]).toMatchObject({ id: 'example_january', data: { month: 'January' } });
        expect(exportedPageCount(sample)).toBe(66);
    });

    it('supports minimum transaction and goal banks', () => {
        const sample = loadGallerySample(contract.slug, { transactionPagesPerMonth: 1, goalCount: 1 });

        expect(validateGallerySample(sample, { ...contract, pageCount: [45, 65] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(51);
    });

    it('keeps maximum configuration and its dense annual navigator in bounds', () => {
        const sample = loadGallerySample(contract.slug, { transactionPagesPerMonth: 4, goalCount: 8 });

        expect(validateGallerySample(sample, { ...contract, pageCount: [90, 100] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(94);

        const navigator = sample.templates.annual.elements.find((element: any) =>
            element.type === 'grid' && element.id.includes('_navigator_'),
        );
        const footerRule = findRole(sample, 'annual', 'footer_rule');
        const bounds = getElementBounds(navigator, sample.nodes, 'blank_annual');

        expect(navigator.gridConfig).toMatchObject({
            cols: 3,
            gridBorderMode: 'all',
            gridBorderStyle: 'solid',
        });
        expect(navigator.y + bounds.h + 16).toBeLessThanOrEqual(footerRule.y);
    });

    it.each([
        ['transactionPagesPerMonth', 0],
        ['transactionPagesPerMonth', 5],
        ['goalCount', 0],
        ['goalCount', 9],
        ['goalCount', 1.5],
    ])('rejects unsupported %s configuration %s', (key, value) => {
        expect(() => loadGallerySample(contract.slug, { [key]: value })).toThrow(/Money Map config/);
    });

    it('uses explicit single-stroke cells and static PDF-visible writing tables', () => {
        const sample = loadGallerySample(contract.slug);
        const writableTemplates = [
            'month', 'transactions', 'category_review', 'sinking_funds', 'goal', 'year_review',
        ];

        writableTemplates.forEach(templateId => {
            const elements = sample.templates[templateId].elements;
            const cells = elements.filter((element: any) =>
                element.type === 'rect' && element.id.includes('_table_cell_'),
            );

            expect(elements.some((element: any) => element.type === 'grid'), templateId).toBe(false);
            expect(cells.length, `${templateId} static cells`).toBeGreaterThan(0);
            cells.forEach((cell: any) => {
                expect(cell.strokeWidth, cell.id).toBe(0.8);
                expect(cell.stroke, cell.id).toBe('#89978f');
            });
        });

        const transactionElements = sample.templates.transactions.elements;
        const headers = transactionElements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_table_cell_header_'),
        );
        const amountFields = transactionElements.filter((element: any) =>
            typeof element.dataBinding === 'string' && element.dataBinding.startsWith('amount_'),
        );

        expect(headers).toHaveLength(4);
        expect(headers.every((header: any) => header.fill === '#29483d')).toBe(true);
        expect(amountFields).toHaveLength(8);
        expect(new Set(amountFields.map((field: any) => field.x))).toEqual(new Set([390]));
        expect(amountFields.every((field: any) => field.align === 'right')).toBe(true);
    });

    it('marks guided January as fictional while covering a realistic household plan', () => {
        const sample = loadGallerySample(contract.slug);
        const month = sample.nodes.example_january;

        expect(month.data.fictional_notice).toMatch(/fictional/i);
        expect(month.data).toMatchObject({
            planned_income: '$4,850',
            housing: '$1,650',
            food: '$620',
            transport: '$310',
            leisure: '$240',
            savings: '$900',
        });
        expect(sample.nodes.example_transactions.data.description_1).toBe('Apartment rent');
        expect(sample.nodes.example_transactions.data.amount_1).toBe('$1,650.00');
    });

    it('keeps blank financial fields empty instead of shipping fake user data', () => {
        const sample = loadGallerySample(contract.slug);
        const blankNodes = Object.values(sample.nodes).filter((node: any) =>
            node.id.startsWith('blank_') && !['blank_workspace', 'blank_annual'].includes(node.id),
        ) as any[];
        const writableField = /^(planned_|actual_|difference_|date_|description_|amount_|target_|saved_|next_|reflection|wins|lesson|goal_)/;

        blankNodes.forEach(node => {
            Object.entries(node.data)
                .filter(([key]) => writableField.test(key))
                .forEach(([key, value]) => expect(value, `${node.id}.${key}`).toBe(''));
        });
    });

    it('resolves month-to-transaction-to-review workflow and annual sections', () => {
        const sample = loadGallerySample(contract.slug);
        const openLog = findRole(sample, 'month', 'open_log');
        const continueLink = findRole(sample, 'transactions', 'continue');
        const annualChildren = sample.nodes.blank_annual.children.map((id: string) => sample.nodes[id]);

        expect(openLog).toMatchObject({ linkTarget: 'child_index', linkValue: '0' });
        expect(continueLink).toMatchObject({ linkTarget: 'child_index', linkValue: '0' });
        expect(annualChildren.filter((node: any) => node.type === 'month')).toHaveLength(12);
        expect(annualChildren.filter((node: any) => node.type === 'sinking_funds')).toHaveLength(1);
        expect(annualChildren.filter((node: any) => node.type === 'goal')).toHaveLength(4);
        expect(annualChildren.filter((node: any) => node.type === 'year_review')).toHaveLength(1);

        annualChildren.filter((node: any) => node.type === 'month').forEach((month: any) => {
            let current = sample.nodes[month.children[0]];
            let transactionCount = 0;
            while (current.type === 'transactions') {
                transactionCount += 1;
                current = sample.nodes[current.children[0]];
            }
            expect(transactionCount, month.id).toBe(2);
            expect(current.type, month.id).toBe('category_review');
        });
    });

    it('uses abstract ring-and-path artwork without currency-brand imagery', () => {
        const sample = loadGallerySample(contract.slug);
        const artwork = sample.templates.cover.elements.find((element: any) => element.type === 'svg');

        expect(artwork.svgContent).toContain('<circle');
        expect(artwork.svgContent).toContain('<path');
        expect(artwork.svgContent).not.toMatch(/[$€£¥]/);
    });
});
