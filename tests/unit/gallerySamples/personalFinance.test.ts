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
        'bills',
        'transactions',
        'category_review',
        'sinking_funds',
        'goal',
        'year_review',
    ],
    pageCount: [58, 80],
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
        expect(exportedPageCount(sample)).toBe(68);
    });

    it('supports minimum transaction and goal banks', () => {
        const sample = loadGallerySample(contract.slug, { transactionPagesPerMonth: 1, goalCount: 1 });

        expect(validateGallerySample(sample, { ...contract, pageCount: [45, 65] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(53);
    });

    it('keeps maximum configuration and its dense annual navigator in bounds', () => {
        const sample = loadGallerySample(contract.slug, { transactionPagesPerMonth: 4, goalCount: 8 });

        expect(validateGallerySample(sample, { ...contract, pageCount: [90, 100] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(96);

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
        expect(navigator.stroke).toBe('');
        expect(navigator.strokeWidth).toBe(0);
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

    it('draws each static table edge once without stroked cell rectangles', () => {
        const sample = loadGallerySample(contract.slug);
        const tableTemplates = [
            'annual', 'month', 'bills', 'transactions', 'category_review', 'sinking_funds', 'goal', 'year_review',
        ];

        tableTemplates.forEach(templateId => {
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

            expect(cells.length, `${templateId} static cells`).toBeGreaterThan(0);
            cells.forEach((cell: any) => {
                expect(cell.strokeWidth, cell.id).toBe(0);
                expect(cell.stroke, cell.id).toBe('');
            });
            expect(boundaries, `${templateId} outer boundary`).toHaveLength(1);
            expect(boundaries[0]).toMatchObject({ stroke: '#89978f', strokeWidth: 0.8 });
            expect(lines.length, `${templateId} internal lines`).toBeGreaterThan(0);
            expect(new Set(segments).size, `${templateId} duplicate line segments`).toBe(segments.length);
            lines.forEach((line: any) => {
                expect(line.strokeWidth, line.id).toBe(0);
                expect(line.stroke, line.id).toBe('');
                expect(Math.min(line.w, line.h), line.id).toBeGreaterThanOrEqual(0.8);
                expect(Math.min(line.w, line.h), line.id).toBeLessThanOrEqual(1);
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

    it('keeps every explicit writable blank field empty', () => {
        const sample = loadGallerySample(contract.slug);
        const ranges = (prefixes: string[], count: number) =>
            Array.from({ length: count }, (_, index) => prefixes.map(prefix => `${prefix}_${index + 1}`)).flat();
        const categories = ['housing', 'food', 'transport', 'leisure', 'savings', 'other'];
        const categoryAmounts = categories.flatMap(category => [
            `planned_${category}`, `actual_${category}`, `difference_${category}`,
        ]);
        const quarterAmounts = Array.from({ length: 4 }, (_, index) =>
            ['planned_q', 'actual_q', 'difference_q'].map(prefix => `${prefix}${index + 1}`),
        ).flat();
        const writableFieldsByType: Record<string, string[]> = {
            annual: quarterAmounts,
            month: [
                'fictional_notice', 'planned_income', 'actual_income', 'month_intention',
                'housing', 'food', 'transport', 'leisure', 'savings', ...categoryAmounts,
            ],
            bills: [...ranges(['bill', 'due', 'amount'], 8), 'audit_note'],
            transactions: ranges(['date', 'description', 'category', 'amount'], 8),
            category_review: [...categoryAmounts, 'reflection'],
            sinking_funds: [...ranges(['fund', 'target', 'saved', 'next'], 6), 'next_check'],
            goal: ['goal_name', 'target_summary', 'goal_why', ...ranges(['milestone', 'target', 'saved', 'next'], 5)],
            year_review: [
                'planned_income', 'actual_income', 'planned_spending', 'actual_spending',
                'planned_savings', 'actual_savings', 'planned_debt', 'actual_debt',
                'wins', 'lesson', 'reflection',
            ],
        };
        const nonWritableBindings = new Set([
            'example_label', 'skip_label', 'title', 'subtitle',
            'quarter_1', 'quarter_2', 'quarter_3', 'quarter_4',
            'category_housing', 'category_food', 'category_transport',
            'category_leisure', 'category_savings', 'category_other',
            'review_lens_income', 'review_lens_spending', 'review_lens_savings', 'review_lens_debt',
            'nav_prev_label', 'nav_next_label', 'continue_label',
        ]);
        const unboundSummaryFields = new Set(['housing', 'food', 'transport', 'leisure', 'savings']);

        Object.entries(writableFieldsByType).forEach(([type, writableFields]) => {
            const boundWritableFields = sample.templates[type].elements
                .map((element: any) => element.dataBinding)
                .filter((field: unknown): field is string => typeof field === 'string' && !nonWritableBindings.has(field));
            const expectedBindings = writableFields.filter(field => !unboundSummaryFields.has(field));

            expect(new Set(boundWritableFields), `${type} writable bindings`)
                .toEqual(new Set(expectedBindings));

            Object.values(sample.nodes)
                .filter((node: any) => node.id.startsWith('blank_') && node.type === type)
                .forEach((node: any) => {
                    writableFields.forEach(field => {
                        expect(node.data[field], `${node.id}.${field}`).toBe('');
                    });
                });
        });
    });

    it('resolves flat month workflow, annual sections, and sequence navigation', () => {
        const sample = loadGallerySample(contract.slug);
        const openLog = findRole(sample, 'month', 'open_log');
        const continueLink = findRole(sample, 'transactions', 'continue');
        const reviewPrev = findRole(sample, 'category_review', 'nav_prev');
        const monthPrev = findRole(sample, 'month', 'nav_prev');
        const monthNext = findRole(sample, 'month', 'nav_next');
        const annualChildren = sample.nodes.blank_annual.children.map((id: string) => sample.nodes[id]);

        expect(openLog).toMatchObject({ linkTarget: 'child_index', linkValue: '0' });
        expect(continueLink).toMatchObject({
            linkTarget: 'sibling', linkValue: '1', dataBinding: 'continue_label',
        });
        expect(reviewPrev).toMatchObject({
            linkTarget: 'sibling', linkValue: '-1', dataBinding: 'nav_prev_label',
        });
        expect(monthPrev).toMatchObject({ linkTarget: 'sibling', linkValue: '-1', dataBinding: 'nav_prev_label' });
        expect(monthNext).toMatchObject({ linkTarget: 'sibling', linkValue: '1', dataBinding: 'nav_next_label' });
        expect(annualChildren.filter((node: any) => node.type === 'month')).toHaveLength(12);
        expect(annualChildren.filter((node: any) => node.type === 'sinking_funds')).toHaveLength(1);
        expect(annualChildren.filter((node: any) => node.type === 'goal')).toHaveLength(4);
        expect(annualChildren.filter((node: any) => node.type === 'year_review')).toHaveLength(1);

        annualChildren.filter((node: any) => node.type === 'month').forEach((month: any) => {
            const children = month.children.map((id: string) => sample.nodes[id]);
            expect(children.map((child: any) => child.type), month.id)
                .toEqual(['transactions', 'transactions', 'category_review']);
            expect(children[0].data.continue_label, month.id).toBe('LOG 02 »');
            expect(children[1].data.continue_label, month.id).toBe('REVIEW »');
            expect(children[2].data.nav_prev_label, month.id).toBe('« LOG 02');
        });

        const months = annualChildren.filter((node: any) => node.type === 'month');
        expect(months[0].data.nav_prev_label).toBe('');
        expect(months[0].data.nav_next_label).toBe('FEB »');
        expect(months[11].data.nav_prev_label).toBe('« NOV');
        expect(months[11].data.nav_next_label).toBe('BILLS »');
        expect(sample.nodes.blank_sinking_funds.data.nav_prev_label).toBe('« BILLS');
        expect(sample.nodes.blank_sinking_funds.data.nav_next_label).toBe('GOAL 01 »');
        expect(sample.nodes.blank_goal_01.data.nav_prev_label).toBe('« FUNDS');
        expect(sample.nodes.blank_goal_04.data.nav_next_label).toBe('YEAR REVIEW »');
        expect(sample.nodes.blank_year_review.data.nav_prev_label).toBe('« GOAL 04');
        expect(sample.nodes.blank_year_review.data.nav_next_label).toBe('');
        expect(sample.nodes.example_january.data.nav_next_label).toBe('BILLS »');
        expect(sample.nodes.example_transactions.data.continue_label).toBe('REVIEW »');
        expect(sample.nodes.example_category_review.data.nav_prev_label).toBe('« LOG 01');
    });

    it('uses abstract ring-and-path artwork without currency-brand imagery', () => {
        const sample = loadGallerySample(contract.slug);
        const artwork = sample.templates.cover.elements.find((element: any) => element.type === 'svg');

        expect(artwork.svgContent).toContain('<circle');
        expect(artwork.svgContent).toContain('<path');
        expect(artwork.svgContent).not.toMatch(/[$€£¥]/);
    });

    it('adds a recurring-bills register with paid-month ticks and a goal progress track', () => {
        const sample = loadGallerySample(contract.slug);
        const bills = sample.nodes.blank_bills;
        const annualChildren = sample.nodes.blank_annual.children;

        expect(bills).toMatchObject({ type: 'bills', parentId: 'blank_annual' });
        expect(annualChildren.indexOf('blank_bills')).toBe(12);
        expect(annualChildren.indexOf('blank_sinking_funds')).toBe(13);
        expect(bills.data).toMatchObject({
            nav_prev_label: '« DEC', nav_next_label: 'FUNDS »', bill_1: '', audit_note: '',
        });
        expect(sample.nodes.example_bills).toMatchObject({ parentId: 'example_annual', type: 'bills' });
        expect(sample.nodes.example_bills.data.bill_1).toBe('Internet (fictional)');
        expect(sample.nodes.example_annual.children.indexOf('example_bills')).toBe(1);

        const ticks = sample.templates.bills.elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_tick_'),
        );
        expect(ticks).toHaveLength(96);
        ticks.forEach((tick: any) => {
            expect(tick.w, tick.id).toBe(12);
            expect(tick.h, tick.id).toBe(12);
            expect(tick).toMatchObject({ fill: '#fbf8ef', stroke: '#89978f', strokeWidth: 0.8 });
        });

        const monthInitials = sample.templates.bills.elements.filter((element: any) =>
            element.type === 'text' && element.id.includes('_tick_head_'),
        );
        expect(monthInitials.map((initial: any) => initial.text).join('')).toBe('JFMAMJJASOND');

        const segments = sample.templates.goal.elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_progress_seg_'),
        );
        expect(segments).toHaveLength(10);
        segments.forEach((segment: any) => {
            expect(segment).toMatchObject({ fill: '#fbf8ef', stroke: '#29483d', strokeWidth: 0.8, h: 14 });
        });
    });
});
