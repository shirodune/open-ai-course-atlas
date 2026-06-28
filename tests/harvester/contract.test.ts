import { describe, it, expect } from 'vitest';
import { offeringSchema } from '../../src/lib/schemas';
import type { ExtractedOffering } from '../../harvester/extractors/contract';

// An ExtractedOffering must be a valid offering once the schema applies its
// defaults (topics -> []). This locks the contract to the real schema.
describe('ExtractedOffering contract', () => {
  it('a well-formed ExtractedOffering passes offeringSchema', () => {
    const sample: ExtractedOffering = {
      course: 'stanford-cs224n',
      year: 2024,
      term: 'Winter',
      instructors: [{ name: 'Chris Manning', role: 'instructor' }],
      frameworks: ['pytorch'],
      sources: [{ url: 'https://web.stanford.edu/class/cs224n/', type: 'official' }],
    };
    const parsed = offeringSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.topics).toEqual([]);
  });
});
