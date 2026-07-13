import { describe, expect, it } from 'vitest';
import { computePageOrder } from '../../../services/pdfService';
import {
    loadGallerySample,
    validateGallerySample,
    type GallerySampleContract,
    type LoadedGallerySample,
} from '../../helpers/gallerySampleHarness';

const contract: GallerySampleContract = {
    slug: '02-work-project-hub',
    expectedTemplateIds: [
        'cover',
        'start',
        'workspace',
        'portfolio',
        'brief',
        'board',
        'meeting_index',
        'meeting',
        'decisions',
        'risks',
        'weekly_review',
        'weekly_review_final',
    ],
    pageCount: [50, 80],
    palette: ['#263f52', '#c79b45', '#eee9dd'],
    requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

const exportedPageCount = (sample: ReturnType<typeof loadGallerySample>) =>
    computePageOrder({ rootId: sample.rootId, nodes: sample.nodes } as any).length;

const validateProjectDesk = (sample: LoadedGallerySample, productContract: GallerySampleContract) =>
    validateGallerySample(sample, productContract);

describe('Work Project Hub gallery sample', () => {
    it('generates the complete Project Desk', () => {
        const sample = loadGallerySample(contract.slug);

        expect(validateProjectDesk(sample, contract)).toEqual([]);
        expect(exportedPageCount(sample)).toBe(64);
    });

    it('supports one compact project', () => {
        const sample = loadGallerySample(contract.slug, {
            projectCount: 1,
            meetingsPerProject: 1,
            reviewWeeks: 4,
        });

        expect(validateProjectDesk(sample, { ...contract, pageCount: [18, 35] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(23);
    });

    it('keeps maximum supported configuration valid', () => {
        const sample = loadGallerySample(contract.slug, {
            projectCount: 6,
            meetingsPerProject: 20,
            reviewWeeks: 52,
        });

        expect(validateProjectDesk(sample, { ...contract, pageCount: [210, 220] })).toEqual([]);
        expect(exportedPageCount(sample)).toBe(215);
    });

    it('links all 52 weekly reviews forward without an active final control', () => {
        const sample = loadGallerySample(contract.slug, {
            projectCount: 1,
            meetingsPerProject: 1,
            reviewWeeks: 52,
        });
        const forward = sample.templates.weekly_review.elements.find((element: any) =>
            element.id.includes('_next_review_'),
        );
        const reviews = Array.from({ length: 52 }, (_, index) =>
            sample.nodes[`blank_review_${String(index + 1).padStart(2, '0')}`],
        );
        const resolveForward = (review: any) =>
            forward?.linkTarget === 'child_index'
                ? sample.nodes[review.children[Number(forward.linkValue)]]
                : undefined;

        expect(forward).toMatchObject({
            type: 'text',
            text: 'NEXT REVIEW →',
            w: 144,
            h: 28,
            opacity: 1,
            linkTarget: 'child_index',
            linkValue: '0',
        });
        reviews.slice(0, -1).forEach((review, index) => {
            expect(review.type, `review ${index + 1} template`).toBe('weekly_review');
            expect(resolveForward(review)?.id, `review ${index + 1} forward target`)
                .toBe(reviews[index + 1].id);
        });
        expect(reviews[51].type).toBe('weekly_review_final');
        expect(reviews[51].children).toEqual([]);
        expect(sample.templates.weekly_review_final.elements.some((element: any) =>
            element.id.includes('_next_review_'),
        )).toBe(false);
    });

    it('uses PDF-visible writable lanes instead of fake board cards', () => {
        const sample = loadGallerySample(contract.slug);
        const elements = sample.templates.board.elements;
        const lanes = elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_lane_') && element.strokeWidth > 0,
        );
        const wipLabels = elements.filter((element: any) =>
            element.type === 'text' && element.id.includes('_wip_'),
        );

        expect(elements.some((element: any) => element.type === 'grid')).toBe(false);
        expect(lanes).toHaveLength(3);
        expect(wipLabels).toHaveLength(3);
    });

    it('connects the example meeting decision to its board action through references', () => {
        const sample = loadGallerySample(contract.slug);
        const meeting = sample.nodes.example_meeting;
        const decisionReference = sample.nodes[meeting.children[0]];
        const decision = sample.nodes[decisionReference.referenceId];
        const boardReference = sample.nodes[decision.children[0]];
        const board = sample.nodes[boardReference.referenceId];
        const meetingLink = sample.templates.meeting.elements.find((element: any) =>
            element.id.includes('_decision_link_'),
        );
        const actionLink = sample.templates.decisions.elements.find((element: any) =>
            element.id.includes('_action_link_'),
        );
        const boardAction = sample.templates.board.elements.find((element: any) =>
            element.dataBinding === 'action',
        );

        expect(decisionReference).toMatchObject({
            type: 'decisions',
            referenceId: 'example_decisions',
        });
        expect(boardReference).toMatchObject({
            type: 'board',
            referenceId: 'example_board',
        });
        expect(meetingLink).toMatchObject({ linkTarget: 'child_index', linkValue: '0' });
        expect(actionLink).toMatchObject({ linkTarget: 'child_index', linkValue: '0' });
        expect(meeting.data.decision_id).toBe(decision.data.decision_id);
        expect(decision.data.action).toBe(board.data.action);
        expect(boardAction).toBeTruthy();
    });
});
