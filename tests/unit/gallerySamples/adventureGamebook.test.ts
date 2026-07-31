import { describe, expect, it } from 'vitest';
import {
    expectValidGallerySample, loadGallerySample, validateGallerySample,
    type GallerySampleContract,
} from '../../helpers/gallerySampleHarness';

const contract: GallerySampleContract = {
  slug: '09-adventure-gamebook',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'section', 'ending', 'tracking', 'story_map', 'branch_planner', 'blank_section'],
  pageCount: [70, 90],
  palette: ['#3f3a33', '#7c5c3a', '#efe7d6'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

const choiceDestinations = (sample: any, node: any): string[] => node.children
  .map((id: string) => sample.nodes[id])
  .filter((child: any) => child?.referenceId)
  .map((child: any) => child.referenceId);

describe('09-adventure-gamebook', () => {
  it('generates The Branching Road', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('tells a fully reachable story with five endings and a loop', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const sections = Object.values(sample.nodes).filter((n: any) =>
      !n.referenceId && (n.type === 'section' || n.type === 'ending'));
    expect(sections).toHaveLength(50);
    expect(sections.filter((n: any) => n.type === 'ending')).toHaveLength(5);

    const inbound = new Map<string, number>();
    const visited = new Set<string>();
    const queue = ['section_001'];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const dest of choiceDestinations(sample, sample.nodes[id])) {
        inbound.set(dest, (inbound.get(dest) ?? 0) + 1);
        queue.push(dest);
      }
    }
    expect(visited.size).toBe(50);
    sections.forEach((n: any) => {
      const choices = choiceDestinations(sample, n);
      if (n.type === 'ending') expect(choices).toHaveLength(0);
      else expect(choices.length).toBeGreaterThanOrEqual(1);
    });
    expect([...inbound.values()].some(count => count >= 2)).toBe(true);
  });

  it('supports a smaller authoring kit', () => {
    const sample = loadGallerySample(contract.slug, { blankSectionCount: 8 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [58, 78] })).toEqual([]);
  });
});
