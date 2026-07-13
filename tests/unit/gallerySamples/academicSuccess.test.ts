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
    slug: '01-academic-success-system',
    expectedTemplateIds: [
        'cover',
        'start',
        'workspace',
        'semester',
        'course',
        'week',
        'cornell',
        'deck',
        'card_front',
        'card_back',
        'assignments',
        'exam',
    ],
    pageCount: [115, 160],
    palette: ['#496f62', '#bd654f', '#f5f0e5'],
    requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('Academic Success System gallery sample', () => {
    it('generates the complete Study Compass', () => {
        const sample = expectValidGallerySample(contract.slug, contract);
        const exportedPageCount = computePageOrder({ rootId: sample.rootId, nodes: sample.nodes } as any).length;

        expect(contract.pageCount).toEqual([115, 160]);
        expect(exportedPageCount).toBe(132);
    });

    it('supports a one-course minimum without breaking navigation', () => {
        const sample = loadGallerySample(contract.slug, {
            courseCount: 1,
            teachingWeeks: 4,
            notesPerCourse: 1,
            cardsPerCourse: 1,
        });

        expect(validateGallerySample(sample, { ...contract, pageCount: [20, 45] })).toEqual([]);
    });

    it('keeps maximum-config navigation grids clear of following content', () => {
        const sample = loadGallerySample(contract.slug, {
            courseCount: 6,
            teachingWeeks: 18,
            notesPerCourse: 12,
            cardsPerCourse: 20,
        });

        expect(validateGallerySample(sample, { ...contract, pageCount: [350, 380] })).toEqual([]);

        const cases = [
            ['semester', 'blank_semester', 'dashboard', 'dashboard_hint'],
            ['course', 'blank_course_01', 'materials_grid', 'status'],
            ['deck', 'blank_course_01_deck', 'cards', 'method'],
        ] as const;

        cases.forEach(([templateId, nodeId, gridRole, followingRole]) => {
            const elements = sample.templates[templateId].elements;
            const grid = elements.find((element: any) => element.id.includes(`_${gridRole}_`));
            const following = elements.find((element: any) => element.id.includes(`_${followingRole}_`));
            const bounds = getElementBounds(grid, sample.nodes, nodeId);

            expect(grid.y + bounds.h + 12, `${templateId} dense grid clearance`).toBeLessThanOrEqual(following.y);
        });
    });

    it('uses static PDF-visible writable regions for assignments and exams', () => {
        const sample = loadGallerySample(contract.slug);

        ['assignments', 'exam'].forEach(templateId => {
            expect(sample.templates[templateId].elements.some((element: any) => element.type === 'grid')).toBe(false);
        });

        const assignmentRows = sample.templates.assignments.elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_register_row_') && element.strokeWidth > 0,
        );
        const examRegions = sample.templates.exam.elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_review_region_') && element.strokeWidth > 0,
        );

        expect(assignmentRows).toHaveLength(4);
        expect(examRegions).toHaveLength(4);
    });

    it('resolves question-to-answer links from original and referenced cards', () => {
        const sample = loadGallerySample(contract.slug);
        const answerLink = sample.templates.card_front.elements.find((element: any) =>
            element.id.includes('_turn_'),
        );
        const resolveAnswer = (frontId: string) => {
            const front = sample.nodes[frontId];
            const childId = front.children[Number(answerLink.linkValue)];
            const child = sample.nodes[childId];
            return child.referenceId || child.id;
        };

        expect(answerLink).toMatchObject({ linkTarget: 'child_index', linkValue: '0' });
        expect(resolveAnswer('example_card_front')).toBe('example_card_back');
        expect(resolveAnswer('example_note_card_reference')).toBe('example_card_back');
    });

    it('links every blank Cornell note directly to a two-sided revision card', () => {
        const sample = loadGallerySample(contract.slug);
        const blankNotes = Object.values(sample.nodes).filter((node: any) =>
            node.type === 'cornell' && node.id.startsWith('blank_course_'),
        ) as any[];

        expect(blankNotes).toHaveLength(24);
        blankNotes.forEach(note => {
            const frontReference = sample.nodes[note.children[0]];
            expect(frontReference, `${note.id} linked child`).toMatchObject({
                type: 'card_front',
                referenceId: expect.any(String),
            });

            const front = sample.nodes[frontReference.referenceId];
            const answerReference = sample.nodes[frontReference.children[0]];
            expect(answerReference, `${note.id} forward child`).toMatchObject({
                type: 'card_back',
                referenceId: expect.any(String),
            });

            const answer = sample.nodes[answerReference.referenceId];

            expect(front?.type, `${note.id} referenced target type`).toBe('card_front');
            expect(answer?.type, `${note.id} forward target type`).toBe('card_back');
            expect(front.children).toContain(answer.id);
        });
    });
});
