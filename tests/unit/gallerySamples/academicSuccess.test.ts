import { describe, expect, it } from 'vitest';
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
        expectValidGallerySample(contract.slug, contract);
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
});
